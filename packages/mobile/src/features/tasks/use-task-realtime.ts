import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { API_URL, getSessionToken, localeHeaders } from '@/api/client';
import { i18n } from '@/i18n';
import { useToast } from '@/ui/toast';
import { queryKeys } from './use-tasks';

/**
 * Keeps the task list fresh when tasks change elsewhere (WhatsApp, the web,
 * the AI agent). The socket only lives while the app is in the foreground.
 */
export function useTaskRealtime() {
  const queryClient = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    let socket: Socket | null = null;

    const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });

    const connect = () => {
      const token = getSessionToken();
      if (!token || socket) return;
      socket = io(API_URL, { auth: { token }, transports: ['websocket'], extraHeaders: localeHeaders() });
      socket.on('task:created', (payload?: { source?: string }) => {
        refresh();
        if (payload?.source === 'whatsapp') toast({ message: i18n.t('tasks:toast.createdFromWhatsApp') });
      });
      socket.on('task:changed', refresh);
    };

    const disconnect = () => {
      socket?.disconnect();
      socket = null;
    };

    connect();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        connect();
        refresh();
      } else if (state === 'background') {
        disconnect();
      }
    });

    return () => {
      subscription.remove();
      disconnect();
    };
  }, [queryClient, toast]);
}
