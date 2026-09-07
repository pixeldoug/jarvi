/**
 * Unified agent run loop.
 *
 * Handles both streaming (web — token-by-token via `onText`) and
 * non-streaming (WhatsApp — final text only) modes through `profile.transport`.
 * The model interaction, tool dispatch, and message-history bookkeeping are
 * identical between the two; only the OpenAI client call differs.
 */

import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { PostHogOpenAI } from '@posthog/ai/openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';
import { captureServer, getPostHogClient, isEvalAnalyticsDistinctId } from '../../posthogService';
import { findRecentDuplicateTitle } from './guardrails';
import { PROMPT_VERSION } from './prompt';
import { executeToolCall, getToolDefinition, getToolsForChannel } from './tools';
import {
  buildConfirmation,
  collectPendingQuestions,
  filterModelText,
  gateContextFor,
  isWriteTool,
  NOTHING_CHANGED_FALLBACK,
  SentenceGate,
  tidy,
} from './confirmations';
import { formatValidationIssues, validateToolArguments } from './toolValidation';
import type {
  AgentCallbacks,
  AgentContext,
  AgentOperation,
  AgentRunReliability,
  AgentRunResult,
  AgentTurnUsage,
  ChannelProfile,
  ToolExecutionResult,
} from './types';

export const AGENT_MODEL = 'gpt-5.4-mini';
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

// PostHog AI observability: when PostHog is configured, the OpenAI client is
// the `@posthog/ai` wrapper (a subclass of the official SDK) which captures
// one `$ai_generation` event per API call — including streamed calls — tagged
// with the `posthog*` params spread into each `create()`. When PostHog is NOT
// configured, this stays the pure SDK and `buildPosthogCallParams` returns an
// empty object, so no unknown params ever reach the OpenAI API.
let openaiClient: OpenAI | null = null;
const getOpenAIClient = (): OpenAI => {
  if (openaiClient) return openaiClient;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  const posthog = getPostHogClient();
  openaiClient = posthog
    ? new PostHogOpenAI({ apiKey: process.env.OPENAI_API_KEY, posthog, maxRetries: 0 })
    : new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  return openaiClient;
};

/**
 * Test seam: lets deterministic tests drive `runAgent` with a scripted client
 * (no network). Pass `null` to restore the real client on next use.
 */
export function __setOpenAIClientForTesting(client: OpenAI | null): void {
  openaiClient = client;
}

const isAiObservabilityEnabled = (): boolean => getPostHogClient() !== null;

/** Extra per-call params understood (and stripped) by the @posthog/ai wrapper. */
interface PosthogCallParams {
  posthogDistinctId?: string;
  posthogTraceId?: string;
  posthogProperties?: Record<string, unknown>;
}

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
  /**
   * Force `tool_choice: 'required'` on the first iteration.
   * Legacy anti-hallucination retry — NOT used when `profile.reliableExecution`
   * is on (a wrong sentence must never trigger a new write).
   */
  forceToolChoice?: boolean;
  /**
   * Reuse an existing trace id instead of generating a new one — the
   * anti-hallucination retry passes the first run's id so the whole user turn
   * shows up as a single trace in PostHog AI observability.
   */
  traceId?: string;
  /**
   * Extra properties merged into every $ai_generation / $ai_span this run
   * emits (e.g. the eval runner sets `environment: 'eval'`, `scenario`,
   * `git_sha`).
   */
  traceProperties?: Record<string, unknown>;
}

interface PendingToolCall {
  id: string;
  name: string;
  args: string;
}

const NO_TOOL_RESULT_MESSAGE = 'Ferramenta não executada.';

/** Executor result → operations-record entry. */
function toOperation(
  tc: PendingToolCall,
  args: Record<string, unknown>,
  result: ToolExecutionResult,
  iteration: number,
): AgentOperation {
  const op: AgentOperation = {
    tool: tc.name,
    kind: isWriteTool(tc.name) ? 'write' : 'read',
    args,
    success: result.success,
    iteration,
  };
  if (!result.success) {
    op.error = {
      code: result.error_code ?? 'tool_error',
      message: result.message ?? NO_TOOL_RESULT_MESSAGE,
    };
  }
  if (result.entity) op.entity = result.entity;
  else if (result.data && typeof result.data.id === 'string' && tc.name.endsWith('_task')) {
    op.entity = {
      type: 'task',
      id: result.data.id,
      title: typeof result.data.title === 'string' ? result.data.title : undefined,
    };
  }
  if (result.changes) op.persisted = result.changes;
  if (result.duplicate) op.duplicate = true;
  if (result.unchanged) op.unchanged = true;
  if (result.notes?.length) op.notes = result.notes;
  if (result.pending_question) op.pendingQuestion = result.pending_question;
  return op;
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
  const reliable = Boolean(profile.reliableExecution);
  const startedAt = Date.now();

  // One trace per user turn (the retry run reuses the id via options.traceId).
  const traceId = options.traceId ?? randomUUID();
  const observabilityEnabled =
    isAiObservabilityEnabled() && !(ctx.email && isEvalAnalyticsDistinctId(ctx.email));
  const baseTraceProperties: Record<string, unknown> = {
    channel: profile.id,
    mode: ctx.mode,
    prompt_version: PROMPT_VERSION,
    environment: process.env.NODE_ENV ?? 'development',
    ...options.traceProperties,
  };
  const buildPosthogCallParams = (iteration: number): PosthogCallParams =>
    observabilityEnabled
      ? {
          posthogDistinctId:
            ctx.email && !isEvalAnalyticsDistinctId(ctx.email) ? ctx.email : undefined,
          posthogTraceId: traceId,
          posthogProperties: { ...baseTraceProperties, iteration },
        }
      : {};

  let messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...initialMessages,
  ];

  let finalText = '';
  const toolCallNames: string[] = [];
  const operations: AgentOperation[] = [];
  const reliability: AgentRunReliability = {
    enabled: reliable,
    claimsStripped: 0,
    invalidToolCalls: 0,
    dateCorrections: 0,
    pendingQuestions: 0,
  };

  // Everything the user ends up seeing, in order (confirmations, questions,
  // the model's own — filtered — text). Only meaningful with `reliable`.
  const composedBlocks: string[] = [];
  let lastModelText = '';

  const emitText = (chunk: string): void => {
    if (!chunk) return;
    if (reliability.timeToFirstTextMs === undefined && chunk.trim()) {
      reliability.timeToFirstTextMs = Date.now() - startedAt;
    }
    callbacks.onText?.(chunk);
  };

  const gateCtx = gateContextFor(operations);

  // Cost telemetry: summed across every OpenAI call this run makes (each
  // tool-use iteration is a separate billed request).
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  let apiCalls = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const toolChoice =
      options.forceToolChoice && !reliable && iteration === 0 ? 'required' : 'auto';

    callbacks.onStatus?.(
      iteration === 0 ? 'Analisando sua mensagem…' : 'Continuando a análise…',
    );

    let textContent = '';
    let pendingToolCalls: PendingToolCall[] = [];
    let finishReason: string | null = null;
    // With `reliable`, model text is streamed through a sentence gate that
    // holds back confirmation claims; `iterationVisibleText` is what the user
    // actually saw from the model in this iteration.
    let iterationVisibleText = '';
    const gate = reliable
      ? new SentenceGate(gateCtx, (chunk) => {
          iterationVisibleText += chunk;
          emitText(chunk);
        })
      : null;

    if (profile.transport === 'stream') {
      const stream = await callWithRetry(
        () =>
          openai.chat.completions.create({
            model: AGENT_MODEL,
            messages,
            tools,
            tool_choice: toolChoice,
            stream: true,
            stream_options: { include_usage: true },
            max_completion_tokens: MAX_TOKENS_STREAM,
            ...determinismParams,
            ...buildPosthogCallParams(iteration),
          }),
        { channel: profile.id, userId: ctx.userId },
      );

      const indexed = new Map<number, PendingToolCall>();

      for await (const chunk of stream) {
        // The usage summary arrives as its own chunk (often with an empty
        // `choices` array), so it must be read before the `!choice` guard.
        if (chunk.usage) {
          totalInputTokens += chunk.usage.prompt_tokens ?? 0;
          totalOutputTokens += chunk.usage.completion_tokens ?? 0;
          totalCachedTokens += chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;
        const reasoningDelta = (delta as { reasoning_content?: string | null } | undefined)
          ?.reasoning_content;
        if (reasoningDelta) {
          callbacks.onReasoning?.(reasoningDelta);
        }

        if (delta?.content) {
          textContent += delta.content;
          if (gate) gate.push(delta.content);
          else emitText(delta.content);
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

      apiCalls++;
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
            ...buildPosthogCallParams(iteration),
          }),
        { channel: profile.id, userId: ctx.userId },
      );

      apiCalls++;
      if (response.usage) {
        totalInputTokens += response.usage.prompt_tokens ?? 0;
        totalOutputTokens += response.usage.completion_tokens ?? 0;
        totalCachedTokens += response.usage.prompt_tokens_details?.cached_tokens ?? 0;
      }

      const choice = response.choices[0];
      const message = choice?.message;
      finishReason = choice?.finish_reason ?? null;
      const reasoningContent = (message as { reasoning_content?: string | null } | undefined)
        ?.reasoning_content;
      if (reasoningContent) {
        callbacks.onReasoning?.(reasoningContent);
      }
      textContent = message?.content?.trim() ?? '';
      if (gate && textContent) gate.push(textContent);

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

    if (gate) {
      gate.flush();
      reliability.claimsStripped += gate.dropped;
      // `gate.dropped` is cumulative per gate instance; reset by construction
      // next iteration. Track the visible text for the final composition.
      if (iterationVisibleText.trim()) lastModelText = iterationVisibleText;
      else if (textContent.trim()) lastModelText = '';
    } else if (textContent) {
      finalText = textContent;
    }

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
    const iterationOps: AgentOperation[] = [];

    for (const tc of pendingToolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      let parseFailed = false;
      try {
        parsedArgs = tc.args ? JSON.parse(tc.args) : {};
      } catch {
        parsedArgs = {};
        parseFailed = true;
      }

      callbacks.onToolCall?.(tc.name, parsedArgs);

      const toolStartedAt = Date.now();
      let dedupSkipped = false;
      let result: ToolExecutionResult;
      let executedArgs = parsedArgs;

      // Entrega 1 — validate BEFORE any executor runs. Invalid arguments are a
      // structured failure the model (and the confirmation) sees; no write.
      let validationNotes: string[] = [];
      let rejected = false;
      if (reliable) {
        const validation = validateToolArguments(getToolDefinition(tc.name, profile), parsedArgs);
        if (parseFailed) {
          validation.ok = false;
          validation.issues.unshift({ path: '', message: 'argumentos não são JSON válido' });
        }
        if (validation.ignored.length) {
          const isCreate = tc.name.startsWith('create_');
          validationNotes = validation.ignored.map((p) =>
            isCreate
              ? `campo "${p}" ignorado (vazio ou desconhecido) — ficou sem valor`
              : `campo "${p}" ignorado (vazio ou desconhecido) — valor anterior mantido`,
          );
        }
        if (!validation.ok) {
          rejected = true;
          reliability.invalidToolCalls++;
          console.warn(
            '[Agent:%s] Invalid tool arguments tool=%s issues=%s userId=%s',
            profile.id,
            tc.name,
            formatValidationIssues(validation.issues),
            ctx.userId,
          );
          result = {
            success: false,
            error_code: 'invalid_arguments',
            message: `Argumentos inválidos: ${formatValidationIssues(validation.issues)}. Nada foi alterado.`,
            notes: validation.issues.map((i) => `invalid:${i.path}`),
          };
        } else {
          executedArgs = validation.args;
        }
      }

      if (!rejected) {
        if (tc.name === 'create_task' && profile.enableDedup) {
          const title = String(executedArgs.title ?? '').trim();
          const duplicateId = await findRecentDuplicateTitle(ctx.userId, title, profile);
          if (duplicateId) {
            console.warn(
              '[Agent:%s] Dedup — skipping duplicate create_task title=%s userId=%s existingId=%s',
              profile.id,
              title,
              ctx.userId,
              duplicateId,
            );
            dedupSkipped = true;
            result = {
              success: true as const,
              data: {
                id: duplicateId,
                title,
                duplicate: true,
                pending: profile.taskCreationTarget === 'pending_tasks',
              },
              duplicate: true,
              entity: { type: 'task', id: duplicateId, title },
            };
          } else {
            result = await executeToolCall(tc.name, executedArgs, ctx, profile);
          }
        } else {
          result = await executeToolCall(tc.name, executedArgs, ctx, profile);
        }
      }

      if (validationNotes.length) {
        result!.notes = [...(result!.notes ?? []), ...validationNotes];
        if (result!.data) result!.data.notes = result!.notes;
      }

      callbacks.onToolResult?.(tc.name, result!.success, result!.data);
      toolCallNames.push(tc.name);

      // Recorded in both modes so the legacy/flagged comparison can count
      // writes and failures the same way; only the flagged path USES it.
      const op = toOperation(tc, executedArgs, result!, iteration);
      if (op.pendingQuestion) reliability.pendingQuestions++;
      if (op.notes?.some((n) => n.startsWith('due_date'))) reliability.dateCorrections++;
      operations.push(op);
      iterationOps.push(op);

      // One $ai_span per executed tool, attached to this turn's trace so
      // tools show up nested under the generation in AI observability.
      if (ctx.email) {
        captureServer(ctx.email, '$ai_span', {
          $ai_trace_id: traceId,
          $ai_span_id: randomUUID(),
          $ai_span_name: tc.name,
          $ai_input_state: parsedArgs,
          $ai_output_state: result!,
          $ai_latency: (Date.now() - toolStartedAt) / 1000,
          $ai_is_error: !result!.success,
          iteration,
          dedup_skipped: dedupSkipped,
          reliable_execution: reliable,
          rejected_by_validation: rejected,
          ...baseTraceProperties,
        });
      }

      // What the model sees. `entity`/`changes` are internal — the model gets
      // `data` + `message` + `notes`, same shape as before plus the notes.
      const modelVisible: Record<string, unknown> = {
        success: result!.success,
        ...(result!.data ? { data: result!.data } : {}),
        ...(result!.message ? { message: result!.message } : {}),
        ...(result!.error_code ? { error_code: result!.error_code } : {}),
        ...(result!.notes?.length ? { notes: result!.notes } : {}),
      };

      toolResultMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(modelVisible),
      });
    }

    messages = [...messages, ...toolResultMessages];

    callbacks.onSeparator?.();

    // Entrega 1 — the confirmation is emitted HERE, right after the results,
    // built from what actually happened. The model's follow-up (if any)
    // streams after it in the next iteration.
    if (reliable && iterationOps.length > 0) {
      const confirmation = buildConfirmation(iterationOps, profile);
      const questions = collectPendingQuestions(iterationOps);
      const block = tidy([confirmation ?? '', ...questions].filter(Boolean).join('\n'));
      if (block) {
        composedBlocks.push(block);
        emitText(`${block}\n`);
        // A backend confirmation supersedes whatever the model said before it.
        lastModelText = '';
      }
    }
  }

  const usage: AgentTurnUsage = {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cachedTokens: totalCachedTokens,
    apiCalls,
  };

  if (reliable) {
    const modelText = tidy(lastModelText);
    const blocks = [...composedBlocks, modelText].filter(Boolean);
    let composed = blocks.join('\n\n');
    if (!composed && reliability.claimsStripped > 0 && !gateCtx.hasWrites()) {
      // The model only claimed things that never happened: say so instead of
      // re-running the turn with a forced tool call.
      composed = NOTHING_CHANGED_FALLBACK;
      emitText(composed);
    }
    finalText = composed;
  }

  return { text: finalText, toolCallNames, operations, usage, reliability, traceId };
}

/**
 * Non-streaming helper used by callers that already have the model text and
 * the run's operations (e.g. a retry path) and need the same claim filtering.
 */
export function filterClaims(text: string, operations: AgentOperation[]): string {
  return filterModelText(text, gateContextFor(operations)).text;
}
