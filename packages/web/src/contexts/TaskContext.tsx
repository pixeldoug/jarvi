import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description?: string;
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

export const TaskProvider: React.FC<TaskProviderProps> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletedTasks, setDeletedTasks] = useState<{ task: Task; deletedAt: number; originalIndex: number }[]>(() => {
    // Initialize from localStorage
    try {
      const stored = localStorage.getItem('jarvi_deleted_tasks');
      if (stored) {
        const parsed = JSON.parse(stored);
        
        // Check if the array is corrupted (contains empty objects or is too large)
        if (parsed.length > 100 || parsed.some((item: any) => !item.task || !item.task.id)) {
          console.warn('Corrupted deletedTasks detected, clearing localStorage');
          localStorage.removeItem('jarvi_deleted_tasks');
          return [];
        }
        
        // Filter out tasks older than 30 seconds
        const now = Date.now();
        const valid = parsed.filter((deleted: { task: Task; deletedAt: number; originalIndex?: number }) => 
          deleted && deleted.task && deleted.task.id && (now - deleted.deletedAt < 30000)
        );
        return valid;
      }
    } catch (error) {
      console.error('Error loading deletedTasks from localStorage:', error);
      // Clear corrupted data
      localStorage.removeItem('jarvi_deleted_tasks');
    }
    return [];
  });
  const { token } = useAuth();

  // Save to localStorage whenever deletedTasks changes (but only if it's not empty)
  useEffect(() => {
    if (deletedTasks.length === 0) return; // Don't save empty arrays
    
    try {
      // Validate data before saving
      const validTasks = deletedTasks.filter(deleted => 
        deleted && deleted.task && deleted.task.id && typeof deleted.deletedAt === 'number'
      );
      
      if (validTasks.length !== deletedTasks.length) {
        console.warn('Filtered out invalid deleted tasks before saving');
        setDeletedTasks(validTasks);
        return;
      }
      
      localStorage.setItem('jarvi_deleted_tasks', JSON.stringify(deletedTasks));
    } catch (error) {
      console.error('Error saving deletedTasks to localStorage:', error);
    }
  }, [deletedTasks]);

  // Clean up old deleted tasks every 10 seconds
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setDeletedTasks(prev => {
        const now = Date.now();
        const valid = prev.filter(deleted => now - deleted.deletedAt < 30000);
        return valid;
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(cleanupInterval);
  }, []);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Função para ordenar tarefas de forma inteligente
  const sortTasks = (tasks: Task[]): Task[] => {
    return [...tasks].sort((a, b) => {
      // Se ambas têm data, ordenar por data e horário
      if (a.due_date && b.due_date) {
        const dateA = new Date(a.due_date + (a.time ? `T${a.time}` : ''));
        const dateB = new Date(b.due_date + (b.time ? `T${b.time}` : ''));
        return dateA.getTime() - dateB.getTime();
      }
      
      // Se apenas A tem data, A vem primeiro
      if (a.due_date && !b.due_date) {
        return -1;
      }
      
      // Se apenas B tem data, B vem primeiro
      if (!a.due_date && b.due_date) {
        return 1;
      }
      
      // Se nenhuma tem data, ordenar por data de criação (mais antigas primeiro, novas no final)
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  };

  const fetchTasks = async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      setError(null);

      console.log('TaskContext - Fetching tasks from:', `${API_BASE_URL}/api/tasks`);
      console.log('TaskContext - Token:', token ? 'Present' : 'Missing');
      
      const response = await fetch(`${API_BASE_URL}/api/tasks`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }

      const tasksData = await response.json();
      setTasks(sortTasks(tasksData));
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setError('Failed to fetch tasks');
    } finally {
      setIsLoading(false);
    }
  };

  const createTask = async (taskData: CreateTaskData, showLoading: boolean = true): Promise<Task> => {
    if (!token) throw new Error('No authentication token');

    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      const requestData = {
        ...taskData,
        dueDate: taskData.dueDate,
        important: taskData.important || false,
      };
      
      console.log('Creating task with data:', requestData);

      const response = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create task');
      }

      const newTask = await response.json();
      setTasks(prev => sortTasks([...prev, newTask]));
      return newTask;
    } catch (error) {
      console.error('Error creating task:', error);
      setError('Failed to create task');
      throw error;
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  const updateTask = async (taskId: string, taskData: UpdateTaskData, showLoading: boolean = true) => {
    if (!token) return;

    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      // Atualização otimista - atualizar a UI imediatamente
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, ...taskData } : task
      ));

      const requestData = {
        ...taskData,
        dueDate: taskData.dueDate === undefined ? null : taskData.dueDate,
        important: taskData.important !== undefined ? taskData.important : false,
      };
      
      console.log('Updating task with data:', requestData);

      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update task');
      }

      const updatedTask = await response.json();
      // Atualizar com os dados reais do servidor e reordenar
      setTasks(prev => sortTasks(prev.map(task => 
        task.id === taskId ? updatedTask : task
      )));
    } catch (error) {
      console.error('Error updating task:', error);
      setError('Failed to update task');
      
      // Reverter a atualização otimista em caso de erro
      setTasks(prev => prev.map(task => {
        if (task.id === taskId) {
          // Buscar a tarefa original ou manter como estava
          return task;
        }
        return task;
      }));
      
      throw error;
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  const deleteTask = async (taskId: string, showLoading: boolean = true): Promise<Task | null> => {
    if (!token) return null;

    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      // Find the task before deleting
      const taskToDelete = tasks.find(task => task.id === taskId);
      if (!taskToDelete) return null;

      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete task');
      }

      // Find the original index of the task before removing it
      const originalIndex = tasks.findIndex(task => task.id === taskId);
      
      // Remove from tasks and add to deleted tasks for undo functionality
      setTasks(prev => prev.filter(task => task.id !== taskId));
      
      const newDeletedTask = { task: taskToDelete, deletedAt: Date.now(), originalIndex };
      setDeletedTasks(prev => [...prev, newDeletedTask]);

      // Note: Cleanup of old deleted tasks is handled in the initialization filter

      return taskToDelete;
    } catch (error) {
      console.error('Error deleting task:', error);
      setError('Failed to delete task');
      throw error;
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  const undoDeleteTask = async (taskId: string): Promise<boolean> => {
    if (!token) {
      return false;
    }

    try {
      // Find the deleted task
      const deletedTaskData = deletedTasks.find(deleted => deleted.task.id === taskId);
      
      if (!deletedTaskData) {
        
        // Try to reload from localStorage as fallback
        try {
          const stored = localStorage.getItem('jarvi_deleted_tasks');
          if (stored) {
            const parsed = JSON.parse(stored);
            const fallbackTask = parsed.find((deleted: { task: Task; deletedAt: number }) => deleted.task.id === taskId);
            if (fallbackTask) {
              // Use the task directly from localStorage instead of recursive call
              const taskData = {
                title: fallbackTask.task.title,
                description: fallbackTask.task.description,
                priority: fallbackTask.task.priority,
                category: fallbackTask.task.category,
                important: fallbackTask.task.important,
                time: fallbackTask.task.time,
                dueDate: fallbackTask.task.due_date,
              };
              
              const response = await fetch(`${API_BASE_URL}/api/tasks`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(taskData),
              });

              if (!response.ok) {
                const errorText = await response.text();
                console.error('Failed to restore task from fallback:', errorText);
                throw new Error('Failed to restore task');
              }

              const restoredTask = await response.json();

              // Add back to tasks at original position and remove from deleted tasks
              setTasks(prev => {
                const newTasks = [...prev];
                const insertIndex = Math.min(fallbackTask.originalIndex || 0, newTasks.length);
                newTasks.splice(insertIndex, 0, restoredTask);
                return newTasks;
              });
              
              // Clean up localStorage
              const updatedStored = parsed.filter((deleted: { task: Task; deletedAt: number }) => deleted.task.id !== taskId);
              localStorage.setItem('jarvi_deleted_tasks', JSON.stringify(updatedStored));
              
              return true;
            }
          }
        } catch (error) {
          console.error('Error in localStorage fallback:', error);
        }
        
        return false;
      }

      // Recreate the task
      const taskData = {
        title: deletedTaskData.task.title,
        description: deletedTaskData.task.description,
        priority: deletedTaskData.task.priority,
        category: deletedTaskData.task.category,
        important: deletedTaskData.task.important,
        time: deletedTaskData.task.time,
        dueDate: deletedTaskData.task.due_date,
      };
      
      const response = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to restore task:', errorText);
        throw new Error('Failed to restore task');
      }

      const restoredTask = await response.json();

      // Add back to tasks at original position and remove from deleted tasks
      setTasks(prev => {
        const newTasks = [...prev];
        const insertIndex = Math.min(deletedTaskData.originalIndex || 0, newTasks.length);
        newTasks.splice(insertIndex, 0, restoredTask);
        return newTasks;
      });
      setDeletedTasks(prev => {
        const filtered = prev.filter(deleted => deleted.task.id !== taskId);
        // Also update localStorage
        try {
          localStorage.setItem('jarvi_deleted_tasks', JSON.stringify(filtered));
        } catch (error) {
          console.error('Error updating localStorage:', error);
        }
        return filtered;
      });
      return true;
    } catch (error) {
      console.error('Error restoring task:', error);
      setError(error instanceof Error ? error.message : 'Failed to restore task');
      return false;
    }
  };

  const toggleTaskCompletion = async (taskId: string) => {
    if (!token) {
      return;
    }

    // Encontrar a tarefa atual
    const currentTask = tasks.find(task => task.id === taskId);
    if (!currentTask) {
      console.error('Task not found:', taskId);
      return;
    }

    const originalCompleted = currentTask.completed;
    const newCompleted = !originalCompleted;

    try {
      // Atualização otimista - atualizar imediatamente na UI com reordenação
      setTasks(prev => {
        const updatedTasks = prev.map(task => 
          task.id === taskId ? { ...task, completed: newCompleted } : task
        );
        
        // Se a tarefa foi marcada como concluída, movê-la para o final
        if (newCompleted) {
          const taskIndex = updatedTasks.findIndex(task => task.id === taskId);
          if (taskIndex !== -1) {
            const taskToMove = updatedTasks[taskIndex];
            const remainingTasks = updatedTasks.filter(task => task.id !== taskId);
            return [...remainingTasks, taskToMove];
          }
        }
        // Se a tarefa foi desmarcada como concluída, movê-la para o início das não concluídas
        else {
          const taskIndex = updatedTasks.findIndex(task => task.id === taskId);
          if (taskIndex !== -1) {
            const taskToMove = updatedTasks[taskIndex];
            const completedTasks = updatedTasks.filter(task => task.id !== taskId && task.completed);
            const incompleteTasks = updatedTasks.filter(task => task.id !== taskId && !task.completed);
            return [...incompleteTasks, taskToMove, ...completedTasks];
          }
        }
        
        return updatedTasks;
      });

      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/toggle`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Toggle task completion failed:', response.status, errorText);
        
        // Reverter a atualização otimista
        setTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, completed: originalCompleted } : task
        ));
        
        throw new Error('Failed to toggle task completion');
      }

      const updatedTask = await response.json();
      
      // Confirmar com dados do servidor e manter a reordenação
      setTasks(prev => {
        const tasksWithUpdated = prev.map(task => 
          task.id === taskId ? updatedTask : task
        );
        
        // Garantir que a ordenação está correta após a confirmação do servidor
        if (updatedTask.completed) {
          const taskIndex = tasksWithUpdated.findIndex(task => task.id === taskId);
          if (taskIndex !== -1) {
            const taskToMove = tasksWithUpdated[taskIndex];
            const remainingTasks = tasksWithUpdated.filter(task => task.id !== taskId);
            return [...remainingTasks, taskToMove];
          }
        }
        
        return tasksWithUpdated;
      });

      // Se a tarefa foi completada e tem recorrência, criar próxima instância
      if (newCompleted && currentTask.recurrence_type && currentTask.recurrence_type !== 'none') {
        console.log('Creating next recurrence instance for completed task');
        
        // Calcular próxima data diretamente (sem import dinâmico)
        const currentDate = new Date(currentTask.due_date || new Date().toISOString().split('T')[0]);
        let nextDate = new Date(currentDate);
        
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
        
        const nextDateStr = nextDate.toISOString().split('T')[0];

        const newInstance = await createTask({
          title: currentTask.title,
          description: currentTask.description,
          priority: currentTask.priority,
          category: currentTask.category,
          important: currentTask.important,
          time: currentTask.time,
          dueDate: nextDateStr,
        }, false); // showLoading = false para experiência fluida

        console.log('Next recurrence instance created:', newInstance);
      }
    } catch (error) {
      console.error('Error toggling task completion:', error);
      setError('Failed to toggle task completion');
    }
  };

  const reorderTasks = (reorderedTasks: Task[]) => {
    setTasks(reorderedTasks);
  };

  // Fetch tasks when token changes
  useEffect(() => {
    if (token) {
      fetchTasks();
    } else {
      setTasks([]);
    }
  }, [token]);

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
  };

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
};
