import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../components/ui/Sonner';

export interface PendingTask {
  id: string;
  user_id: string;
  source: string;
  raw_content: string | null;
  transcription: string | null;
  suggested_title: string;
  suggested_description: string | null;
  suggested_priority: 'low' | 'medium' | 'high' | null;
  suggested_due_date: string | null;
  suggested_time: string | null;
  suggested_category: string | null;
  suggested_important: boolean;
  status: 'awaiting_confirmation' | 'confirmed' | 'rejected' | 'expired';
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PendingTaskUpdatePayload {
  title?: string;
  description?: string | null;
  priority?: 'low' | 'medium' | 'high' | null;
  dueDate?: string | null;
  time?: string | null;
  category?: string | null;
  important?: boolean;
}

interface UsePendingTasksResult {
  pendingTasks: PendingTask[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  confirm: (id: string) => Promise<void>;
  reject: (id: string) => Promise<void>;
  update: (id: string, updates: PendingTaskUpdatePayload) => Promise<void>;
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
        throw new Error('Failed to load pending tasks');
      }

      const data = (await response.json()) as PendingTask[];
      setPendingTasks(data);
    } catch (fetchError) {
      console.error('Error loading pending tasks:', fetchError);
      setError('Nao foi possivel carregar as sugestoes pendentes.');
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
        throw new Error('Failed to confirm pending task');
      }

      setPendingTasks((prev) => prev.filter((task) => task.id !== id));
      toast.success('Tarefa criada com sucesso.');
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
        throw new Error('Failed to reject pending task');
      }

      setPendingTasks((prev) => prev.filter((task) => task.id !== id));
      toast.success('Sugestao rejeitada.');
    },
    [token]
  );

  const update = useCallback(
    async (id: string, updates: PendingTaskUpdatePayload) => {
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
        throw new Error('Failed to update pending task');
      }

      const updatedTask = (await response.json()) as PendingTask;
      setPendingTasks((prev) => prev.map((task) => (task.id === id ? updatedTask : task)));
      toast.success('Sugestao atualizada.');
    },
    [token]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
