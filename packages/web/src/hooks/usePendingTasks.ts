import { useCallback, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../components/ui/Sonner';

export interface PendingTask {
  id: string;
  user_id: string;
  source: string;
  raw_content: string | null;
  transcription: string | null;
  original_whatsapp_content: string | null;
  media_attachments: string | null;
  suggested_title: string;
  suggested_description: string | null;
  suggested_priority: 'low' | 'medium' | 'high' | null;
  suggested_due_date: string | null;
  suggested_time: string | null;
  suggested_category: string | null;
  status: 'awaiting_confirmation' | 'confirmed' | 'rejected' | 'expired';
  whatsapp_message_sid: string | null;
  whatsapp_phone: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UsePendingTasksResult {
  pendingTasks: PendingTask[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  confirm: (id: string) => Promise<void>;
  reject: (id: string) => Promise<void>;
  update: (
    id: string,
    updates: Partial<{
      title: string;
      description: string | null;
      priority: 'low' | 'medium' | 'high' | null;
      dueDate: string | null;
      time: string | null;
      category: string | null;
    }>
  ) => Promise<void>;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const usePendingTasks = (): UsePendingTasksResult => {
  const { token } = useAuth();
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setPendingTasks([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/pending-tasks`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Falha ao buscar tarefas pendentes');
      }

      const data = (await response.json()) as PendingTask[];
      setPendingTasks(data);
    } catch (fetchError) {
      console.error('Error loading pending tasks:', fetchError);
      setError('Não foi possível carregar as tarefas pendentes.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const confirm = useCallback(
    async (id: string) => {
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/pending-tasks/${id}/confirm`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Falha ao confirmar tarefa pendente');
      }

      setPendingTasks((prev) => prev.filter((task) => task.id !== id));
      toast.success('Tarefa confirmada e criada com sucesso.');
    },
    [token]
  );

  const reject = useCallback(
    async (id: string) => {
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/pending-tasks/${id}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Falha ao rejeitar tarefa pendente');
      }

      setPendingTasks((prev) => prev.filter((task) => task.id !== id));
      toast.success('Sugestão rejeitada.');
    },
    [token]
  );

  const update = useCallback(
    async (
      id: string,
      updates: Partial<{
        title: string;
        description: string | null;
        priority: 'low' | 'medium' | 'high' | null;
        dueDate: string | null;
        time: string | null;
        category: string | null;
      }>
    ) => {
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/pending-tasks/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Falha ao atualizar sugestão de tarefa');
      }

      const updatedTask = (await response.json()) as PendingTask;
      setPendingTasks((prev) => prev.map((task) => (task.id === id ? updatedTask : task)));
    },
    [token]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) return;

    const socket: Socket = io(API_BASE_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('pending-task:created', (payload: { id: string; source?: string }) => {
      const sourceLabel = payload.source === 'gmail' ? 'Gmail' : 'WhatsApp';
      toast.success(`Nova tarefa sugerida via ${sourceLabel}.`);
      void refresh();
    });

    socket.on('pending-task:updated', (payload: { id: string; status: string }) => {
      setPendingTasks((prev) => prev.filter((task) => task.id !== payload.id));
    });

    socket.on('connect_error', (socketError) => {
      console.error('Pending tasks socket error:', socketError);
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  return {
    pendingTasks,
    isLoading,
    error,
    refresh,
    confirm,
    reject,
    update,
  };
};
