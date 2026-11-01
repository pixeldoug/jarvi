import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { resolveChatChoiceArtifact } from '../lib/chatChoicePrompts';
import type { ChatStoredMessage } from '../lib/chatsApi';
import { stripTaskRefs } from '../lib/taskRefs';
import { chatsKeys } from './useChats';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contentAfter?: string;
  toolCalls?: ToolCallData[];
  /** In-progress reasoning for the current agent iteration. */
  reasoning?: string;
  /** Completed reasoning segments from earlier iterations in this turn. */
  reasoningSegments?: string[];
  /** Files the user attached to this message (metadata only, for display). */
  attachments?: ChatAttachmentMeta[];
  /**
   * Quick replies the user can tap. Set by the backend's `choices` event (the
   * system's next question), by a successful `offer_choices` tool call, or by
   * seeded conversations (onboarding follow-up).
   */
  choicePrompts?: string[];
  /** Question shown above the choice buttons. */
  choicePromptTitle?: string;
  /** Task the question is about, when the backend told us. */
  choiceTaskId?: string;
  /** Title of that task — set when the question is not about a task touched this turn. */
  choiceTaskTitle?: string;
  /**
   * Which task field the backend's question is about. Drives the picker the
   * artifact offers ("Escolher data" vs "Escolher horário") and is echoed back
   * with the next message so the backend can resolve a short answer itself.
   */
  choiceField?: ChatChoiceField;
  /**
   * The first-tasks journey is paused with tasks still to organize (backend
   * `journey_nudge` event). Rendered as a muted line with a resume action.
   */
  journeyNudge?: ChatJourneyNudge;
}

export type ChatChoiceField = 'due_date' | 'time' | 'reminders';

export interface ChatJourneyNudge {
  text: string;
  remaining: number;
  resumeLabel: string;
}

/**
 * Echo of the system question the person is answering (backend fast path).
 * `field: 'journey'` is the resume nudge — no task; "Continuar" resumes it.
 */
export interface PendingQuestionRef {
  taskId?: string;
  field: ChatChoiceField | 'journey';
}

function toChoiceField(value: unknown): ChatChoiceField {
  return value === 'time' || value === 'reminders' ? value : 'due_date';
}

/**
 * The system question still open at the end of the conversation, if any: the
 * last assistant message carries a structured question about a known task,
 * or the journey nudge.
 */
export function pendingQuestionOf(messages: ChatMessageData[]): PendingQuestionRef | undefined {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return undefined;
  if (last.choiceTaskId && last.choiceField && last.choicePrompts?.length) {
    return { taskId: last.choiceTaskId, field: last.choiceField };
  }
  if (last.journeyNudge) return { field: 'journey' };
  return undefined;
}

/** Lightweight attachment metadata kept in the UI for rendering chips. */
export interface ChatAttachmentMeta {
  name: string;
  mimeType: string;
  /**
   * Data URL for previewing the file in the attachment viewer. Kept only in the
   * client-side message history (never sent back to the API).
   */
  previewUrl?: string;
}

/** Full attachment payload sent to the backend (base64, no `data:` prefix). */
export interface ChatAttachment extends ChatAttachmentMeta {
  data: string;
}

export interface ToolCallData {
  toolName: string;
  toolArgs: Record<string, unknown>;
  result?: {
    success: boolean;
    data?: Record<string, unknown>;
  };
}

interface SSEEvent {
  type:
    | 'conversation'
    | 'text'
    | 'reasoning'
    | 'status'
    | 'tool_call'
    | 'tool_result'
    | 'separator'
    | 'choices'
    | 'journey_nudge'
    | 'done'
    | 'error';
  content?: string;
  message?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  success?: boolean;
  data?: Record<string, unknown>;
  /** `conversation` event: the recorded conversation this turn belongs to */
  id?: string;
  title?: string;
  /** `choices` event */
  question?: string;
  choices?: string[];
  taskId?: string;
  taskTitle?: string;
  field?: string;
  /** `journey_nudge` event */
  text?: string;
  remaining?: number;
  resumeLabel?: string;
}

/** The recorded conversation a chat continues (Chats history). */
export interface ChatConversationRef {
  id: string;
  /** '' until the conversation has a text message */
  title: string;
}

let messageIdCounter = 0;
const nextId = () => `msg-${++messageIdCounter}-${Date.now()}`;

function finalizeReasoningSegment(message: ChatMessageData): ChatMessageData {
  if (!message.reasoning?.trim()) return message;
  return {
    ...message,
    reasoningSegments: [...(message.reasoningSegments || []), message.reasoning],
    reasoning: '',
  };
}

/**
 * Applies one stream event to the reply it belongs to. Used live and to
 * rebuild a stored reply from its events (`restoreChatMessages`). `status`
 * and `conversation` don't change the message.
 */
function applyChatStreamEvent(message: ChatMessageData, event: SSEEvent): ChatMessageData {
  switch (event.type) {
    case 'reasoning':
      return { ...message, reasoning: (message.reasoning || '') + (event.content || '') };

    case 'text':
      return { ...message, content: message.content + (event.content || '') };

    case 'separator':
      // The agent is restarting this turn (guardrail retry). The retry
      // supersedes the previous attempt — `runAgent` returns only the
      // last text — so the partial answer already streamed must go.
      return { ...finalizeReasoningSegment(message), content: '' };

    case 'tool_call': {
      const finalized = finalizeReasoningSegment(message);
      return {
        ...finalized,
        toolCalls: [
          ...(finalized.toolCalls || []),
          {
            toolName: event.toolName || '',
            toolArgs: event.toolArgs || {},
          },
        ],
      };
    }

    case 'choices':
      // The backend decided the next question. It is the source of
      // truth for the artifact — `done` keeps it (see below).
      return {
        ...message,
        choicePromptTitle: event.question || undefined,
        choicePrompts: Array.isArray(event.choices) ? event.choices : [],
        choiceTaskId: event.taskId || undefined,
        choiceTaskTitle: event.taskTitle || undefined,
        choiceField: toChoiceField(event.field),
      };

    case 'journey_nudge':
      return {
        ...message,
        journeyNudge: {
          text: event.text || '',
          remaining: typeof event.remaining === 'number' ? event.remaining : 0,
          resumeLabel: event.resumeLabel || 'Continuar',
        },
      };

    case 'tool_result': {
      const calls = [...(message.toolCalls || [])];
      let matchIdx = -1;
      for (let i = calls.length - 1; i >= 0; i--) {
        if (calls[i].toolName === event.toolName && !calls[i].result) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx >= 0) {
        calls[matchIdx] = {
          ...calls[matchIdx],
          result: {
            success: event.success ?? false,
            data: event.data,
          },
        };
      }
      const next: ChatMessageData = { ...message, toolCalls: calls };
      // A model question only fills the artifact when the system has
      // not asked one already this turn.
      if (event.toolName === 'offer_choices' && event.success && !message.choicePrompts?.length) {
        const artifact = resolveChatChoiceArtifact(next);
        if (artifact.choices.length > 0) {
          next.choicePromptTitle = artifact.question;
          next.choicePrompts = artifact.choices;
        }
      }
      return next;
    }

    case 'error': {
      const errorText = event.message || 'Ocorreu um erro.';
      if (!message.content) return { ...message, content: errorText };
      return { ...message, content: message.content + `\n\n⚠️ ${errorText}` };
    }

    case 'done': {
      const withReasoning = finalizeReasoningSegment(message);
      const artifact = resolveChatChoiceArtifact(withReasoning);
      if (artifact.choices.length === 0) return withReasoning;
      return {
        ...withReasoning,
        choicePromptTitle: artifact.question,
        choicePrompts: artifact.choices,
      };
    }

    default:
      return message;
  }
}

const emptyReply = (id: string): ChatMessageData => ({
  id,
  role: 'assistant',
  content: '',
  contentAfter: '',
  toolCalls: [],
  reasoning: '',
  reasoningSegments: [],
});

/** Attachment metadata without the preview data (for the API / history). */
const withoutPreview = (attachments: ChatAttachmentMeta[]): ChatAttachmentMeta[] =>
  attachments.map(({ name, mimeType }) => ({ name, mimeType }));

/**
 * A message the server never stored, as sent in `priorMessages`: what the
 * user saw before the conversation was recorded (e.g. the onboarding follow-up).
 */
function toPriorSnapshot(message: ChatMessageData): Omit<ChatMessageData, 'id'> {
  const { id: _id, reasoning: _reasoning, attachments, ...rest } = finalizeReasoningSegment(message);
  return attachments ? { ...rest, attachments: withoutPreview(attachments) } : rest;
}

/** A snapshot stored with a message (untrusted shape): only the fields the chat renders. */
function fromSnapshot(id: string, role: ChatMessageData['role'], raw: Record<string, unknown>): ChatMessageData {
  const snapshot = raw as Partial<ChatMessageData>;
  const isObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object';
  const strings = (value: unknown): string[] | undefined =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
  const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
  return {
    id,
    role,
    content: text(snapshot.content) ?? '',
    contentAfter: text(snapshot.contentAfter),
    toolCalls: Array.isArray(snapshot.toolCalls)
      ? snapshot.toolCalls.filter((call) => isObject(call) && typeof call.toolName === 'string')
      : undefined,
    reasoningSegments: strings(snapshot.reasoningSegments),
    attachments: Array.isArray(snapshot.attachments)
      ? withoutPreview(snapshot.attachments.filter(isObject))
      : undefined,
    choicePrompts: strings(snapshot.choicePrompts),
    choicePromptTitle: text(snapshot.choicePromptTitle),
    choiceTaskId: text(snapshot.choiceTaskId),
    choiceTaskTitle: text(snapshot.choiceTaskTitle),
    choiceField: snapshot.choiceField ? toChoiceField(snapshot.choiceField) : undefined,
    journeyNudge:
      isObject(snapshot.journeyNudge) && typeof snapshot.journeyNudge.text === 'string'
        ? snapshot.journeyNudge
        : undefined,
  };
}

/** The messages of a stored conversation (`/api/chats/:id`), as the chat shows them. */
export function restoreChatMessages(stored: ChatStoredMessage[]): ChatMessageData[] {
  return stored.map((message): ChatMessageData => {
    const snapshot = message.data?.message;
    if (snapshot) return fromSnapshot(message.id, message.role, snapshot);
    if (message.role === 'user') {
      const attachments = message.data?.attachments;
      return {
        id: message.id,
        role: 'user',
        content: message.content,
        ...(attachments?.length ? { attachments: withoutPreview(attachments) } : {}),
      };
    }
    const events = message.data?.events;
    if (!events) return { id: message.id, role: 'assistant', content: message.content };
    // Replayed like the live stream, closed by the `done` the history leaves out.
    const replayed = [...(events as SSEEvent[]), { type: 'done' } as SSEEvent].reduce(
      applyChatStreamEvent,
      emptyReply(message.id),
    );
    return finalizeReasoningSegment(replayed);
  });
}

/**
 * `note` runs the general agent with the note (notes, summary, transcript) as
 * extra context; it requires `noteId`.
 */
export type ChatMode = 'task' | 'general' | 'note';

export interface ChatStreamOptions {
  /** The recorded conversation the seeded messages come from (Chats history) */
  conversationId?: string;
  /** The backend recorded this turn in a conversation (new or continued) */
  onConversation?: (conversation: ChatConversationRef) => void;
}

export function useChatStream(
  mode: ChatMode,
  taskId?: string,
  seededMessages: ChatMessageData[] = [],
  noteId?: string,
  options: ChatStreamOptions = {},
) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessageData[]>(seededMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The recorded conversation the next turn continues (none: a new one).
  const conversationIdRef = useRef<string | null>(options.conversationId ?? null);
  // Its title as last sent by the backend (null: not seen yet this session).
  const conversationTitleRef = useRef<string | null>(null);
  const onConversationRef = useRef(options.onConversation);
  onConversationRef.current = options.onConversation;

  const sendMessage = useCallback(async (text: string, attachments: ChatAttachment[] = []) => {
    const trimmed = text.trim();
    if (!token || (!trimmed && attachments.length === 0) || isStreaming) return;

    const userMsg: ChatMessageData = {
      id: nextId(),
      role: 'user',
      content: trimmed,
      attachments: attachments.map(({ name, mimeType, data }) => ({
        name,
        mimeType,
        previewUrl: `data:${mimeType};base64,${data}`,
      })),
    };

    setMessages((prev) => [...prev, userMsg]);

    // Which system question this message answers — lets the backend apply a
    // quick reply ("Amanhã", "9h", "Sem lembrete", "ok") without the model.
    const pendingQuestion = pendingQuestionOf(messages);

    const historyForApi = [...messages, userMsg].map((m) => {
      const artifact = m.role === 'assistant' ? resolveChatChoiceArtifact(m) : null;
      const choiceLine =
        artifact && artifact.choices.length > 0
          ? [artifact.question, `Opções: ${artifact.choices.join(' | ')}`].filter(Boolean).join('\n')
          : '';
      return {
        role: m.role,
        content: stripTaskRefs(
          [
            artifact ? artifact.content : m.content,
            artifact ? artifact.contentAfter : m.contentAfter,
            choiceLine,
            m.role === 'assistant' ? m.journeyNudge?.text : undefined,
          ].filter(Boolean).join('\n\n'),
        ),
      };
    });

    // Chats history: continue the recorded conversation, or start one with
    // what the user already saw (e.g. the onboarding follow-up).
    const conversationId = conversationIdRef.current;
    const priorMessages = conversationId ? [] : messages.map(toPriorSnapshot);

    const assistantId = nextId();
    setMessages((prev) => [...prev, emptyReply(assistantId)]);
    setIsStreaming(true);
    setIsWaiting(true);
    setThinkingStatus('Preparando resposta…');

    const controller = new AbortController();
    abortRef.current = controller;

    const updateAssistant = (updater: (message: ChatMessageData) => ChatMessageData) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? updater(m) : m)),
      );
    };

    const finalizeAssistantReasoning = () => {
      updateAssistant((m) => finalizeReasoningSegment(m));
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: historyForApi,
          mode,
          taskId,
          ...(mode === 'note' ? { noteId } : {}),
          ...(pendingQuestion ? { pendingQuestion } : {}),
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(conversationId ? { conversationId } : {}),
          ...(priorMessages.length > 0 ? { priorMessages } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data: ')) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(trimmedLine.slice(6));
          } catch {
            continue;
          }

          switch (event.type) {
            case 'conversation':
              if (event.id) {
                const title = event.title || '';
                // A new conversation, or its AI title: the history list changed.
                const listChanged =
                  event.id !== conversationIdRef.current ||
                  (conversationTitleRef.current !== null && title !== conversationTitleRef.current);
                conversationIdRef.current = event.id;
                conversationTitleRef.current = title;
                onConversationRef.current?.({ id: event.id, title });
                if (listChanged) {
                  void queryClient.invalidateQueries({ queryKey: chatsKeys.all, exact: true });
                }
              }
              break;

            case 'status':
              if (event.message) {
                setThinkingStatus(event.message);
              }
              break;

            case 'reasoning':
            case 'text':
            case 'journey_nudge':
              setIsWaiting(false);
              updateAssistant((m) => applyChatStreamEvent(m, event));
              break;

            case 'separator':
            case 'tool_call':
              setIsWaiting(true);
              updateAssistant((m) => applyChatStreamEvent(m, event));
              break;

            default:
              updateAssistant((m) => applyChatStreamEvent(m, event));
              break;
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && !m.content
              ? { ...m, content: 'Não foi possível conectar ao servidor.' }
              : m,
          ),
        );
      }
    } finally {
      finalizeAssistantReasoning();
      setIsStreaming(false);
      setIsWaiting(false);
      setThinkingStatus(null);
      abortRef.current = null;
      // The turn changed the history (the reply is stored before the stream ends).
      if (conversationIdRef.current) {
        void queryClient.invalidateQueries({ queryKey: chatsKeys.all });
      }
    }
  }, [token, messages, isStreaming, mode, taskId, noteId, queryClient]);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    conversationIdRef.current = null;
    conversationTitleRef.current = null;
    setMessages([]);
    setIsStreaming(false);
    setIsWaiting(false);
    setThinkingStatus(null);
  }, []);

  const stop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { messages, sendMessage, isStreaming, isWaiting, thinkingStatus, reset, stop };
}
