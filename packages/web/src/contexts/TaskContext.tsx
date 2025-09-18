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
}

interface TaskContextType {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  fetchTasks: () => Promise<void>;
  createTask: (taskData: CreateTaskData) => Promise<Task>;
  updateTask: (taskId: string, taskData: UpdateTaskData, showLoading?: boolean) => Promise<void>;
  deleteTask: (taskId: string) => Promise<Task | null>;
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
  const [deletedTasks, setDeletedTasks] = useState<{ task: Task; deletedAt: number }[]>([]);
  const { token } = useAuth();

  // Log when context is initialized
  console.log('TaskProvider initialized, deletedTasks:', deletedTasks);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
      setTasks(tasksData);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setError('Failed to fetch tasks');
    } finally {
      setIsLoading(false);
    }
  };

  const createTask = async (taskData: CreateTaskData): Promise<Task> => {
    if (!token) throw new Error('No authentication token');

    try {
      setIsLoading(true);
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
      setTasks(prev => [newTask, ...prev]);
      return newTask;
    } catch (error) {
      console.error('Error creating task:', error);
      setError('Failed to create task');
      throw error;
    } finally {
      setIsLoading(false);
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
      // Atualizar com os dados reais do servidor
      setTasks(prev => prev.map(task => 
        task.id === taskId ? updatedTask : task
      ));
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

  const deleteTask = async (taskId: string): Promise<Task | null> => {
    if (!token) return null;

    try {
      setIsLoading(true);
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

      // Remove from tasks and add to deleted tasks for undo functionality
      setTasks(prev => prev.filter(task => task.id !== taskId));
      setDeletedTasks(prev => {
        const newDeletedTasks = [...prev, { task: taskToDelete, deletedAt: Date.now() }];
        console.log('Saving deleted task:', taskToDelete.title, 'with ID:', taskId);
        console.log('New deletedTasks array:', newDeletedTasks);
        return newDeletedTasks;
      });

      // Clean up old deleted tasks (older than 30 seconds)
      setTimeout(() => {
        setDeletedTasks(prev => {
          const filtered = prev.filter(deleted => Date.now() - deleted.deletedAt < 30000);
          console.log('Cleaned up deleted tasks, remaining:', filtered.length);
          return filtered;
        });
      }, 30000);

      return taskToDelete;
    } catch (error) {
      console.error('Error deleting task:', error);
      setError('Failed to delete task');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const undoDeleteTask = async (taskId: string): Promise<boolean> => {
    console.log('undoDeleteTask called with taskId:', taskId);
    console.log('Available deleted tasks:', deletedTasks);
    
    if (!token) {
      console.log('No token available');
      return false;
    }

    try {
      // Find the deleted task
      const deletedTaskData = deletedTasks.find(deleted => deleted.task.id === taskId);
      console.log('Found deleted task data:', deletedTaskData);
      
      if (!deletedTaskData) {
        console.log('No deleted task found for ID:', taskId);
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
      
      console.log('Recreating task with data:', taskData);
      
      const response = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData),
      });

      console.log('Restore response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to restore task:', errorText);
        throw new Error('Failed to restore task');
      }

      const restoredTask = await response.json();
      console.log('Restored task:', restoredTask);

      // Add back to tasks and remove from deleted tasks
      setTasks(prev => {
        console.log('Adding restored task to tasks list');
        return [...prev, restoredTask];
      });
      setDeletedTasks(prev => prev.filter(deleted => deleted.task.id !== taskId));
      
      console.log('Task successfully restored:', restoredTask.title);
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
      // Atualização otimista - atualizar imediatamente na UI
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, completed: newCompleted } : task
      ));

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
      
      // Confirmar com dados do servidor
      setTasks(prev => prev.map(task => 
        task.id === taskId ? updatedTask : task
      ));
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
