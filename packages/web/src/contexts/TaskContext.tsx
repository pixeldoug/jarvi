import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { usePostHog } from 'posthog-js/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  original_whatsapp_content?: string | null;
  media_attachments?: string | null;
  completed: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  important?: boolean;
  time?: string;
  due_date?: string;
  recurrence_type?: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrence_config?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskData {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  important?: boolean;
  time?: string;
  dueDate?: string;
  recurrence_type?: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrence_config?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  important?: boolean;
  time?: string;
  dueDate?: string;
  recurrence_type?: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrence_config?: string;
}

export interface SubTask {
  id: string;
  task_id: string;
  user_id: string;
  title: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

interface TaskContextType {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  fetchTasks: () => Promise<void>;
  createTask: (taskData: CreateTaskData, showLoading?: boolean) => Promise<Task>;
  updateTask: (taskId: string, taskData: UpdateTaskData, showLoading?: boolean) => Promise<void>;
  deleteTask: (taskId: string, showLoading?: boolean) => Promise<Task | null>;
  undoDeleteTask: (taskId: string) => Promise<boolean>;
  toggleTaskCompletion: (taskId: string) => Promise<void>;
  reorderTasks: (reorderedTasks: Task[]) => void;
  subtasksByTaskId: Record<string, SubTask[]>;
  fetchSubTasks: (taskId: string) => Promise<void>;
  createSubTask: (taskId: string, title: string) => Promise<SubTask>;
  updateSubTask: (taskId: string, subtaskId: string, title: string) => Promise<void>;
  toggleSubTask: (taskId: string, subtaskId: string) => Promise<void>;
  deleteSubTask: (taskId: string, subtaskId: string) => Promise<void>;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const useTasks = () => {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};

interface TaskProviderProps {
  children: ReactNode;
}

const sortTasks = (tasks: Task[]): Task[] => {
  return [...tasks].sort((a, b) => {
    if (a.due_date && b.due_date) {
      const dateOnlyA = a.due_date;
      const dateOnlyB = b.due_date;

      if (dateOnlyA !== dateOnlyB) {
        return dateOnlyA.localeCompare(dateOnlyB);
      }

      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;

      if (a.time && b.time) {
        return a.time.localeCompare(b.time);
      }

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }

    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
};

export const TaskProvider: React.FC<TaskProviderProps> = ({ children }) => {
  const [subtasksByTaskId, setSubtasksByTaskId] = useState<Record<string, SubTask[]>>({});
  const [deletedTasks, setDeletedTasks] = useState<{ task: Task; deletedAt: number; originalIndex: number }[]>(() => {
    try {
      const stored = localStorage.getItem('jarvi_deleted_tasks');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.length > 100 || parsed.some((item: any) => !item.task || !item.task.id)) {
          localStorage.removeItem('jarvi_deleted_tasks');
          return [];
        }
        const now = Date.now();
        return parsed.filter((deleted: { task: Task; deletedAt: number; originalIndex?: number }) =>
          deleted && deleted.task && deleted.task.id && (now - deleted.deletedAt < 30000)
        );
      }
    } catch {
      localStorage.removeItem('jarvi_deleted_tasks');
    }
    return [];
  });
  const { token } = useAuth();
  const posthog = usePostHog();
  const queryClient = useQueryClient();

  // Persist deletedTasks to localStorage
  useEffect(() => {
    if (deletedTasks.length === 0) return;
    try {
      const validTasks = deletedTasks.filter(deleted =>
        deleted && deleted.task && deleted.task.id && typeof deleted.deletedAt === 'number'
      );
      if (validTasks.length !== deletedTasks.length) {
        setDeletedTasks(validTasks);
        return;
      }
      localStorage.setItem('jarvi_deleted_tasks', JSON.stringify(deletedTasks));
    } catch { /* ignore */ }
  }, [deletedTasks]);

  // Clean up old deleted tasks every 10 seconds
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setDeletedTasks(prev => {
        const now = Date.now();
        return prev.filter(deleted => now - deleted.deletedAt < 30000);
      });
    }, 10000);
    return () => clearInterval(cleanupInterval);
  }, []);

  // ── React Query: tasks fetch ──────────────────────────────────────────────
  const {
    data: tasksData,
    isLoading: isQueryLoading,
    error: queryError,
  } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => apiClient.get<Task[]>('/api/tasks'),
    enabled: !!token,
    select: sortTasks,
  });

  const tasks = tasksData ?? [];
  const isLoading = isQueryLoading;
  const error = queryError ? 'Failed to fetch tasks' : null;

  const fetchTasks = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
  }, [queryClient]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (taskData: CreateTaskData) =>
      apiClient.post<Task>('/api/tasks', {
        ...taskData,
        dueDate: taskData.dueDate,
        important: taskData.important || false,
      }),
    onSuccess: (newTask) => {
      queryClient.setQueryData<Task[]>(['tasks'], (old) =>
        sortTasks([...(old ?? []), newTask]),
      );
      if (posthog) {
        posthog.capture('task_created', {
          task_id: newTask.id,
          priority: newTask.priority,
          has_due_date: !!newTask.due_date,
          has_category: !!newTask.category,
          is_important: newTask.important || false,
          has_recurrence: newTask.recurrence_type && newTask.recurrence_type !== 'none',
        });
      }
    },
  });

  const createTask = useCallback(async (taskData: CreateTaskData, _showLoading?: boolean): Promise<Task> => {
    if (!token) throw new Error('No authentication token');
    return createMutation.mutateAsync(taskData);
  }, [token, createMutation]);

  const updateTask = useCallback(async (taskId: string, taskData: UpdateTaskData, _showLoading?: boolean) => {
    if (!token) return;

    // Optimistic update
    queryClient.setQueryData<Task[]>(['tasks'], (old) =>
      (old ?? []).map(task => task.id === taskId ? { ...task, ...taskData } : task),
    );

    try {
      const requestData = {
        ...taskData,
        dueDate: taskData.dueDate === undefined ? null : taskData.dueDate,
        important: taskData.important !== undefined ? taskData.important : false,
      };

      const updatedTask = await apiClient.put<Task>(`/api/tasks/${taskId}`, requestData);
      queryClient.setQueryData<Task[]>(['tasks'], (old) =>
        sortTasks((old ?? []).map(task => task.id === taskId ? updatedTask : task)),
      );
    } catch (err) {
      // Revert on error
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      throw err;
    }
  }, [token, queryClient]);

  const deleteTask = useCallback(async (taskId: string, _showLoading?: boolean): Promise<Task | null> => {
    if (!token) return null;

    const currentTasks = queryClient.getQueryData<Task[]>(['tasks']) ?? [];
    const taskToDelete = currentTasks.find(task => task.id === taskId);
    if (!taskToDelete) return null;

    const originalIndex = currentTasks.findIndex(task => task.id === taskId);

    await apiClient.delete(`/api/tasks/${taskId}`);

    queryClient.setQueryData<Task[]>(['tasks'], (old) =>
      (old ?? []).filter(task => task.id !== taskId),
    );

    setDeletedTasks(prev => [...prev, { task: taskToDelete, deletedAt: Date.now(), originalIndex }]);
    return taskToDelete;
  }, [token, queryClient]);

  const undoDeleteTask = useCallback(async (taskId: string): Promise<boolean> => {
    if (!token) return false;

    let taskData: { task: Task; originalIndex: number } | null = null;

    const deletedTaskData = deletedTasks.find(deleted => deleted.task.id === taskId);
    if (deletedTaskData) {
      taskData = { task: deletedTaskData.task, originalIndex: deletedTaskData.originalIndex };
    } else {
      try {
        const stored = localStorage.getItem('jarvi_deleted_tasks');
        if (stored) {
          const parsed = JSON.parse(stored);
          const fallback = parsed.find((d: any) => d.task.id === taskId);
          if (fallback) {
            taskData = { task: fallback.task, originalIndex: fallback.originalIndex || 0 };
          }
        }
      } catch { /* ignore */ }
    }

    if (!taskData) return false;

    try {
      const restorePayload = {
        title: taskData.task.title,
        description: taskData.task.description,
        priority: taskData.task.priority,
        category: taskData.task.category,
        important: taskData.task.important,
        time: taskData.task.time,
        dueDate: taskData.task.due_date,
      };

      const restoredTask = await apiClient.post<Task>('/api/tasks', restorePayload);

      queryClient.setQueryData<Task[]>(['tasks'], (old) => {
        const newTasks = [...(old ?? [])];
        const insertIndex = Math.min(taskData!.originalIndex, newTasks.length);
        newTasks.splice(insertIndex, 0, restoredTask);
        return newTasks;
      });

      setDeletedTasks(prev => {
        const filtered = prev.filter(deleted => deleted.task.id !== taskId);
        try {
          localStorage.setItem('jarvi_deleted_tasks', JSON.stringify(filtered));
        } catch { /* ignore */ }
        return filtered;
      });
      return true;
    } catch {
      return false;
    }
  }, [token, deletedTasks, queryClient]);

  const toggleTaskCompletion = useCallback(async (taskId: string) => {
    if (!token) return;

    const currentTasks = queryClient.getQueryData<Task[]>(['tasks']) ?? [];
    const currentTask = currentTasks.find(task => task.id === taskId);
    if (!currentTask) return;

    const originalCompleted = currentTask.completed;
    const newCompleted = !originalCompleted;

    // Optimistic update with reordering
    queryClient.setQueryData<Task[]>(['tasks'], (old) => {
      const updatedTasks = (old ?? []).map(task =>
        task.id === taskId ? { ...task, completed: newCompleted } : task,
      );
      if (newCompleted) {
        const idx = updatedTasks.findIndex(task => task.id === taskId);
        if (idx !== -1) {
          const taskToMove = updatedTasks[idx];
          const rest = updatedTasks.filter(task => task.id !== taskId);
          return [...rest, taskToMove];
        }
      } else {
        const idx = updatedTasks.findIndex(task => task.id === taskId);
        if (idx !== -1) {
          const taskToMove = updatedTasks[idx];
          const completed = updatedTasks.filter(task => task.id !== taskId && task.completed);
          const incomplete = updatedTasks.filter(task => task.id !== taskId && !task.completed);
          return [...incomplete, taskToMove, ...completed];
        }
      }
      return updatedTasks;
    });

    try {
      const updatedTask = await apiClient.patch<Task>(`/api/tasks/${taskId}/toggle`);

      if (updatedTask.completed && posthog) {
        posthog.capture('task_completed', {
          task_id: updatedTask.id,
          priority: updatedTask.priority,
          had_due_date: !!updatedTask.due_date,
          had_category: !!updatedTask.category,
          was_important: updatedTask.important || false,
          had_recurrence: updatedTask.recurrence_type && updatedTask.recurrence_type !== 'none',
        });
      }

      // Confirm with server data
      queryClient.setQueryData<Task[]>(['tasks'], (old) => {
        const tasksWithUpdated = (old ?? []).map(task =>
          task.id === taskId ? updatedTask : task,
        );
        if (updatedTask.completed) {
          const idx = tasksWithUpdated.findIndex(task => task.id === taskId);
          if (idx !== -1) {
            const taskToMove = tasksWithUpdated[idx];
            const rest = tasksWithUpdated.filter(task => task.id !== taskId);
            return [...rest, taskToMove];
          }
        }
        return tasksWithUpdated;
      });

      // Handle recurrence
      if (newCompleted && currentTask.recurrence_type && currentTask.recurrence_type !== 'none') {
        const currentDate = new Date(currentTask.due_date || new Date().toISOString().split('T')[0]);
        const nextDate = new Date(currentDate);

        switch (currentTask.recurrence_type) {
          case 'daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
          case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
          case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
        }

        await createTask({
          title: currentTask.title,
          description: currentTask.description,
          priority: currentTask.priority,
          category: currentTask.category,
          important: currentTask.important,
          time: currentTask.time,
          dueDate: nextDate.toISOString().split('T')[0],
          recurrence_type: currentTask.recurrence_type,
          recurrence_config: currentTask.recurrence_config,
        }, false);
      }
    } catch {
      // Revert optimistic update
      queryClient.setQueryData<Task[]>(['tasks'], (old) =>
        (old ?? []).map(task =>
          task.id === taskId ? { ...task, completed: originalCompleted } : task,
        ),
      );
    }
  }, [token, queryClient, posthog, createTask]);

  const reorderTasks = useCallback((reorderedTasks: Task[]) => {
    queryClient.setQueryData<Task[]>(['tasks'], reorderedTasks);
  }, [queryClient]);

  // ── Sub-task functions ────────────────────────────────────────────────────

  const fetchSubTasks = useCallback(async (taskId: string) => {
    if (!token) return;
    try {
      const data = await apiClient.get<SubTask[]>(`/api/tasks/${taskId}/subtasks`);
      setSubtasksByTaskId(prev => ({ ...prev, [taskId]: data }));
    } catch { /* ignore */ }
  }, [token]);

  const createSubTask = useCallback(async (taskId: string, title: string): Promise<SubTask> => {
    if (!token) throw new Error('No authentication token');
    const newSubTask = await apiClient.post<SubTask>(`/api/tasks/${taskId}/subtasks`, { title });
    setSubtasksByTaskId(prev => ({
      ...prev,
      [taskId]: [...(prev[taskId] ?? []), newSubTask],
    }));
    return newSubTask;
  }, [token]);

  const updateSubTask = useCallback(async (taskId: string, subtaskId: string, title: string) => {
    if (!token) return;
    const updated = await apiClient.put<SubTask>(`/api/tasks/${taskId}/subtasks/${subtaskId}`, { title });
    setSubtasksByTaskId(prev => ({
      ...prev,
      [taskId]: (prev[taskId] ?? []).map(s => s.id === subtaskId ? updated : s),
    }));
  }, [token]);

  const toggleSubTask = useCallback(async (taskId: string, subtaskId: string) => {
    if (!token) return;
    setSubtasksByTaskId(prev => ({
      ...prev,
      [taskId]: (prev[taskId] ?? []).map(s =>
        s.id === subtaskId ? { ...s, completed: !s.completed } : s,
      ),
    }));
    try {
      const updated = await apiClient.patch<SubTask>(`/api/tasks/${taskId}/subtasks/${subtaskId}/toggle`);
      setSubtasksByTaskId(prev => ({
        ...prev,
        [taskId]: (prev[taskId] ?? []).map(s => s.id === subtaskId ? updated : s),
      }));
    } catch {
      setSubtasksByTaskId(prev => ({
        ...prev,
        [taskId]: (prev[taskId] ?? []).map(s =>
          s.id === subtaskId ? { ...s, completed: !s.completed } : s,
        ),
      }));
    }
  }, [token]);

  const deleteSubTask = useCallback(async (taskId: string, subtaskId: string) => {
    if (!token) return;
    setSubtasksByTaskId(prev => ({
      ...prev,
      [taskId]: (prev[taskId] ?? []).filter(s => s.id !== subtaskId),
    }));
    try {
      await apiClient.delete(`/api/tasks/${taskId}/subtasks/${subtaskId}`);
    } catch {
      fetchSubTasks(taskId);
    }
  }, [token, fetchSubTasks]);

  const value: TaskContextType = {
    tasks,
    isLoading,
    error,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    undoDeleteTask,
    toggleTaskCompletion,
    reorderTasks,
    subtasksByTaskId,
    fetchSubTasks,
    createSubTask,
    updateSubTask,
    toggleSubTask,
    deleteSubTask,
  };

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
};
