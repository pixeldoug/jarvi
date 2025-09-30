import React, { useState } from 'react';
import { Plus, Fire, Tag, X } from 'phosphor-react';
import { Button } from '../../ui';
import { useCategories } from '../../../hooks/useCategories';

interface CustomList {
  id: string;
  category: string; // Nome da categoria será o nome da lista
}

interface MyListsProps {
  onListSelect: (listType: 'important' | 'category', category?: string) => void;
  selectedList?: { type: 'important' | 'category'; category?: string } | null;
  taskCounts: {
    important: number;
    categories: Record<string, number>;
  };
}

export const MyLists: React.FC<MyListsProps> = ({
  onListSelect,
  selectedList,
  taskCounts,
}) => {
  const { categories } = useCategories();
  const [customLists, setCustomLists] = useState<CustomList[]>(() => {
    // Carregar listas salvas do localStorage
    try {
      const saved = localStorage.getItem('jarvi_custom_lists');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedCategory, setSelectedCategory] = useState('');

  // Salvar listas no localStorage
  const saveLists = (lists: CustomList[]) => {
    setCustomLists(lists);
    localStorage.setItem('jarvi_custom_lists', JSON.stringify(lists));
  };

  const handleCreateList = () => {
    if (selectedCategory) {
      // Verificar se já existe uma lista para esta categoria
      const existingList = customLists.find(list => list.category === selectedCategory);
      if (existingList) {
        return; // Já existe, não criar duplicata
      }
      
      const newList: CustomList = {
        id: Date.now().toString(),
        category: selectedCategory,
      };
      
      const updatedLists = [...customLists, newList];
      saveLists(updatedLists);
      
      setSelectedCategory('');
    }
  };

  const handleDeleteList = (listId: string) => {
    saveLists(customLists.filter(list => list.id !== listId));
  };

  const isImportantSelected = selectedList?.type === 'important';
  const getListItemClass = (isSelected: boolean) => 
    `flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
      isSelected 
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
    }`;

  const getCategoryColor = (categoryName: string) => {
    const category = categories.find(cat => cat.name === categoryName);
    return category?.color || 'gray';
  };

  return (
    <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Minhas listas
        </h2>
        <Plus className="w-5 h-5 text-gray-400" />
      </div>

      <div className="space-y-2 mb-6">
        {/* Lista Importantes */}
        <div
          className={getListItemClass(isImportantSelected)}
          onClick={() => onListSelect('important')}
        >
          <div className="flex items-center space-x-3">
            <Fire weight="fill" className="w-5 h-5 text-red-500" />
            <span className="font-medium">Importantes</span>
          </div>
          <span className="text-sm font-medium bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
            {taskCounts.important}
          </span>
        </div>

        {/* Listas Personalizadas */}
        {customLists.map(list => {
          const isSelected = selectedList?.type === 'category' && selectedList.category === list.category;
          return (
            <div
              key={list.id}
              className={getListItemClass(isSelected)}
              onClick={() => onListSelect('category', list.category)}
            >
              <div className="flex items-center space-x-3">
                <Tag weight="fill" className={`w-5 h-5 text-${getCategoryColor(list.category)}-500`} />
                <span className="font-medium">{list.category}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
                  {taskCounts.categories[list.category] || 0}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteList(list.id);
                  }}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Criar Nova Lista */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Nova Lista
        </h3>
        <div className="space-y-3">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Selecione uma categoria</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>
          <Button 
            onClick={handleCreateList} 
            disabled={!selectedCategory}
            fullWidth
            size="sm"
          >
            Criar Lista
          </Button>
        </div>
      </div>
    </div>
  );
};