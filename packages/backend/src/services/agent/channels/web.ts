/**
 * Web channel adapter.
 *
 * Public API: `streamChat` — streams SSE events to the controller. Inserts
 * tasks directly into `tasks`, supports modo `task` (chat scoped to one
 * task), runs daily memory reconciliation, and now ALSO benefits from the
 * dedup + anti-hallucination guardrails that previously only existed on
 * WhatsApp (parity goal of the unification).
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  extractMemoryPostResponse,
  getUserProfile,
  markReconciled,
  needsReconciliation,
  persistMemory,
  reconcileMemory,
} from '../core/memory';
import { buildSystemPrompt, buildTaskFocusedPrompt, buildWebExtras } from '../core/prompt';
import { runAgent } from '../core/runAgent';
import {
  getCompletedTaskCount,
  getTaskById,
  getUserActiveTasks,
  getUserCategories,
  getUserLists,
} from '../core/tasks';
import { shouldRetryWithForcedTool } from '../core/guardrails';
import type {
  AgentContext,
  ChannelProfile,
  ChatMessage,
} from '../core/types';

// ---------------------------------------------------------------------------
// SSE event contract — kept identical to the previous aiChatService.
// ---------------------------------------------------------------------------

export type SSEEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolName: string; toolArgs: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; success: boolean; data?: Record<string, unknown> }
  | { type: 'separator' }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type { ChatMessage } from '../core/types';

// ---------------------------------------------------------------------------
// Channel profile
// ---------------------------------------------------------------------------

const WEB_PROFILE: ChannelProfile = {
  id: 'web',
  taskCreationTarget: 'tasks',
  toolsAvailable: [
    'create_task',
    'update_task',
    'complete_task',
    'delete_task',
    'update_memory',
    'create_list',
    'update_list',
    'delete_list',
    'show_list',
    'create_category',
    'update_category',
    'delete_category',
    'show_category',
    'scan_gmail',
  ],
  outputFormat: 'markdown',
  transport: 'stream',
  enableBriefing: false,
  enableMemoryReconciliation: true,
  enableDedup: true,
  enableAntiHallucinationRetry: true,
  supportsTaskMode: true,
  systemPromptExtras: buildWebExtras,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function streamChat(
  userId: string,
  _userName: string,
  messages: ChatMessage[],
  mode: 'task' | 'general',
  taskId: string | undefined,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  try {
    const profileData = await getUserProfile(userId);
    const { timezone, preferredName } = profileData;
    let { memory } = profileData;

    if (WEB_PROFILE.enableMemoryReconciliation && (await needsReconciliation(userId))) {
      try {
        const reconciled = await reconcileMemory(userId, memory, timezone);
        if (reconciled !== memory) {
          memory = reconciled;
          await persistMemory(userId, reconciled);
        }
        await markReconciled(userId);
      } catch {
        // ignore reconciliation failures
      }
    }

    let ctx: AgentContext;
    let systemPrompt: string;

    if (mode === 'task' && taskId) {
      const task = await getTaskById(taskId, userId);
      if (!task) {
        onEvent({ type: 'error', message: 'Tarefa não encontrada' });
        onEvent({ type: 'done' });
        return;
      }
      ctx = {
        userId,
        preferredName,
        timezone,
        memory,
        activeTasks: [],
        completedTaskCount: 0,
        lists: [],
        categories: [],
        pendingTasks: [],
        mode: 'task',
        focusedTask: task,
      };
      systemPrompt = buildTaskFocusedPrompt(task, ctx, WEB_PROFILE);
    } else {
      const [activeTasks, completedTaskCount, lists, categories] = await Promise.all([
        getUserActiveTasks(userId),
        getCompletedTaskCount(userId),
        getUserLists(userId),
        getUserCategories(userId),
      ]);

      const lastUserMessage = [...messages]
        .reverse()
        .find((m) => m.role === 'user')
        ?.content;

      ctx = {
        userId,
        preferredName,
        timezone,
        memory,
        activeTasks,
        completedTaskCount,
        lists,
        categories,
        pendingTasks: [],
        mode: 'general',
        originalUserMessage: lastUserMessage,
      };
      systemPrompt = buildSystemPrompt(ctx, WEB_PROFILE);
    }

    const initialMessages: ChatCompletionMessageParam[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    let { text, toolCallNames } = await runAgent(
      WEB_PROFILE,
      ctx,
      systemPrompt,
      initialMessages,
      {
        onText: (delta) => onEvent({ type: 'text', content: delta }),
        onToolCall: (toolName, toolArgs) =>
          onEvent({ type: 'tool_call', toolName, toolArgs }),
        onToolResult: (toolName, success, data) =>
          onEvent({ type: 'tool_result', toolName, success, data }),
        onSeparator: () => onEvent({ type: 'separator' }),
      },
    );

    if (
      WEB_PROFILE.enableAntiHallucinationRetry &&
      shouldRetryWithForcedTool(text, toolCallNames)
    ) {
      console.warn(
        '[Web Agent] Hallucination guardrail — retrying with tool_choice=required userId=%s',
        userId,
      );
      onEvent({ type: 'separator' });
      const retry = await runAgent(
        WEB_PROFILE,
        ctx,
        systemPrompt,
        initialMessages,
        {
          onText: (delta) => onEvent({ type: 'text', content: delta }),
          onToolCall: (toolName, toolArgs) =>
            onEvent({ type: 'tool_call', toolName, toolArgs }),
          onToolResult: (toolName, success, data) =>
            onEvent({ type: 'tool_result', toolName, success, data }),
          onSeparator: () => onEvent({ type: 'separator' }),
        },
        { forceToolChoice: true },
      );
      text = retry.text || text;
      toolCallNames = [...toolCallNames, ...retry.toolCallNames];
    }

    onEvent({ type: 'done' });

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content;
    if (lastUserMsg) {
      extractMemoryPostResponse(userId, lastUserMsg, memory).catch((err) => {
        console.error('[Web Memory extraction] failed:', err);
      });
    }
  } catch (err) {
    console.error('AI Chat stream error:', err);
    const message =
      err instanceof Error ? err.message : 'Erro ao processar resposta da IA';
    onEvent({ type: 'error', message });
    onEvent({ type: 'done' });
  }
}

