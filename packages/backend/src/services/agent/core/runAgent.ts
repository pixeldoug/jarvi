/**
 * Unified agent run loop.
 *
 * Handles both streaming (web — token-by-token via `onText`) and
 * non-streaming (WhatsApp — final text only) modes through `profile.transport`.
 * The model interaction, tool dispatch, and message-history bookkeeping are
 * identical between the two; only the OpenAI client call differs.
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';
import { findRecentDuplicateTitle } from './guardrails';
import { executeToolCall, getToolsForChannel } from './tools';
import type {
  AgentCallbacks,
  AgentContext,
  AgentRunResult,
  ChannelProfile,
} from './types';

const AGENT_MODEL = 'gpt-5.4-mini';
const MAX_ITERATIONS = 5;
const MAX_TOKENS_STREAM = 4096;
const MAX_TOKENS_SINGLE = 1024;

// Optional determinism knobs, off in production (env unset). The eval CI sets
// AGENT_SEED to make run-to-run comparisons stable; AGENT_TEMPERATURE is also
// honored when set, but only set it for models that accept a custom value.
function parseEnvNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getDeterminismParams(): { temperature?: number; seed?: number } {
  const params: { temperature?: number; seed?: number } = {};
  const temperature = parseEnvNumber(process.env.AGENT_TEMPERATURE);
  const seed = parseEnvNumber(process.env.AGENT_SEED);
  if (temperature !== undefined) params.temperature = temperature;
  if (seed !== undefined) params.seed = seed;
  return params;
}

// Retry/backoff for transient OpenAI failures (rate limits / 5xx). We disable
// the SDK's built-in retries (maxRetries: 0) and handle them here so we can
// honor the `retry-after` headers AND emit observability for rate limiting.
const MAX_OPENAI_RETRIES = 4;
const BACKOFF_BASE_MS = 500;

let openaiClient: OpenAI | null = null;
const getOpenAIClient = (): OpenAI => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  }
  return openaiClient;
};

// ---------------------------------------------------------------------------
// Resilience: retry with exponential backoff + jitter
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Read a header value tolerating both web `Headers` and plain objects. */
function readHeader(headers: unknown, key: string): string | undefined {
  if (!headers) return undefined;
  const maybeGet = (headers as { get?: (k: string) => string | null }).get;
  if (typeof maybeGet === 'function') {
    return maybeGet.call(headers, key) ?? undefined;
  }
  return (headers as Record<string, string>)[key];
}

export function isRateLimitError(err: unknown): boolean {
  return (err as { status?: number })?.status === 429;
}

function getErrorMessage(err: unknown): string {
  const e = err as { error?: { message?: string }; message?: string };
  return e?.error?.message ?? e?.message ?? '';
}

/**
 * A 429 caused by a single request exceeding the per-minute token limit
 * ("Request too large"). Unlike a transient rate limit, retrying the SAME
 * oversized request will always fail, so this must NOT be retried — and it
 * deserves a different, honest user-facing message.
 */
export function isRequestTooLargeError(err: unknown): boolean {
  if ((err as { status?: number })?.status !== 429) return false;
  return getErrorMessage(err).toLowerCase().includes('request too large');
}

function isRetryableError(err: unknown): boolean {
  // An oversized single request will never succeed on retry.
  if (isRequestTooLargeError(err)) return false;
  const status = (err as { status?: number })?.status;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;
  const code = (err as { code?: string })?.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED';
}

/** Returns the server-advised wait in ms (retry-after-ms / retry-after), if any. */
function getRetryAfterMs(err: unknown): number | null {
  const headers = (err as { headers?: unknown })?.headers;
  const ms = readHeader(headers, 'retry-after-ms');
  if (ms) {
    const n = Number(ms);
    if (!Number.isNaN(n)) return n;
  }
  const secs = readHeader(headers, 'retry-after');
  if (secs) {
    const n = Number(secs);
    if (!Number.isNaN(n)) return n * 1000;
  }
  return null;
}

/**
 * Structured log emitted whenever the OpenAI API rate-limits us. Shaped as a
 * single `ai_rate_limited` event so it can be shipped to PostHog / a log
 * aggregator later without changing the call sites.
 */
function recordRateLimit(
  err: unknown,
  meta: { channel: string; userId: string; attempt: number; willRetry: boolean },
): void {
  const headers = (err as { headers?: unknown })?.headers;
  console.warn(
    '[ai_rate_limited] %s',
    JSON.stringify({
      event: 'ai_rate_limited',
      model: AGENT_MODEL,
      channel: meta.channel,
      userId: meta.userId,
      attempt: meta.attempt,
      willRetry: meta.willRetry,
      remainingTokens: readHeader(headers, 'x-ratelimit-remaining-tokens'),
      remainingRequests: readHeader(headers, 'x-ratelimit-remaining-requests'),
      resetTokens: readHeader(headers, 'x-ratelimit-reset-tokens'),
      retryAfterMs: getRetryAfterMs(err),
    }),
  );
}

/**
 * Invoke an OpenAI call with retry + exponential backoff (with jitter),
 * honoring the server's `retry-after` headers. Rate-limit hits are recorded
 * for observability on every attempt.
 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  meta: { channel: string; userId: string },
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const retryable = isRetryableError(err);
      const willRetry = retryable && attempt < MAX_OPENAI_RETRIES;

      if (isRateLimitError(err)) {
        recordRateLimit(err, { ...meta, attempt, willRetry });
      }

      if (!willRetry) throw err;

      const exponential = BACKOFF_BASE_MS * 2 ** attempt;
      const jitter = Math.random() * BACKOFF_BASE_MS;
      const delay = Math.max(getRetryAfterMs(err) ?? 0, exponential) + jitter;
      await sleep(delay);
      attempt++;
    }
  }
}

export interface RunAgentOptions {
  /** Force `tool_choice: 'required'` on the first iteration (anti-hallucination retry). */
  forceToolChoice?: boolean;
}

export async function runAgent(
  profile: ChannelProfile,
  ctx: AgentContext,
  systemPrompt: string,
  initialMessages: ChatCompletionMessageParam[],
  callbacks: AgentCallbacks,
  options: RunAgentOptions = {},
): Promise<AgentRunResult> {
  const openai = getOpenAIClient();
  const tools = getToolsForChannel(profile);
  const determinismParams = getDeterminismParams();

  let messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...initialMessages,
  ];

  let finalText = '';
  const toolCallNames: string[] = [];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const toolChoice =
      options.forceToolChoice && iteration === 0 ? 'required' : 'auto';

    let textContent = '';
    let pendingToolCalls: Array<{ id: string; name: string; args: string }> = [];
    let finishReason: string | null = null;

    if (profile.transport === 'stream') {
      const stream = await callWithRetry(
        () =>
          openai.chat.completions.create({
            model: AGENT_MODEL,
            messages,
            tools,
            tool_choice: toolChoice,
            stream: true,
            max_completion_tokens: MAX_TOKENS_STREAM,
            ...determinismParams,
          }),
        { channel: profile.id, userId: ctx.userId },
      );

      const indexed = new Map<number, { id: string; name: string; args: string }>();

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;
        if (delta?.content) {
          textContent += delta.content;
          callbacks.onText?.(delta.content);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            let acc = indexed.get(idx);
            if (!acc) {
              acc = { id: '', name: '', args: '' };
              indexed.set(idx, acc);
            }
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) acc.args += tc.function.arguments;
          }
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }

      pendingToolCalls = Array.from(indexed.values()).filter((tc) => tc.id && tc.name);
    } else {
      const response = await callWithRetry(
        () =>
          openai.chat.completions.create({
            model: AGENT_MODEL,
            messages,
            tools,
            tool_choice: toolChoice,
            max_completion_tokens: MAX_TOKENS_SINGLE,
            ...determinismParams,
          }),
        { channel: profile.id, userId: ctx.userId },
      );

      const choice = response.choices[0];
      const message = choice?.message;
      finishReason = choice?.finish_reason ?? null;
      textContent = message?.content?.trim() ?? '';

      pendingToolCalls = (message?.tool_calls ?? [])
        .filter(
          (tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function',
        )
        .map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          args: tc.function.arguments ?? '',
        }));

      console.log(
        '[Agent:%s] iteration=%d finish=%s tools=%s userId=%s',
        profile.id,
        iteration,
        finishReason,
        pendingToolCalls.map((tc) => `${tc.name}(${tc.args})`).join(', ') || 'none',
        ctx.userId,
      );
    }

    if (textContent) finalText = textContent;

    if (pendingToolCalls.length === 0) break;
    if (profile.transport === 'stream' && finishReason !== 'tool_calls') break;

    messages = [
      ...messages,
      {
        role: 'assistant',
        content: textContent || null,
        tool_calls: pendingToolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.args || '{}' },
        })),
      },
    ];

    const toolResultMessages: ChatCompletionToolMessageParam[] = [];

    for (const tc of pendingToolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = tc.args ? JSON.parse(tc.args) : {};
      } catch {
        parsedArgs = {};
      }

      callbacks.onToolCall?.(tc.name, parsedArgs);

      let result;
      if (tc.name === 'create_task' && profile.enableDedup) {
        const title = String(parsedArgs.title ?? '').trim();
        const duplicateId = await findRecentDuplicateTitle(ctx.userId, title, profile);
        if (duplicateId) {
          console.warn(
            '[Agent:%s] Dedup — skipping duplicate create_task title=%s userId=%s existingId=%s',
            profile.id,
            title,
            ctx.userId,
            duplicateId,
          );
          result = {
            success: true as const,
            data: {
              id: duplicateId,
              title,
              duplicate: true,
              pending: profile.taskCreationTarget === 'pending_tasks',
            },
          };
        } else {
          result = await executeToolCall(tc.name, parsedArgs, ctx, profile);
        }
      } else {
        result = await executeToolCall(tc.name, parsedArgs, ctx, profile);
      }

      callbacks.onToolResult?.(tc.name, result.success, result.data);
      toolCallNames.push(tc.name);

      toolResultMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }

    messages = [...messages, ...toolResultMessages];

    callbacks.onSeparator?.();
  }

  return { text: finalText, toolCallNames };
}
