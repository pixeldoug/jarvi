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
}

interface CategoryContextType {
  categories: Category[];
  isLoading: boolean;
  error: string | null;
  fetchCategories: () => Promise<void>;
  createCategory: (data: CreateCategoryData) => Promise<Category>;
  updateCategory: (categoryId: string, data: UpdateCategoryData) => Promise<Category>;
  deleteCategory: (categoryId: string) => Promise<void>;
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

  const {
    data: categoriesData,
    isLoading,
    error: queryError,
  } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => apiClient.get<Category[]>('/api/categories'),
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
    const newCategory = await apiClient.post<Category>('/api/categories', data);
    queryClient.setQueryData<Category[]>(['categories'], (old) =>
      [...(old ?? []), newCategory].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return newCategory;
  }, [token, queryClient]);

  const updateCategory = useCallback(async (categoryId: string, data: UpdateCategoryData): Promise<Category> => {
    if (!token) throw new Error('No authentication token');
    const updatedCategory = await apiClient.put<Category>(`/api/categories/${categoryId}`, data);
    queryClient.setQueryData<Category[]>(['categories'], (old) =>
      (old ?? []).map(cat => cat.id === categoryId ? updatedCategory : cat)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    return updatedCategory;
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
  };

  return (
    <CategoryContext.Provider value={value}>
      {children}
    </CategoryContext.Provider>
  );
};
