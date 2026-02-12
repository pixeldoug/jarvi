import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

export interface List {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  category_names: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateListData {
  name: string;
  description?: string;
  categoryNames: string[];
}

export interface UpdateListData {
  name?: string;
  description?: string;
  categoryNames?: string[];
}

interface ListContextType {
  lists: List[];
  isLoading: boolean;
  error: string | null;
  fetchLists: () => Promise<void>;
  createList: (data: CreateListData) => Promise<List>;
  updateList: (listId: string, data: UpdateListData) => Promise<List>;
  deleteList: (listId: string) => Promise<void>;
}

const ListContext = createContext<ListContextType | undefined>(undefined);

export function useLists() {
  const context = useContext(ListContext);
  if (context === undefined) {
    throw new Error('useLists must be used within a ListProvider');
  }
  return context;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function ListProvider({ children }: { children: ReactNode }) {
  const [lists, setLists] = useState<List[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { token, user } = useAuth();

  useEffect(() => {
    if (user && token) {
      void fetchLists();
    } else {
      setLists([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token]);

  const fetchLists = async (): Promise<void> => {
    if (!token) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/lists`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch lists');
      }

      const data = (await response.json()) as List[];
      setLists(data);
    } catch (err) {
      console.error('Error fetching lists:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch lists');
    } finally {
      setIsLoading(false);
    }
  };

  const createList = async (data: CreateListData): Promise<List> => {
    if (!token) throw new Error('No authentication token');

    try {
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/lists`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          categoryNames: data.categoryNames,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create list');
      }

      const newList = (await response.json()) as List;
      setLists((prev) => [newList, ...prev]);
      return newList;
    } catch (err) {
      console.error('Error creating list:', err);
      throw err;
    }
  };

  const updateList = async (listId: string, data: UpdateListData): Promise<List> => {
    if (!token) throw new Error('No authentication token');

    try {
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/lists/${listId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          categoryNames: data.categoryNames,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update list');
      }

      const updated = (await response.json()) as List;
      setLists((prev) => prev.map((l) => (l.id === listId ? updated : l)));
      return updated;
    } catch (err) {
      console.error('Error updating list:', err);
      throw err;
    }
  };

  const deleteList = async (listId: string): Promise<void> => {
    if (!token) throw new Error('No authentication token');

    try {
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/lists/${listId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok && response.status !== 204) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete list');
      }

      setLists((prev) => prev.filter((l) => l.id !== listId));
    } catch (err) {
      console.error('Error deleting list:', err);
      throw err;
    }
  };

  const value: ListContextType = {
    lists,
    isLoading,
    error,
    fetchLists,
    createList,
    updateList,
    deleteList,
  };

  return <ListContext.Provider value={value}>{children}</ListContext.Provider>;
}

