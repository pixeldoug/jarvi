import { createContext, useContext, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color?: string;
  icon?: string;
  position?: number | null;
  /** Whether the category is shown in the sidebar. Defaults to true. */
  visible?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryData {
  name: string;
  color?: string;
  icon?: string;
}

export interface UpdateCategoryData {
  name?: string;
  color?: string;
  icon?: string;
  visible?: boolean;
}

interface CategoryContextType {
  categories: Category[];
  isLoading: boolean;
  error: string | null;
  fetchCategories: () => Promise<void>;
  createCategory: (data: CreateCategoryData) => Promise<Category>;
  updateCategory: (categoryId: string, data: UpdateCategoryData) => Promise<Category>;
  deleteCategory: (categoryId: string) => Promise<void>;
  reorderCategories: (ids: string[]) => Promise<void>;
}

const CategoryContext = createContext<CategoryContextType | undefined>(undefined);

export const useCategories = () => {
  const context = useContext(CategoryContext);
  if (context === undefined) {
    throw new Error('useCategories must be used within a CategoryProvider');
  }
  return context;
};

interface CategoryProviderProps {
  children: ReactNode;
}

export const CategoryProvider: React.FC<CategoryProviderProps> = ({ children }) => {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const normalizeCategory = (cat: Category): Category => ({
    ...cat,
    visible: cat.visible == null ? true : Boolean(cat.visible),
  });

  const {
    data: categoriesData,
    isLoading,
    error: queryError,
  } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const data = await apiClient.get<Category[]>('/api/categories');
      return data.map(normalizeCategory);
    },
    enabled: !!user && !!token,
    staleTime: 5 * 60 * 1000,
  });

  const categories = categoriesData ?? [];
  const error = queryError ? 'Failed to fetch categories' : null;

  const fetchCategories = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['categories'] });
  }, [queryClient]);

  const createCategory = useCallback(async (data: CreateCategoryData): Promise<Category> => {
    if (!token) throw new Error('No authentication token');
    const newCategory = normalizeCategory(await apiClient.post<Category>('/api/categories', data));
    // Append at end; position is assigned by the server
    queryClient.setQueryData<Category[]>(['categories'], (old) => [...(old ?? []), newCategory]);
    return newCategory;
  }, [token, queryClient]);

  const updateCategory = useCallback(async (categoryId: string, data: UpdateCategoryData): Promise<Category> => {
    if (!token) throw new Error('No authentication token');
    // Optimistic update — apply changes immediately so the sidebar reacts instantly
    queryClient.setQueryData<Category[]>(['categories'], (old) =>
      (old ?? []).map(cat => cat.id === categoryId ? { ...cat, ...data } : cat),
    );
    try {
      const updatedCategory = normalizeCategory(await apiClient.put<Category>(`/api/categories/${categoryId}`, data));
      // Replace optimistic entry with normalized server response
      queryClient.setQueryData<Category[]>(['categories'], (old) =>
        (old ?? []).map(cat => cat.id === categoryId ? updatedCategory : cat),
      );
      return updatedCategory;
    } catch (error) {
      // Rollback optimistic update on failure
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      throw error;
    }
  }, [token, queryClient]);

  const reorderCategories = useCallback(async (ids: string[]): Promise<void> => {
    if (!token) throw new Error('No authentication token');
    // Optimistic update: reorder cache immediately
    queryClient.setQueryData<Category[]>(['categories'], (old) => {
      if (!old) return old;
      const map = new Map(old.map(c => [c.id, c]));
      const reordered = ids.map((id, i) => {
        const cat = map.get(id);
        return cat ? { ...cat, position: i + 1 } : null;
      }).filter(Boolean) as Category[];
      // Append any categories not in the ids array at the end
      const missing = old.filter(c => !ids.includes(c.id));
      return [...reordered, ...missing];
    });
    await apiClient.patch('/api/categories/reorder', { ids });
  }, [token, queryClient]);

  const deleteCategory = useCallback(async (categoryId: string): Promise<void> => {
    if (!token) throw new Error('No authentication token');
    await apiClient.delete(`/api/categories/${categoryId}`);
    queryClient.setQueryData<Category[]>(['categories'], (old) =>
      (old ?? []).filter(cat => cat.id !== categoryId),
    );
  }, [token, queryClient]);

  const value: CategoryContextType = {
    categories,
    isLoading,
    error,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
  };

  return (
    <CategoryContext.Provider value={value}>
      {children}
    </CategoryContext.Provider>
  );
};
