import { useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

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
  type: 'text' | 'reasoning' | 'status' | 'tool_call' | 'tool_result' | 'separator' | 'done' | 'error';
  content?: string;
  message?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  success?: boolean;
  data?: Record<string, unknown>;
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

export function useChatStream(mode: 'task' | 'general', taskId?: string) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
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

    const historyForApi = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: [m.content, m.contentAfter].filter(Boolean).join('\n\n'),
    }));

    const assistantId = nextId();
    let afterSeparator = false;
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
              if (afterSeparator) {
                updateAssistant((m) => ({
                  ...m,
                  contentAfter: (m.contentAfter || '') + (event.content || ''),
                }));
              } else {
                updateAssistant((m) => ({
                  ...m,
                  content: m.content + (event.content || ''),
                }));
              }
              break;

            case 'separator':
              afterSeparator = true;
              finalizeAssistantReasoning();
              setIsWaiting(true);
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
                return { ...m, toolCalls: calls };
              });
              break;

            case 'error': {
              const errorText = event.message || 'Ocorreu um erro.';
              updateAssistant((m) => {
                if (!m.content) return { ...m, content: errorText };
                if (afterSeparator) {
                  return {
                    ...m,
                    contentAfter:
                      (m.contentAfter || '') +
                      (m.contentAfter ? '\n\n' : '') +
                      `⚠️ ${errorText}`,
                  };
                }
                return { ...m, content: m.content + `\n\n⚠️ ${errorText}` };
              });
              break;
            }

            case 'done':
              finalizeAssistantReasoning();
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
