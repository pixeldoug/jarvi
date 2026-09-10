import { useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { resolveChatChoiceArtifact } from '../lib/chatChoicePrompts';
import { stripTaskRefs } from '../lib/taskRefs';

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

export function useChatStream(
  mode: 'task' | 'general',
  taskId?: string,
  seededMessages: ChatMessageData[] = [],
) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessageData[]>(seededMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

    const assistantId = nextId();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        contentAfter: '',
        toolCalls: [],
        reasoning: '',
        reasoningSegments: [],
      },
    ]);
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
          ...(pendingQuestion ? { pendingQuestion } : {}),
          ...(attachments.length > 0 ? { attachments } : {}),
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
            case 'status':
              if (event.message) {
                setThinkingStatus(event.message);
              }
              break;

            case 'reasoning':
              setIsWaiting(false);
              updateAssistant((m) => ({
                ...m,
                reasoning: (m.reasoning || '') + (event.content || ''),
              }));
              break;

            case 'text':
              setIsWaiting(false);
              updateAssistant((m) => ({
                ...m,
                content: m.content + (event.content || ''),
              }));
              break;

            case 'separator':
              // The agent is restarting this turn (guardrail retry). The retry
              // supersedes the previous attempt — `runAgent` returns only the
              // last text — so the partial answer already streamed must go.
              finalizeAssistantReasoning();
              setIsWaiting(true);
              updateAssistant((m) => ({ ...m, content: '' }));
              break;

            case 'tool_call':
              finalizeAssistantReasoning();
              setIsWaiting(true);
              updateAssistant((m) => ({
                ...m,
                toolCalls: [
                  ...(m.toolCalls || []),
                  {
                    toolName: event.toolName || '',
                    toolArgs: event.toolArgs || {},
                  },
                ],
              }));
              break;

            case 'choices':
              // The backend decided the next question. It is the source of
              // truth for the artifact — `done` keeps it (see below).
              updateAssistant((m) => ({
                ...m,
                choicePromptTitle: event.question || undefined,
                choicePrompts: Array.isArray(event.choices) ? event.choices : [],
                choiceTaskId: event.taskId || undefined,
                choiceTaskTitle: event.taskTitle || undefined,
                choiceField: toChoiceField(event.field),
              }));
              break;

            case 'journey_nudge':
              setIsWaiting(false);
              updateAssistant((m) => ({
                ...m,
                journeyNudge: {
                  text: event.text || '',
                  remaining: typeof event.remaining === 'number' ? event.remaining : 0,
                  resumeLabel: event.resumeLabel || 'Continuar',
                },
              }));
              break;

            case 'tool_result':
              updateAssistant((m) => {
                const calls = [...(m.toolCalls || [])];
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
                const next: ChatMessageData = { ...m, toolCalls: calls };
                // A model question only fills the artifact when the system has
                // not asked one already this turn.
                if (event.toolName === 'offer_choices' && event.success && !m.choicePrompts?.length) {
                  const artifact = resolveChatChoiceArtifact(next);
                  if (artifact.choices.length > 0) {
                    next.choicePromptTitle = artifact.question;
                    next.choicePrompts = artifact.choices;
                  }
                }
                return next;
              });
              break;

            case 'error': {
              const errorText = event.message || 'Ocorreu um erro.';
              updateAssistant((m) => {
                if (!m.content) return { ...m, content: errorText };
                return { ...m, content: m.content + `\n\n⚠️ ${errorText}` };
              });
              break;
            }

            case 'done':
              updateAssistant((m) => {
                const withReasoning = finalizeReasoningSegment(m);
                const artifact = resolveChatChoiceArtifact(withReasoning);
                if (artifact.choices.length === 0) return withReasoning;
                return {
                  ...withReasoning,
                  choicePromptTitle: artifact.question,
                  choicePrompts: artifact.choices,
                };
              });
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
    }
  }, [token, messages, isStreaming, mode, taskId]);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
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
