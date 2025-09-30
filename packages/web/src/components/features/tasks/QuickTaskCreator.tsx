import React, { useState } from 'react';
import { Plus } from 'phosphor-react';

interface QuickTaskCreatorProps {
  sectionId: string;
  onQuickCreate: (title: string, sectionId: string) => Promise<void>;
  isVisible: boolean;
  hasTasks?: boolean;
}

export const QuickTaskCreator: React.FC<QuickTaskCreatorProps> = ({
  sectionId,
  onQuickCreate,
  isVisible,
  hasTasks = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');

  const handleClick = () => {
    setIsEditing(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle) {
      try {
        await onQuickCreate(trimmedTitle, sectionId);
        setTitle('');
        setIsEditing(false);
      } catch (error) {
        console.error('Erro ao criar tarefa:', error);
      }
    }
  };

  const handleCancel = () => {
    setTitle('');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Não renderizar se não for visível e não tiver tarefas
  if (!isVisible && hasTasks) {
    return null;
  }

  return (
    <div className={`py-2 px-3 flex items-center transition-opacity duration-200 ${
      hasTasks ? 'h-[40px]' : ''
    }`}>
      {isEditing ? (
        <form onSubmit={handleSubmit} className="flex items-center space-x-3">
          {/* Círculo placeholder (não interativo) */}
          <div className="w-6 h-6 rounded-full border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
            <Plus className="w-3 h-3 text-gray-400" />
          </div>
          
          {/* Input de título */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-sm font-normal text-gray-600 dark:text-gray-400 placeholder-gray-400 dark:placeholder-gray-500"
            placeholder="Digite o título da tarefa..."
            autoFocus
          />
        </form>
      ) : (
        <div 
          onClick={handleClick}
          className="flex items-center space-x-3 cursor-pointer group"
        >
          {/* Círculo placeholder (não interativo) */}
          <div className="w-6 h-6 rounded-full border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 group-hover:border-gray-300 dark:group-hover:border-gray-500 transition-colors">
            <Plus className="w-3 h-3 text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300 transition-colors" />
          </div>
          
          {/* Título placeholder */}
          <span className="text-sm font-normal text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors">
            Adicionar nova tarefa
          </span>
        </div>
      )}
    </div>
  );
};