import React, { useState } from 'react';
import { Plus, Trash, Tag } from 'phosphor-react';
import { useCategories } from '../../../hooks/useCategories';
import { Button, Input, Modal } from '../../ui';

const AVAILABLE_COLORS = [
  { name: 'Azul', value: 'blue', bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200' },
  { name: 'Verde', value: 'green', bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' },
  { name: 'Roxo', value: 'purple', bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-200' },
  { name: 'Vermelho', value: 'red', bg: 'bg-red-100', text: 'text-red-600', border: 'border-red-200' },
  { name: 'Amarelo', value: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-600', border: 'border-yellow-200' },
  { name: 'Laranja', value: 'orange', bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-200' },
  { name: 'Cinza', value: 'gray', bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
];

interface CategoryFormData {
  name: string;
  color: string;
}

export const CategoryManager: React.FC = () => {
  const { categories, addCategory, removeCategory } = useCategories();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    color: 'blue'
  });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Separar categorias padrão e personalizadas
  const defaultCategories = categories.filter(cat => cat.isDefault);
  const customCategories = categories.filter(cat => !cat.isDefault);

  const handleOpenModal = () => {
    setFormData({ name: '', color: 'blue' });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setFormData({ name: '', color: 'blue' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      return;
    }

    addCategory(formData.name.trim(), formData.color);
    handleCloseModal();
  };

  const handleDelete = (categoryId: string) => {
    if (deleteConfirm === categoryId) {
      removeCategory(categoryId);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(categoryId);
      // Auto-cancelar confirmação após 3 segundos
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const getCategoryColorClasses = (color: string) => {
    return AVAILABLE_COLORS.find(c => c.value === color) || AVAILABLE_COLORS[0];
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Gerenciar Categorias
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Organize suas tarefas com categorias personalizadas
          </p>
        </div>
        <Button onClick={handleOpenModal} className="flex items-center gap-2">
          <Plus size={16} />
          Nova Categoria
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
              <Tag className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{categories.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
              <Tag className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Padrão</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{defaultCategories.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
              <Tag className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Personalizadas</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{customCategories.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Categorias Padrão */}
      {defaultCategories.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Categorias Padrão
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {defaultCategories.map((category) => {
              const colorClasses = getCategoryColorClasses(category.color);
              return (
                <div
                  key={category.id}
                  className={`${colorClasses.bg} ${colorClasses.border} border rounded-lg p-4`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 ${colorClasses.bg} rounded-full flex items-center justify-center border ${colorClasses.border}`}>
                        <Tag className={`w-4 h-4 ${colorClasses.text}`} />
                      </div>
                      <div>
                        <h3 className={`font-medium ${colorClasses.text}`}>
                          {category.name}
                        </h3>
                        <p className="text-xs text-gray-500">Sistema</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Categorias Personalizadas */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Categorias Personalizadas
        </h2>
        
        {customCategories.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
            <Tag className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Nenhuma categoria personalizada
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Crie suas próprias categorias para organizar melhor suas tarefas
            </p>
            <Button onClick={handleOpenModal}>
              <Plus size={16} className="mr-2" />
              Criar primeira categoria
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customCategories.map((category) => {
              const colorClasses = getCategoryColorClasses(category.color);
              const isConfirmingDelete = deleteConfirm === category.id;
              
              return (
                <div
                  key={category.id}
                  className={`${colorClasses.bg} ${colorClasses.border} border rounded-lg p-4 ${
                    isConfirmingDelete ? 'ring-2 ring-red-500 ring-opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 ${colorClasses.bg} rounded-full flex items-center justify-center border ${colorClasses.border}`}>
                        <Tag className={`w-4 h-4 ${colorClasses.text}`} />
                      </div>
                      <div>
                        <h3 className={`font-medium ${colorClasses.text}`}>
                          {category.name}
                        </h3>
                        <p className="text-xs text-gray-500">Personalizada</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(category.id)}
                        className={`p-1 rounded transition-colors ${
                          isConfirmingDelete 
                            ? 'text-red-600 bg-red-100 hover:bg-red-200' 
                            : `${colorClasses.text} hover:bg-white hover:bg-opacity-50`
                        }`}
                        title={isConfirmingDelete ? 'Clique novamente para confirmar' : 'Excluir categoria'}
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                  
                  {isConfirmingDelete && (
                    <div className="mt-3 pt-3 border-t border-red-200">
                      <p className="text-xs text-red-600 mb-2">
                        Clique novamente em excluir para confirmar
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Criação */}
      <Modal 
        isOpen={showModal} 
        onClose={handleCloseModal}
        title="Nova Categoria"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nome da Categoria
            </label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Trabalho, Pessoal, Estudos..."
              required
            />
          </div>

          {/* Cor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Cor da Categoria
            </label>
            <div className="grid grid-cols-4 gap-3">
              {AVAILABLE_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: color.value })}
                  className={`${color.bg} ${color.border} border-2 rounded-lg p-3 flex flex-col items-center gap-2 transition-all hover:scale-105 ${
                    formData.color === color.value 
                      ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-800' 
                      : ''
                  }`}
                >
                  <div className={`w-6 h-6 ${color.bg} rounded-full border ${color.border}`}>
                    <Tag className={`w-4 h-4 ${color.text} m-1`} />
                  </div>
                  <span className={`text-xs font-medium ${color.text}`}>
                    {color.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Preview
            </label>
            <div className="flex items-center gap-2">
              {formData.name && (
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getCategoryColorClasses(formData.color).bg} ${getCategoryColorClasses(formData.color).text} border ${getCategoryColorClasses(formData.color).border}`}>
                  <Tag size={14} />
                  {formData.name}
                </div>
              )}
              {!formData.name && (
                <span className="text-gray-400 text-sm">Digite um nome para ver o preview</span>
              )}
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              className="flex-1"
              disabled={!formData.name.trim()}
            >
              Criar Categoria
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseModal}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
