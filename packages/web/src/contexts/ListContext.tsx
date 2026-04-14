import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export interface List {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  category_names: string[];
  priority?: string | null;
  connected_app?: string | null;
  show_completed?: boolean;
  filter_no_category?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateListData {
  name: string;
  description?: string;
  categoryNames?: string[];
  priority?: string;
  connectedApp?: string;
  showCompleted?: boolean;
  filterNoCategory?: boolean;
}

export interface UpdateListData {
  name?: string;
  description?: string;
  categoryNames?: string[];
  priority?: string | null;
  connectedApp?: string | null;
  showCompleted?: boolean;
  filterNoCategory?: boolean;
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

export function ListProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: listsData,
    isLoading,
    error: queryError,
  } = useQuery<List[]>({
    queryKey: ['lists'],
    queryFn: () => apiClient.get<List[]>('/api/lists'),
    enabled: !!user && !!token,
    staleTime: 5 * 60 * 1000,
  });

  const lists = listsData ?? [];
  const error = queryError ? 'Failed to fetch lists' : null;

  const fetchLists = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['lists'] });
  }, [queryClient]);

  const createList = useCallback(async (data: CreateListData): Promise<List> => {
    if (!token) throw new Error('No authentication token');
    const newList = await apiClient.post<List>('/api/lists', {
      name: data.name,
      description: data.description,
      categoryNames: data.categoryNames,
      priority: data.priority,
      connectedApp: data.connectedApp,
      showCompleted: data.showCompleted,
      filterNoCategory: data.filterNoCategory,
    });
    queryClient.setQueryData<List[]>(['lists'], (old) => [newList, ...(old ?? [])]);
    return newList;
  }, [token, queryClient]);

  const updateList = useCallback(async (listId: string, data: UpdateListData): Promise<List> => {
    if (!token) throw new Error('No authentication token');
    const updated = await apiClient.put<List>(`/api/lists/${listId}`, {
      name: data.name,
      description: data.description,
      categoryNames: data.categoryNames,
      priority: data.priority,
      connectedApp: data.connectedApp,
      showCompleted: data.showCompleted,
      filterNoCategory: data.filterNoCategory,
    });
    queryClient.setQueryData<List[]>(['lists'], (old) =>
      (old ?? []).map(l => l.id === listId ? updated : l),
    );
    return updated;
  }, [token, queryClient]);

  const deleteList = useCallback(async (listId: string): Promise<void> => {
    if (!token) throw new Error('No authentication token');
    await apiClient.delete(`/api/lists/${listId}`);
    queryClient.setQueryData<List[]>(['lists'], (old) =>
      (old ?? []).filter(l => l.id !== listId),
    );
  }, [token, queryClient]);

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
