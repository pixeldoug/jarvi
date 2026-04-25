/**
 * WhatsApp channel adapter.
 *
 * Public API: `runWhatsappAgent` — single-string response, persists
 * conversation history to Redis, applies anti-hallucination retry, and
 * routes new tasks through `pending_tasks` for in-app approval.
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { extractMemoryPostResponse, getUserProfile } from '../core/memory';
import { buildSystemPrompt, buildWhatsappExtras } from '../core/prompt';
import { runAgent } from '../core/runAgent';
import {
  getCompletedTaskCount,
  getUserActiveTasks,
} from '../core/tasks';
import { getDateTimeForTimezone } from '../core/time';
import { shouldRetryWithForcedTool } from '../core/guardrails';
import { getActivePendingTasksForUser } from '../../pendingTaskService';
import type {
  AgentContext,
  ChannelProfile,
  ConversationMessage,
  PendingTaskRow,
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
  taskCreationTarget: 'pending_tasks',
  toolsAvailable: [
    'create_task',
    'update_task',
    'complete_task',
    'delete_task',
    'update_memory',
    'confirm_pending_task',
    'reject_pending_task',
    'update_pending_task',
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
    { memory, timezone, preferredName },
    activeTasks,
    completedTaskCount,
    activePendingTasks,
  ] = await Promise.all([
    getUserProfile(userId),
    getUserActiveTasks(userId),
    getCompletedTaskCount(userId),
    getActivePendingTasksForUser(userId).catch((err) => {
      console.error('[WhatsApp Agent] failed to load pending tasks', err);
      return [];
    }),
  ]);

  const pendingTasks: PendingTaskRow[] = activePendingTasks.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    source: row.source,
    suggested_title: row.suggested_title,
    suggested_description: row.suggested_description,
    suggested_priority: row.suggested_priority,
    suggested_due_date: row.suggested_due_date,
    suggested_time: row.suggested_time,
    suggested_category: row.suggested_category,
    status: row.status,
    expires_at: row.expires_at ?? null,
    created_at: row.created_at ?? null,
  }));

  const ctx: AgentContext = {
    userId,
    preferredName,
    timezone,
    memory,
    activeTasks,
    completedTaskCount,
    lists: [],
    categories: [],
    pendingTasks,
    mode: 'general',
    originalUserMessage: userMessage,
    whatsappPhone: options.whatsappPhone,
    whatsappMessageSid: options.whatsappMessageSid,
  };

  const systemPrompt = buildSystemPrompt(ctx, WHATSAPP_PROFILE);
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

  let { text, toolCallNames } = await runAgent(
    WHATSAPP_PROFILE,
    ctx,
    systemPrompt,
    initialMessages,
    {},
  );

  if (
    WHATSAPP_PROFILE.enableAntiHallucinationRetry &&
    shouldRetryWithForcedTool(text, toolCallNames)
  ) {
    console.warn(
      '[WhatsApp Agent] Hallucination guardrail — retrying with tool_choice=required userId=%s',
      userId,
    );
    const retry = await runAgent(
      WHATSAPP_PROFILE,
      ctx,
      systemPrompt,
      initialMessages,
      {},
      { forceToolChoice: true },
    );
    text = retry.text || text;
    toolCallNames = [...toolCallNames, ...retry.toolCallNames];
  }

  const finalResponse = text || 'Entendido! Como posso te ajudar?';

  await appendHistory(redis, userId, userMessage, finalResponse, isoDate);

  // Fire-and-forget memory extraction over the user's last message
  extractMemoryPostResponse(userId, userMessage, memory).catch((err) => {
    console.error('[WhatsApp Memory extraction] failed:', err);
  });

  return finalResponse;
};
