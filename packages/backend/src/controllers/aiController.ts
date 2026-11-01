import { Request, Response } from 'express';
import { streamChat, ChatMessage, type SSEEvent } from '../services/agent';
import {
  buildAttachmentContext,
  IncomingChatAttachment,
  MAX_ATTACHMENTS,
} from '../services/chatAttachmentService';
import type { AgentPendingQuestionRef } from '../services/agent/core/types';
import { beginChatTurn, toAttachmentNames, type ChatTurnRecorder } from '../services/chatHistoryService';
import { buildNoteChatContext, getNoteAccess, getUserTimezone } from '../services/noteService';
import {
  isTextRewriteAction,
  rewriteSelection,
  TextRewriteInputError,
} from '../services/textRewriteService';

/** Tríade fields, plus the first-tasks journey nudge ("Continuar"). */
const PENDING_FIELDS = new Set(['due_date', 'time', 'reminders', 'journey']);

/** The question the user is replying to, as echoed by the web client. Untrusted input. */
function parsePendingQuestion(value: unknown): AgentPendingQuestionRef | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.field !== 'string' || !PENDING_FIELDS.has(raw.field)) return undefined;
  const ref: AgentPendingQuestionRef = { field: raw.field as AgentPendingQuestionRef['field'] };
  if (typeof raw.taskId === 'string' && raw.taskId.length <= 64) ref.taskId = raw.taskId;
  if (typeof raw.question === 'string') ref.question = raw.question.slice(0, 200);
  if (Array.isArray(raw.choices)) {
    ref.choices = raw.choices.filter((c): c is string => typeof c === 'string').slice(0, 6);
  }
  return ref;
}

export const handleChat = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const userName = req.user?.name || '';

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  const {
    messages,
    mode,
    taskId,
    noteId,
    attachments,
    pendingQuestion: rawPendingQuestion,
    conversationId,
    priorMessages,
  } = req.body as {
    messages?: ChatMessage[];
    mode?: 'task' | 'general' | 'note';
    taskId?: string;
    noteId?: unknown;
    attachments?: IncomingChatAttachment[];
    pendingQuestion?: unknown;
    /** Chats: the conversation this turn continues (none: a new one) */
    conversationId?: unknown;
    /** Chats: snapshots of what the web showed before the conversation existed */
    priorMessages?: unknown;
  };
  const pendingQuestion = parsePendingQuestion(rawPendingQuestion);

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages is required and must be a non-empty array' });
    return;
  }

  if (mode !== 'task' && mode !== 'general' && mode !== 'note') {
    res.status(400).json({ error: 'mode must be "task", "general" or "note"' });
    return;
  }

  if (mode === 'task' && !taskId) {
    res.status(400).json({ error: 'taskId is required when mode is "task"' });
    return;
  }

  if (mode === 'note' && (typeof noteId !== 'string' || !noteId || noteId.length > 64)) {
    res.status(400).json({ error: 'noteId is required when mode is "note"' });
    return;
  }

  if (attachments !== undefined && !Array.isArray(attachments)) {
    res.status(400).json({ error: 'attachments must be an array when provided' });
    return;
  }

  if (Array.isArray(attachments) && attachments.length > MAX_ATTACHMENTS) {
    res.status(400).json({ error: `attachments must contain at most ${MAX_ATTACHMENTS} files` });
    return;
  }

  // Turn any uploaded files into text and fold them into the latest user turn.
  // Done before SSE headers are flushed so failures surface as a JSON error.
  let finalMessages: ChatMessage[] = messages;
  if (Array.isArray(attachments) && attachments.length > 0) {
    try {
      const attachmentContext = await buildAttachmentContext(attachments);
      if (attachmentContext) {
        finalMessages = [...messages];
        for (let i = finalMessages.length - 1; i >= 0; i--) {
          if (finalMessages[i].role === 'user') {
            finalMessages[i] = {
              ...finalMessages[i],
              content: [finalMessages[i].content, attachmentContext]
                .filter(Boolean)
                .join('\n\n'),
            };
            break;
          }
        }
      }
    } catch (err) {
      console.error('Failed to process chat attachments:', err);
      res.status(500).json({ error: 'Failed to process attachments' });
      return;
    }
  }

  // Notas: the general agent plus the open note as context. Access is checked
  // here, before the SSE headers, so a bad id is a plain JSON error.
  let noteContext: string | undefined;
  if (mode === 'note') {
    try {
      const access = await getNoteAccess(noteId as string, userId);
      const context = access
        ? await buildNoteChatContext(noteId as string, await getUserTimezone(userId))
        : null;
      if (!context) {
        res.status(404).json({ error: 'Nota não encontrada' });
        return;
      }
      noteContext = context;
    } catch (err) {
      console.error('Failed to load note for chat:', err);
      res.status(500).json({ error: 'Failed to load note' });
      return;
    }
  }

  // Chats: store the turn (a conversation starts with its first message).
  // The chat works without it, so a failure is only logged.
  let recorder: ChatTurnRecorder | null = null;
  try {
    recorder = await beginChatTurn({
      userId,
      conversationId,
      mode,
      taskId,
      noteId: mode === 'note' ? (noteId as string) : undefined,
      messages,
      priorMessages,
      attachments: toAttachmentNames(attachments),
    });
  } catch (err) {
    console.error('[chats] failed to record the turn:', err);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendSSE = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  const sendEvent = (event: SSEEvent) => {
    recorder?.record(event);
    sendSSE(event);
  };

  // First, so the web continues this conversation on its next turn.
  if (recorder) {
    sendSSE({ type: 'conversation', id: recorder.conversationId, title: recorder.title });
  }

  // A new conversation gets a short AI title while the agent answers: sent
  // when it lands before the reply ends, else the web reads it on its next
  // refetch. The first message stays the title if the model has nothing.
  if (recorder?.isNew) {
    const { conversationId: id } = recorder;
    void recorder.improveTitle({ userId, email: req.user?.email }).then((title) => {
      if (title && !res.writableEnded) sendSSE({ type: 'conversation', id, title });
    });
  }

  try {
    await streamChat(
      userId,
      userName,
      finalMessages,
      mode === 'note' ? 'general' : mode,
      mode === 'note' ? undefined : taskId,
      sendEvent,
      mode === 'note' ? { pendingQuestion, noteContext } : { pendingQuestion },
    );
  } catch (err: any) {
    console.error('AI chat controller error:', err);
    sendEvent({ type: 'error', message: err?.message || 'Internal server error' });
    sendEvent({ type: 'done' });
  }

  // Before closing the stream: the web refetches the history when it ends.
  await recorder?.finish();
  res.end();
};

/**
 * POST /api/ai/rewrite — editor AI actions on a selection.
 * Body: `{ action: 'grammar' | 'improve' | 'shorten' | 'expand', doc }`, where
 * `doc` is the selection as a TipTap doc. Returns `{ markdown }`.
 */
export const handleRewrite = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  const { action, doc } = (req.body ?? {}) as { action?: unknown; doc?: unknown };
  if (!isTextRewriteAction(action)) {
    res.status(400).json({ error: 'invalid_action' });
    return;
  }

  try {
    const markdown = await rewriteSelection(action, doc, {
      userId,
      email: req.user?.email,
    });
    res.json({ markdown });
  } catch (error) {
    if (error instanceof TextRewriteInputError) {
      res.status(error.status).json({ error: error.code });
      return;
    }
    console.error('[ai] text rewrite failed:', error);
    res.status(502).json({ error: 'rewrite_failed' });
  }
};
