import React, { useState, useEffect } from 'react';
import { X, Plus, Tag } from 'phosphor-react';
import { useCategories } from '../../../hooks/useCategories';
import { Button, Input, Select } from '../../ui';

interface CategoryPickerPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onCategorySelect: (category: string) => void;
  position?: { top: number; left: number } | null;
  initialCategory?: string;
}

export const CategoryPickerPopover: React.FC<CategoryPickerPopoverProps> = ({
  isOpen,
  onClose,
  onCategorySelect,
  position,
  initialCategory,
}) => {
  const { categories, addCategory } = useCategories();
  const [selectedCategory, setSelectedCategory] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [canClose, setCanClose] = useState(false);

  // Permitir fechar apenas após um pequeno delay para evitar fechamento imediato
  useEffect(() => {
    if (isOpen) {
      setCanClose(false);
      const timer = setTimeout(() => {
        setCanClose(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Pré-selecionar a categoria inicial quando o popover abrir
  useEffect(() => {
    if (isOpen) {
      setSelectedCategory(initialCategory || '');
    } else {
      setSelectedCategory('');
      setNewCategoryName('');
    }
  }, [isOpen, initialCategory]);

  const handleConfirm = (e?: React.MouseEvent) => {
    e?.preventDefault();
    // Permitir categoria vazia (para remover categoria)
    onCategorySelect(selectedCategory);
    onClose();
  };

  const handleCancel = (e?: React.MouseEvent) => {
    e?.preventDefault();
    setSelectedCategory('');
    setNewCategoryName('');
    onClose();
  };

  const handleAddCategory = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (newCategoryName.trim()) {
      const newCategory = addCategory(newCategoryName.trim());
      setSelectedCategory(newCategory.name);
      setNewCategoryName('');
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && canClose) {
      onClose();
    }
  };

  const categoryOptions = [
    { value: '', label: '— Sem categoria —' },
    ...categories.map(cat => ({
      value: cat.name,
      label: cat.name,
    }))
  ];

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Overlay para fechar o popover */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={handleOverlayClick}
      />
      
      {/* Popover */}
      <div
        className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-4 min-w-[280px]"
        style={
          position
            ? {
                top: position.top,
                left: position.left,
                transform: 'translate(-50%, -100%)', // Centralizado horizontalmente e acima do botão
              }
            : {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)', // Fallback para o centro
              }
        }
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center space-x-2">
            <Tag className="w-4 h-4" />
            <span>Definir Categoria</span>
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Categoria da Tarefa
            </label>
            <Select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              options={categoryOptions}
              className="w-full"
            />
          </div>
          
          {/* Adicionar nova categoria */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Criar Nova Categoria
            </label>
            <div className="flex space-x-2">
              <Input
                placeholder="Nome da categoria..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="px-3"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex space-x-2 pt-2">
            <button
              onClick={(e) => handleConfirm(e)}
              className="flex-1 px-3 py-2 text-sm font-medium text-white rounded-md transition-colors bg-blue-600 hover:bg-blue-700"
            >
              {selectedCategory ? 'Definir Categoria' : 'Remover Categoria'}
            </button>
            {initialCategory && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onCategorySelect(''); // Passar string vazia para remover categoria
                  onClose();
                }}
                className="px-3 py-2 text-red-600 dark:text-red-400 text-sm font-medium rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Remover categoria desta tarefa"
              >
                Remover
              </button>
            )}
            <button
              onClick={(e) => handleCancel(e)}
              className="px-3 py-2 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

