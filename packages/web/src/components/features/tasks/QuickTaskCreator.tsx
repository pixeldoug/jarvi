import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus } from 'phosphor-react';

interface QuickTaskCreatorProps {
  sectionId: string;
  onQuickCreate: (title: string, sectionId: string) => Promise<void>;
  hasTasks?: boolean;
}

export const QuickTaskCreator: React.FC<QuickTaskCreatorProps> = ({
  sectionId,
  onQuickCreate,
  hasTasks = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [title, setTitle] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Chave única para localStorage baseada na seção
  const storageKey = `quicktask_${sectionId}`;

  // Usar refs para controle estável (não sofrem re-renderizações)
  const titleRef = useRef<string>('');
  const isEditingRef = useRef<boolean>(false);

  // Restaurar texto do localStorage quando começar a editar
  useEffect(() => {
    if (isEditing) {
      const savedTitle = localStorage.getItem(storageKey);
      if (savedTitle) {
        setTitle(savedTitle);
        titleRef.current = savedTitle;
      }
    }
  }, [isEditing, storageKey]);

  // Mecanismo de recuperação - detectar reset indevido e restaurar
  useEffect(() => {
    if (isEditingRef.current && !isEditing) {
      // Estado foi resetado indevidamente! Restaurar
      console.log('QuickTaskCreator: Estado resetado indevidamente, restaurando...');
      setIsEditing(true);
    }
  }, [isEditing]);

  // Salvar texto no localStorage E na ref conforme digita
  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    titleRef.current = newTitle;
    if (isEditingRef.current && newTitle) {
      localStorage.setItem(storageKey, newTitle);
    }
  }, [storageKey]);


  // Detectar cliques fora do componente para fechar e resetar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isEditingRef.current && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // Sempre resetar quando clicar fora (não preservar texto)
        setTitle('');
        titleRef.current = '';
        setIsEditing(false);
        isEditingRef.current = false;
        localStorage.removeItem(storageKey);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [storageKey]); // Removida dependência de isEditing que causava problemas

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleClick = useCallback(() => {
    setIsEditing(true);
    isEditingRef.current = true; // Sincronizar ref
    // Usar setTimeout para garantir que o input seja focado após renderização
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    // Usar ref como backup se o state foi resetado
    const currentTitle = title || titleRef.current;
    const trimmedTitle = currentTitle.trim();
    if (trimmedTitle) {
      try {
        await onQuickCreate(trimmedTitle, sectionId);
        setTitle('');
        titleRef.current = '';
        setIsEditing(false);
        isEditingRef.current = false; // Sincronizar ref
        // Limpar localStorage após sucesso
        localStorage.removeItem(storageKey);
      } catch (error) {
        console.error('Erro ao criar tarefa:', error);
      }
    }
  }, [title, sectionId, onQuickCreate, storageKey]);

  const handleCancel = useCallback(() => {
    setTitle('');
    titleRef.current = '';
    setIsEditing(false);
    isEditingRef.current = false; // Sincronizar ref
    // Limpar localStorage ao cancelar
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  // Lógica de visibilidade AUTÔNOMA - não depende de props externas
  // SEMPRE visível, mas com diferentes níveis de opacity
  const isFullyVisible = isEditing || isHovered || !hasTasks;
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
      {isEditing ? (
        <form onSubmit={handleSubmit} className="flex items-center space-x-3 w-full">
          {/* Círculo placeholder (não interativo) */}
          <div className="w-6 h-6 rounded-full border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
            <Plus className="w-3 h-3 text-gray-400" />
          </div>
          
          {/* Input de título */}
          <input
            ref={inputRef}
            type="text"
            value={title}
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