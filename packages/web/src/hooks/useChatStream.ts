import { useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contentAfter?: string;
  toolCalls?: ToolCallData[];
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
  type: 'text' | 'tool_call' | 'tool_result' | 'separator' | 'done' | 'error';
  content?: string;
  message?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  success?: boolean;
  data?: Record<string, unknown>;
}

let messageIdCounter = 0;
const nextId = () => `msg-${++messageIdCounter}-${Date.now()}`;

export function useChatStream(mode: 'task' | 'general', taskId?: string) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!token || !text.trim() || isStreaming) return;

    const userMsg: ChatMessageData = { id: nextId(), role: 'user', content: text.trim() };

    setMessages((prev) => [...prev, userMsg]);

    const historyForApi = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: [m.content, m.contentAfter].filter(Boolean).join('\n\n'),
    }));

    const assistantId = nextId();
    let afterSeparator = false;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', contentAfter: '', toolCalls: [] }]);
    setIsStreaming(true);
    setIsWaiting(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: historyForApi, mode, taskId }),
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
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(trimmed.slice(6));
          } catch {
            continue;
          }

          switch (event.type) {
            case 'text':
              setIsWaiting(false);
              if (afterSeparator) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, contentAfter: (m.contentAfter || '') + (event.content || '') }
                      : m,
                  ),
                );
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + (event.content || '') }
                      : m,
                  ),
                );
              }
              break;

            case 'separator':
              afterSeparator = true;
              setIsWaiting(true);
              break;

            case 'tool_call':
              setIsWaiting(true);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls || []),
                          {
                            toolName: event.toolName || '',
                            toolArgs: event.toolArgs || {},
                          },
                        ],
                      }
                    : m,
                ),
              );
              break;

            case 'tool_result':
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
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
                }),
              );
              break;

            case 'error': {
              const errorText = event.message || 'Ocorreu um erro.';
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  if (!m.content) return { ...m, content: errorText };
                  if (afterSeparator) {
                    return { ...m, contentAfter: (m.contentAfter || '') + (m.contentAfter ? '\n\n' : '') + `⚠️ ${errorText}` };
                  }
                  return { ...m, content: m.content + `\n\n⚠️ ${errorText}` };
                }),
              );
              break;
            }

            case 'done':
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
      setIsStreaming(false);
      setIsWaiting(false);
      abortRef.current = null;
    }
  }, [token, messages, isStreaming, mode, taskId]);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setIsStreaming(false);
    setIsWaiting(false);
  }, []);

  const stop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { messages, sendMessage, isStreaming, isWaiting, reset, stop };
}
