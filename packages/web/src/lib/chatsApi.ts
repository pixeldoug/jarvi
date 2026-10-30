/**
 * Chats API — typed fetchers for `/api/chats`, the user's conversation
 * history (mirrors backend services/chatHistoryService.ts). Conversations are
 * recorded by `POST /api/ai/chat` (see useChatStream), not created here.
 */

import { apiClient } from './apiClient';

export type ChatConversationMode = 'general' | 'task' | 'note';

export interface ChatConversationListItem {
  id: string;
  /** '' when the first message had no text (UI shows "Nova conversa") */
  title: string;
  /** Context of the latest turn: the conversation continues with it */
  mode: ChatConversationMode;
  task_id: string | null;
  note_id: string | null;
  created_at: string;
  /** Last message */
  updated_at: string;
}

/** An SSE event of `/api/ai/chat` as stored with a reply (no status / done). */
export type ChatStoredEvent = { type: string } & Record<string, unknown>;

export interface ChatStoredMessageData {
  /** User message: names of the files sent (the files are never stored) */
  attachments?: Array<{ name: string; mimeType: string }>;
  /** Reply: the stream events the web received, replayed to rebuild it */
  events?: ChatStoredEvent[];
  /** Snapshot of a message shown before the conversation was recorded (e.g. the onboarding follow-up) */
  message?: Record<string, unknown>;
}

export interface ChatStoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** null: plain text */
  data: ChatStoredMessageData | null;
  created_at: string;
}

export interface ChatConversationDetail extends ChatConversationListItem {
  /** In order. A task / note that is gone turns `mode` into 'general'. */
  messages: ChatStoredMessage[];
}

export const chatsApi = {
  list(): Promise<ChatConversationListItem[]> {
    return apiClient.get<ChatConversationListItem[]>('/api/chats');
  },

  get(id: string): Promise<ChatConversationDetail> {
    return apiClient.get<ChatConversationDetail>(`/api/chats/${encodeURIComponent(id)}`);
  },

  remove(id: string): Promise<{ id: string }> {
    return apiClient.delete<{ id: string }>(`/api/chats/${encodeURIComponent(id)}`);
  },
};
