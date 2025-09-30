import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus } from 'phosphor-react';

interface QuickTaskCreatorStableProps {
  sectionId: string;
  onQuickCreate: (title: string, sectionId: string) => Promise<void>;
  hasTasks?: boolean;
}

// Estado global isolado para cada seção (fora do componente React)
const globalState = new Map<string, {
  isEditing: boolean;
  title: string;
  isHovered: boolean;
}>();

export const QuickTaskCreatorStable: React.FC<QuickTaskCreatorStableProps> = ({
  sectionId,
  onQuickCreate,
  hasTasks = false,
}) => {
  // Inicializar estado global se não existir
  if (!globalState.has(sectionId)) {
    globalState.set(sectionId, {
      isEditing: false,
      title: '',
      isHovered: false,
    });
  }

  const state = globalState.get(sectionId)!;
  const [, setForceUpdate] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Função para forçar re-render quando necessário
  const triggerUpdate = useCallback(() => {
    setForceUpdate(prev => prev + 1);
  }, []);

  // Detectar cliques fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (state.isEditing && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        state.isEditing = false;
        state.title = '';
        triggerUpdate();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [state, triggerUpdate]);

  const handleMouseEnter = useCallback(() => {
    state.isHovered = true;
    triggerUpdate();
  }, [state, triggerUpdate]);

  const handleMouseLeave = useCallback(() => {
    state.isHovered = false;
    triggerUpdate();
  }, [state, triggerUpdate]);

  const handleClick = useCallback(() => {
    state.isEditing = true;
    triggerUpdate();
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [state, triggerUpdate]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    state.title = e.target.value;
    triggerUpdate();
  }, [state, triggerUpdate]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = state.title.trim();
    if (trimmedTitle) {
      try {
        await onQuickCreate(trimmedTitle, sectionId);
        state.title = '';
        state.isEditing = false;
        triggerUpdate();
      } catch (error) {
        console.error('Erro ao criar tarefa:', error);
      }
    }
  }, [state, sectionId, onQuickCreate, triggerUpdate]);

  const handleCancel = useCallback(() => {
    state.title = '';
    state.isEditing = false;
    triggerUpdate();
  }, [state, triggerUpdate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as any);
    }
  }, [handleCancel, handleSubmit]);

  // Lógica de visibilidade
  const isFullyVisible = state.isEditing || state.isHovered || !hasTasks;
  const opacity = isFullyVisible ? 'opacity-100' : 'opacity-40';
  const pointerEvents = isFullyVisible ? '' : 'hover:opacity-100';

  return (
    <div 
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`py-2 px-3 flex items-center transition-all duration-200 ${
        hasTasks ? 'h-[40px]' : ''
      } ${opacity} ${pointerEvents}`}
    >
      {state.isEditing ? (
        <form onSubmit={handleSubmit} className="flex items-center space-x-3 w-full">
          <div className="w-6 h-6 rounded-full border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
            <Plus className="w-3 h-3 text-gray-400" />
          </div>
          
          <input
            ref={inputRef}
            type="text"
            value={state.title}
            onChange={handleTitleChange}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-sm font-normal text-gray-600 dark:text-gray-400 placeholder-gray-400 dark:placeholder-gray-500"
            placeholder="Digite o título da tarefa..."
          />
        </form>
      ) : (
        <div 
          onClick={handleClick}
          className="flex items-center space-x-3 cursor-pointer group w-full"
        >
          <div className="w-6 h-6 rounded-full border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 group-hover:border-gray-300 dark:group-hover:border-gray-500 transition-colors">
            <Plus className="w-3 h-3 text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300 transition-colors" />
          </div>
          
          <span className="text-sm font-normal text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors">
            Adicionar nova tarefa
          </span>
        </div>
      )}
    </div>
  );
};
