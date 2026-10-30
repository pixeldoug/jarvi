/**
 * Chats data hooks (react-query).
 *
 * Keys: `['chats']` for the list, `['chats', id]` for a conversation. Every
 * chat turn changes the history, so useChatStream invalidates `['chats']`
 * when a reply ends.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../lib/apiClient';
import {
  chatsApi,
  type ChatConversationDetail,
  type ChatConversationListItem,
} from '../lib/chatsApi';

export const chatsKeys = {
  all: ['chats'] as const,
  detail: (id: string) => ['chats', id] as const,
};

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function useChatsList(options: { enabled?: boolean } = {}) {
  const { token } = useAuth();
  return useQuery<ChatConversationListItem[]>({
    queryKey: chatsKeys.all,
    queryFn: () => chatsApi.list(),
    enabled: !!token && (options.enabled ?? true),
    retry: shouldRetry,
  });
}

/**
 * One conversation, fetched fresh each time it is opened: the chat is built
 * from it once, so a cached copy missing the latest turns must not be used.
 */
export function useChat(id: string | null) {
  const { token } = useAuth();
  return useQuery<ChatConversationDetail>({
    queryKey: chatsKeys.detail(id ?? ''),
    queryFn: () => chatsApi.get(id as string),
    enabled: !!token && !!id,
    gcTime: 0,
    retry: shouldRetry,
  });
}

export function isChatNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function useChatMutations() {
  const queryClient = useQueryClient();

  /**
   * The open conversation's query is left alone (removing it would refetch a
   * 404 before the page leaves it); `useChat` drops it once unmounted.
   */
  const deleteChat = useCallback(async (id: string) => {
    await chatsApi.remove(id);
    queryClient.setQueryData<ChatConversationListItem[]>(chatsKeys.all, (old) =>
      old?.filter((chat) => chat.id !== id),
    );
  }, [queryClient]);

  return { deleteChat };
}
