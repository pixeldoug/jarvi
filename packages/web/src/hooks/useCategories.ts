import { useState, useEffect } from 'react';

export interface Category {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'trabalho', name: 'Trabalho', color: 'blue', isDefault: true },
  { id: 'pessoal', name: 'Pessoal', color: 'green', isDefault: true },
  { id: 'compras', name: 'Compras', color: 'purple', isDefault: true },
];

export const useCategories = () => {
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);

  // Carregar categorias personalizadas do localStorage
  useEffect(() => {
    const savedCategories = localStorage.getItem('jarvi-categories');
    if (savedCategories) {
      try {
        const customCategories = JSON.parse(savedCategories);
        setCategories([...DEFAULT_CATEGORIES, ...customCategories]);
      } catch (error) {
        console.error('Erro ao carregar categorias:', error);
      }
    }
  }, []);

  const addCategory = (name: string, color: string = 'gray') => {
    const newCategory: Category = {
      id: `custom-${Date.now()}`,
      name,
      color,
      isDefault: false,
    };

    const customCategories = categories.filter(cat => !cat.isDefault);
    const updatedCustomCategories = [...customCategories, newCategory];
    
    setCategories([...DEFAULT_CATEGORIES, ...updatedCustomCategories]);
    
    // Salvar no localStorage
    localStorage.setItem('jarvi-categories', JSON.stringify(updatedCustomCategories));
    
    return newCategory;
  };

  const removeCategory = (categoryId: string) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (category?.isDefault) {
      console.warn('Não é possível remover categoria padrão');
      return;
    }

    const updatedCategories = categories.filter(cat => cat.id !== categoryId);
    setCategories(updatedCategories);
    
    // Salvar no localStorage
    const customCategories = updatedCategories.filter(cat => !cat.isDefault);
    localStorage.setItem('jarvi-categories', JSON.stringify(customCategories));
  };

  const getCategoryVariant = (categoryName: string): 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' => {
    const category = categories.find(cat => cat.name === categoryName);
    if (!category) return 'default';
    
    switch (category.color) {
      case 'blue': return 'primary';
      case 'green': return 'success';
      case 'purple': return 'secondary';
      case 'red': return 'danger';
      case 'yellow': return 'warning';
      default: return 'default';
    }
  };

  return {
    categories,
    addCategory,
    removeCategory,
    getCategoryVariant,
  };
};

