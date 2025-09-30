import React, { useState, useRef, useEffect } from 'react';
import { CaretDown, Plus, Tag } from 'phosphor-react';
import { useCategories } from '../../hooks/useCategories';

export interface CategoryDropdownProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onCreateCategory?: (name: string) => void;
  showTrigger?: boolean; // Nova prop para controlar se mostra o botão trigger
}

export const CategoryDropdown: React.FC<CategoryDropdownProps> = ({
  value,
  onChange,
  placeholder = "Selecione uma categoria",
  className = "",
  onCreateCategory,
  showTrigger = true,
}) => {
  const { categories, createCategory } = useCategories();
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fechar dropdown quando clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setNewCategoryName('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focar no input quando começar a criar categoria
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const handleSelectCategory = (categoryName: string) => {
    onChange(categoryName);
    setIsOpen(false);
  };

  const handleCreateCategory = async () => {
    console.log('handleCreateCategory called with:', newCategoryName);
    if (newCategoryName.trim()) {
      try {
        if (onCreateCategory) {
          console.log('Using onCreateCategory prop');
          onCreateCategory(newCategoryName.trim());
        } else {
          console.log('Using createCategory hook');
          await createCategory(newCategoryName.trim());
        }
        onChange(newCategoryName.trim());
        setNewCategoryName('');
        setIsCreating(false);
        setIsOpen(false);
        console.log('Category created successfully');
      } catch (error) {
        console.error('Erro ao criar categoria:', error);
      }
    } else {
      console.log('Category name is empty, not creating');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      console.log('Enter pressed, creating category:', newCategoryName);
      handleCreateCategory();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsCreating(false);
      setNewCategoryName('');
    }
  };

  const selectedCategory = categories.find(cat => cat.name === value);
  const displayValue = selectedCategory ? selectedCategory.name : value || placeholder;

  // Se showTrigger for false, mostrar apenas o menu dropdown
  if (!showTrigger) {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        {/* Dropdown Menu */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {/* Categorias existentes */}
          {categories.map(category => (
            <button
              key={category.id}
              type="button"
              onClick={() => handleSelectCategory(category.name)}
              className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 transition-colors"
            >
              <Tag weight="fill" className={`w-4 h-4 text-${category.color}-500`} />
              <span className="text-gray-900 dark:text-gray-100">{category.name}</span>
              {value === category.name && (
                <span className="ml-auto text-blue-500">✓</span>
              )}
            </button>
          ))}

          {/* Separador */}
          {categories.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          )}

          {/* Opção de criar nova categoria */}
          {!isCreating ? (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 transition-colors text-blue-600 dark:text-blue-400"
            >
              <Plus className="w-4 h-4" />
              <span>Criar nova categoria</span>
            </button>
          ) : (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
              <div className="space-y-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Nome da nova categoria"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    disabled={!newCategoryName.trim()}
                    className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Criar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setNewCategoryName('');
                    }}
                    className="flex-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between"
      >
        <span className="flex items-center space-x-2">
          {selectedCategory && (
            <Tag weight="fill" className={`w-4 h-4 text-${selectedCategory.color}-500`} />
          )}
          <span className={value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}>
            {displayValue}
          </span>
        </span>
        <CaretDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {/* Categorias existentes */}
          {categories.map(category => (
            <button
              key={category.id}
              type="button"
              onClick={() => handleSelectCategory(category.name)}
              className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 transition-colors"
            >
              <Tag weight="fill" className={`w-4 h-4 text-${category.color}-500`} />
              <span className="text-gray-900 dark:text-gray-100">{category.name}</span>
              {value === category.name && (
                <span className="ml-auto text-blue-500">✓</span>
              )}
            </button>
          ))}

          {/* Separador */}
          {categories.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          )}

          {/* Opção de criar nova categoria */}
          {!isCreating ? (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 transition-colors text-blue-600 dark:text-blue-400"
            >
              <Plus className="w-4 h-4" />
              <span>Criar nova categoria</span>
            </button>
          ) : (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
              <div className="space-y-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Nome da nova categoria"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    disabled={!newCategoryName.trim()}
                    className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Criar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setNewCategoryName('');
                    }}
                    className="flex-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
