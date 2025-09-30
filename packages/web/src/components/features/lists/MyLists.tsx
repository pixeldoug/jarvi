import React, { useState } from 'react';
import { Plus, Fire, Tag, X } from 'phosphor-react';
import { Button, Input } from '../../ui';
import { useCategories } from '../../../hooks/useCategories';

interface CustomList {
  id: string;
  name: string;
  category: string;
  color?: string;
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
  const [isCreating, setIsCreating] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Salvar listas no localStorage
  const saveLists = (lists: CustomList[]) => {
    setCustomLists(lists);
    localStorage.setItem('jarvi_custom_lists', JSON.stringify(lists));
  };

  const handleCreateList = () => {
    if (newListName.trim() && selectedCategory) {
      const newList: CustomList = {
        id: Date.now().toString(),
        name: newListName.trim(),
        category: selectedCategory,
        color: categories.find(cat => cat.name === selectedCategory)?.color,
      };
      
      saveLists([...customLists, newList]);
      setNewListName('');
      setSelectedCategory('');
      setIsCreating(false);
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

  return (
    <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Minhas Listas
        </h2>
        <Button
          onClick={() => setIsCreating(true)}
          variant="outline"
          size="sm"
          className="w-full flex items-center justify-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Lista</span>
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-3">
        {/* Lista padrão: Importantes */}
        <div>
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Listas Padrão
          </h3>
          <div
            onClick={() => onListSelect('important')}
            className={getListItemClass(isImportantSelected)}
          >
            <div className="flex items-center space-x-2">
              <Fire className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium">Importantes</span>
            </div>
            <span className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full">
              {taskCounts.important}
            </span>
          </div>
        </div>

        {/* Listas personalizadas */}
        {customLists.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Minhas Listas
            </h3>
            <div className="space-y-1">
              {customLists.map((list) => {
                const isSelected = selectedList?.type === 'category' && selectedList?.category === list.category;
                const count = taskCounts.categories[list.category] || 0;
                
                return (
                  <div
                    key={list.id}
                    onClick={() => onListSelect('category', list.category)}
                    className={getListItemClass(isSelected)}
                  >
                    <div className="flex items-center space-x-2">
                      <Tag className="w-4 h-4" style={{ color: list.color || '#6B7280' }} />
                      <span className="text-sm font-medium">{list.name}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full">
                        {count}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteList(list.id);
                        }}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Remover lista"
                      >
                        <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Formulário de criação */}
        {isCreating && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Nova Lista
            </h3>
            <div className="space-y-3">
              <Input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Nome da lista"
              />
              
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">Selecione uma categoria</option>
                {categories.map((category) => (
                  <option key={category.name} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
              
              <div className="flex space-x-2">
                <Button
                  onClick={handleCreateList}
                  disabled={!newListName.trim() || !selectedCategory}
                  size="sm"
                  className="flex-1"
                >
                  Criar
                </Button>
                <Button
                  onClick={() => {
                    setIsCreating(false);
                    setNewListName('');
                    setSelectedCategory('');
                  }}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
