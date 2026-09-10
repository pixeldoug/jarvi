/**
 * WhatsApp channel adapter.
 *
 * Public API: `runWhatsappAgent` — single-string response, persists
 * conversation history to Redis, applies anti-hallucination retry.
 * Tasks are created directly as active tasks (no approval step).
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { extractMemoryPostResponse, getUserProfile } from '../core/memory';
import { buildSystemPrompt, buildWhatsappExtras } from '../core/prompt';
import { runAgent } from '../core/runAgent';
import {
  getActiveTaskCount,
  getCompletedTaskCount,
  getUserActiveTasks,
  getUserCategories,
} from '../core/tasks';
import { getDateTimeForTimezone } from '../core/time';
import { shouldRetryWithForcedTool } from '../core/guardrails';
import { isReliableExecutionEnabled } from '../core/flags';
import { recordAgentTurnUsage, sumAgentTurnUsage } from '../core/telemetry';
import type {
  AgentContext,
  ChannelProfile,
  ConversationMessage,
  RedisLike,
} from '../core/types';

// ---------------------------------------------------------------------------
// Redis-backed daily conversation history
// ---------------------------------------------------------------------------

const historyKey = (userId: string) => `whatsapp:agent:history:${userId}`;
const historyDateKey = (userId: string) => `whatsapp:agent:history:date:${userId}`;
const HISTORY_TTL_SECONDS = 24 * 60 * 60;
const MAX_HISTORY_MESSAGES = 20;

async function loadHistory(
  redis: RedisLike,
  userId: string,
  todayIso: string,
): Promise<ConversationMessage[]> {
  try {
    const [raw, storedDate] = await Promise.all([
      redis.get(historyKey(userId)),
      redis.get(historyDateKey(userId)),
    ]);

    if (!storedDate || storedDate !== todayIso) {
      await redis.set(historyKey(userId), JSON.stringify([]), 'EX', HISTORY_TTL_SECONDS);
      await redis.set(historyDateKey(userId), todayIso, 'EX', HISTORY_TTL_SECONDS);
      return [];
    }

    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (m): m is ConversationMessage =>
            (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

async function appendHistory(
  redis: RedisLike,
  userId: string,
  userMsg: string,
  assistantMsg: string,
  todayIso: string,
): Promise<void> {
  try {
    const history = await loadHistory(redis, userId, todayIso);
    history.push({ role: 'user', content: userMsg });
    history.push({ role: 'assistant', content: assistantMsg });
    const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
    await Promise.all([
      redis.set(historyKey(userId), JSON.stringify(trimmed), 'EX', HISTORY_TTL_SECONDS),
      redis.set(historyDateKey(userId), todayIso, 'EX', HISTORY_TTL_SECONDS),
    ]);
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Channel profile
// ---------------------------------------------------------------------------

const WHATSAPP_PROFILE: ChannelProfile = {
  id: 'whatsapp',
  taskCreationTarget: 'tasks',
  toolsAvailable: [
    'create_task',
    'update_task',
    'complete_task',
    'delete_task',
    'search_tasks',
    'update_memory',
  ],
  outputFormat: 'plain',
  transport: 'single',
  enableBriefing: true,
  enableMemoryReconciliation: false,
  enableDedup: true,
  enableAntiHallucinationRetry: true,
  supportsTaskMode: false,
  systemPromptExtras: buildWhatsappExtras,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RunWhatsappAgentOptions {
  whatsappPhone?: string;
  whatsappMessageSid?: string;
}

export const runWhatsappAgent = async (
  userId: string,
  userMessage: string,
  redis: RedisLike,
  options: RunWhatsappAgentOptions = {},
): Promise<string> => {
  const [
    { memory, timezone, preferredName, email, subscriptionStatus },
    activeTasks,
    activeTaskCount,
    completedTaskCount,
    categories,
  ] = await Promise.all([
    getUserProfile(userId),
    getUserActiveTasks(userId),
    getActiveTaskCount(userId),
    getCompletedTaskCount(userId),
    getUserCategories(userId),
  ]);

  // Entrega 1 — resolved per user so the rollout can start with internal
  // accounts only (see core/flags.ts). Off → legacy path: same prompts,
  // schemas, retry guardrail and raw model text.
  const profile: ChannelProfile = {
    ...WHATSAPP_PROFILE,
    reliableExecution: isReliableExecutionEnabled(email),
  };

  const ctx: AgentContext = {
    userId,
    email,
    preferredName,
    timezone,
    memory,
    activeTasks,
    activeTaskCount,
    completedTaskCount,
    lists: [],
    categories,
    mode: 'general',
    originalUserMessage: userMessage,
    whatsappPhone: options.whatsappPhone,
    whatsappMessageSid: options.whatsappMessageSid,
  };

  const systemPrompt = buildSystemPrompt(ctx, profile);
  const { isoDate, weekday, ddmm } = getDateTimeForTimezone(timezone);

  const history = await loadHistory(redis, userId, isoDate);

  // Inject a date-correction anchor so the model never gets confused by stale
  // dates in the recent history.
  const dateCorrectionPair: ChatCompletionMessageParam[] =
    history.length > 0
      ? [
          { role: 'user', content: '[SISTEMA] Qual é a data de hoje?' },
          { role: 'assistant', content: `Hoje é ${weekday}, ${ddmm}.` },
        ]
      : [];

  const initialMessages: ChatCompletionMessageParam[] = [
    ...history.map(
      (m) => ({ role: m.role, content: m.content } as ChatCompletionMessageParam),
    ),
    ...dateCorrectionPair,
    { role: 'user', content: userMessage },
  ];

  const run = await runAgent(profile, ctx, systemPrompt, initialMessages, {});
  let { text, toolCallNames, usage } = run;
  const { traceId } = run;
  let retried = false;

  // Legacy guardrail only. With reliable execution a wrong sentence is
  // stripped by the backend, never "fixed" by forcing a new write.
  if (
    !profile.reliableExecution &&
    profile.enableAntiHallucinationRetry &&
    shouldRetryWithForcedTool(text, toolCallNames)
  ) {
    console.warn(
      '[WhatsApp Agent] Hallucination guardrail — retrying with tool_choice=required userId=%s',
      userId,
    );
    const retry = await runAgent(
      profile,
      ctx,
      systemPrompt,
      initialMessages,
      {},
      // Same traceId: the retry belongs to the same user turn/trace.
      { forceToolChoice: true, traceId },
    );
    text = retry.text || text;
    toolCallNames = [...toolCallNames, ...retry.toolCallNames];
    usage = sumAgentTurnUsage([usage, retry.usage]);
    retried = true;
  }

  recordAgentTurnUsage({
    email,
    channel: 'whatsapp',
    subscriptionStatus,
    usage,
    retried,
    traceId,
    reliability: run.reliability,
    operations: run.operations,
  });

  const finalResponse = text || 'Entendido! Como posso te ajudar?';

  await appendHistory(redis, userId, userMessage, finalResponse, isoDate);

  // Fire-and-forget memory extraction over the user's last message
  extractMemoryPostResponse(userId, userMessage, memory).catch((err) => {
    console.error('[WhatsApp Memory extraction] failed:', err);
  });

  return finalResponse;
};
