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

let openaiClient: OpenAI | null = null;
const getOpenAIClient = (): OpenAI => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
};

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
      const stream = await openai.chat.completions.create({
        model: AGENT_MODEL,
        messages,
        tools,
        tool_choice: toolChoice,
        stream: true,
        max_completion_tokens: MAX_TOKENS_STREAM,
      });

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
      const response = await openai.chat.completions.create({
        model: AGENT_MODEL,
        messages,
        tools,
        tool_choice: toolChoice,
        max_completion_tokens: MAX_TOKENS_SINGLE,
      });

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
