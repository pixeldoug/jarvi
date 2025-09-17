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
  dueDate?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  important?: boolean;
  dueDate?: string;
}

interface TaskContextType {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  fetchTasks: () => Promise<void>;
  createTask: (taskData: CreateTaskData) => Promise<Task>;
  updateTask: (taskId: string, taskData: UpdateTaskData, showLoading?: boolean) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  toggleTaskCompletion: (taskId: string) => Promise<void>;
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
  const { token } = useAuth();

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

  const deleteTask = async (taskId: string) => {
    if (!token) return;

    try {
      setIsLoading(true);
      setError(null);

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

      setTasks(prev => prev.filter(task => task.id !== taskId));
    } catch (error) {
      console.error('Error deleting task:', error);
      setError('Failed to delete task');
      throw error;
    } finally {
      setIsLoading(false);
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
    toggleTaskCompletion,
  };

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
};
