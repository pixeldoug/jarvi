import { useQueryClient } from '@tanstack/react-query';
import { fetch } from 'expo/fetch';
import { useCallback, useEffect, useRef, useState } from 'react';

import { API_URL, getSessionToken, localeHeaders, reportApiFailure } from '@/api/client';
import { i18n } from '@/i18n';
import { queryKeys } from '@/features/tasks/use-tasks';
import { pendingQuestionOf, resolveChoiceArtifact } from './choices';
import { createStreamParser, type ChatStreamEvent } from './sse';
import { stripTaskRefs } from './task-refs';
import type { ChatChoiceField, ChatMessageData } from './types';

/** Tools whose success means the task list changed. */
const TASK_WRITE_TOOLS = new Set(['create_task', 'update_task', 'complete_task', 'delete_task']);
const CATEGORY_WRITE_TOOLS = new Set(['create_category', 'update_category', 'delete_category']);
const LIST_WRITE_TOOLS = new Set(['create_list', 'update_list', 'delete_list']);

export interface ChatSession {
  messages: ChatMessageData[];
  isStreaming: boolean;
  /** True until the first visible token of the current turn arrives. */
  isWaiting: boolean;
  status: string | null;
  send: (text: string) => Promise<void>;
  stop: () => void;
  /** Starts a new conversation. */
  reset: () => void;
  /** Replaces the conversation, e.g. with the onboarding follow-up. */
  seed: (messages: ChatMessageData[]) => void;
}

/** `general` is the Jarvi tab; `note` adds one note as context (POST /api/ai/chat `noteId`). */
export type ChatSessionOptions = { mode: 'general' } | { mode: 'note'; noteId: string };

let idCounter = 0;
const nextId = () => `msg-${++idCounter}-${Date.now()}`;

const toChoiceField = (value: unknown): ChatChoiceField =>
  value === 'time' || value === 'reminders' ? value : 'due_date';

/** The plain-text history the agent reads on every turn. */
function historyForApi(messages: ChatMessageData[]) {
  return messages.map((message) => {
    const artifact = message.role === 'assistant' ? resolveChoiceArtifact(message) : null;
    const choiceLine =
      artifact && artifact.choices.length > 0
        ? [artifact.question, i18n.t('chat:stream.optionsLine', { options: artifact.choices.join(' | ') })]
            .filter(Boolean)
            .join('\n')
        : '';
    return {
      role: message.role,
      content: stripTaskRefs(
        [
          artifact ? artifact.content : message.content,
          artifact ? artifact.contentAfter : message.contentAfter,
          choiceLine,
          message.role === 'assistant' ? message.journeyNudge?.text : undefined,
        ]
          .filter(Boolean)
          .join('\n\n'),
      ),
    };
  });
}

/**
 * A message the server never stored, sent as `priorMessages` when a
 * conversation starts (e.g. the onboarding follow-up), so the Chats history
 * shows what the user saw. Same snapshot as the web's `toPriorSnapshot`.
 */
function toPriorSnapshot({ id: _id, reasoning: _reasoning, ...rest }: ChatMessageData) {
  return rest;
}

/**
 * One AI conversation streamed from POST /api/ai/chat. Port of web
 * hooks/useChatStream.ts. The backend records every turn (Chats history): the
 * first SSE event names the conversation, and the next turns send its id.
 */
export function useChatSession(options: ChatSessionOptions, initialMessages: ChatMessageData[] = []): ChatSession {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  // `send` builds the history from the latest committed messages.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const mode = options.mode;
  const noteId = options.mode === 'note' ? options.noteId : undefined;

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const token = getSessionToken();
      if (!token || !trimmed || abortRef.current) return;

      const previous = messagesRef.current;
      const userMessage: ChatMessageData = { id: nextId(), role: 'user', content: trimmed };
      const assistantId = nextId();
      const pendingQuestion = pendingQuestionOf(previous);
      const history = historyForApi([...previous, userMessage]);
      // Continue the recorded conversation, or start one with what the user already saw.
      const conversationId = conversationIdRef.current;
      const priorMessages = conversationId ? [] : previous.map(toPriorSnapshot);

      setMessages([...previous, userMessage, { id: assistantId, role: 'assistant', content: '', toolCalls: [] }]);
      setIsStreaming(true);
      setIsWaiting(true);
      setStatus(i18n.t('chat:stream.preparing'));

      const controller = new AbortController();
      abortRef.current = controller;
      const touched = new Set<'tasks' | 'categories' | 'lists'>();

      const updateAssistant = (update: (message: ChatMessageData) => ChatMessageData) =>
        setMessages((current) => current.map((m) => (m.id === assistantId ? update(m) : m)));

      const handleEvent = (event: ChatStreamEvent) => {
        switch (event.type) {
          case 'conversation':
            // A reset while the turn was in flight already dropped this stream.
            if (event.id && !controller.signal.aborted) conversationIdRef.current = event.id;
            break;
          case 'status':
            if (event.message) setStatus(event.message);
            break;
          case 'reasoning':
            setIsWaiting(false);
            updateAssistant((m) => ({ ...m, reasoning: (m.reasoning ?? '') + (event.content ?? '') }));
            break;
          case 'text':
            setIsWaiting(false);
            updateAssistant((m) => ({ ...m, content: m.content + (event.content ?? '') }));
            break;
          case 'separator':
            // Guardrail retry: the new attempt supersedes the streamed text.
            setIsWaiting(true);
            updateAssistant((m) => ({ ...m, content: '', reasoning: '' }));
            break;
          case 'tool_call':
            setIsWaiting(true);
            updateAssistant((m) => ({
              ...m,
              reasoning: '',
              toolCalls: [...(m.toolCalls ?? []), { toolName: event.toolName ?? '', toolArgs: event.toolArgs ?? {} }],
            }));
            break;
          case 'tool_result':
            if (event.success && event.toolName) {
              if (TASK_WRITE_TOOLS.has(event.toolName)) touched.add('tasks');
              if (CATEGORY_WRITE_TOOLS.has(event.toolName)) touched.add('categories');
              if (LIST_WRITE_TOOLS.has(event.toolName)) touched.add('lists');
            }
            updateAssistant((m) => {
              const calls = [...(m.toolCalls ?? [])];
              const index = calls.findLastIndex((call) => call.toolName === event.toolName && !call.result);
              if (index >= 0) {
                calls[index] = { ...calls[index]!, result: { success: event.success ?? false, data: event.data } };
              }
              const next: ChatMessageData = { ...m, toolCalls: calls };
              if (event.toolName === 'offer_choices' && event.success && !m.choicePrompts?.length) {
                const artifact = resolveChoiceArtifact(next);
                if (artifact.choices.length > 0) {
                  next.choicePromptTitle = artifact.question;
                  next.choicePrompts = artifact.choices;
                }
              }
              return next;
            });
            break;
          case 'choices':
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
                text: event.text ?? '',
                remaining: typeof event.remaining === 'number' ? event.remaining : 0,
                resumeLabel: event.resumeLabel || i18n.t('chat:stream.resume'),
              },
            }));
            break;
          case 'error': {
            const errorText = event.message || i18n.t('chat:stream.error');
            updateAssistant((m) => ({ ...m, content: m.content ? `${m.content}\n\n⚠️ ${errorText}` : errorText }));
            break;
          }
          case 'done':
            updateAssistant((m) => {
              const artifact = resolveChoiceArtifact(m);
              return artifact.choices.length === 0
                ? { ...m, reasoning: '' }
                : { ...m, reasoning: '', choicePromptTitle: artifact.question, choicePrompts: artifact.choices };
            });
            break;
        }
      };

      try {
        const response = await fetch(`${API_URL}/api/ai/chat`, {
          method: 'POST',
          headers: {
            ...localeHeaders(),
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            messages: history,
            mode,
            ...(noteId ? { noteId } : {}),
            ...(pendingQuestion ? { pendingQuestion } : {}),
            ...(conversationId ? { conversationId } : {}),
            ...(priorMessages.length > 0 ? { priorMessages } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const raw: unknown = await response.json().catch(() => ({}));
          const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
          // Same session / paywall rules as api/client.ts (old Portuguese text and new codes).
          reportApiFailure(response.status, body, token);
          throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`);
        }

        const parser = createStreamParser(handleEvent);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true }));
        }
        parser.end();
      } catch (error) {
        if (!controller.signal.aborted) {
          updateAssistant((m) =>
            m.content ? m : { ...m, content: i18n.t('chat:stream.connectionError') },
          );
          if (error instanceof Error) console.warn('chat stream failed', error.message);
        }
      } finally {
        // Stopping only drops the stream; the agent may still have changed tasks.
        if (controller.signal.aborted) touched.add('tasks');
        abortRef.current = null;
        setIsStreaming(false);
        setIsWaiting(false);
        setStatus(null);
        if (touched.has('tasks')) void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
        if (touched.has('categories')) void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
        if (touched.has('lists')) void queryClient.invalidateQueries({ queryKey: queryKeys.lists });
      }
    },
    [queryClient, mode, noteId],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // Sign-out, the trial gate or closing the screen unmounts the chat; drop any stream in flight.
  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    conversationIdRef.current = null;
    setMessages([]);
  }, []);

  const seed = useCallback((seeded: ChatMessageData[]) => {
    abortRef.current?.abort();
    conversationIdRef.current = null;
    setMessages(seeded);
  }, []);

  return { messages, isStreaming, isWaiting, status, send, stop, reset, seed };
}
