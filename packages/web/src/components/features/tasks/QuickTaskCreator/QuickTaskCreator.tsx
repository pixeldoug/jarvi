/**
 * QuickTaskCreator Component - Jarvi Web
 * 
 * Component for quickly creating tasks within a section
 * Following JarviDS design system from Figma
 * 
 * ⚠️ NOT USED IN MVP INITIAL
 * This component is kept for future use but is currently disabled.
 * To re-enable:
 * 1. Uncomment the export in components/features/tasks/index.ts
 * 2. Uncomment the import and usage in pages/TasksV2.tsx
 * 3. Uncomment the handleQuickCreate function in TasksV2.tsx
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus } from '@phosphor-icons/react';
import styles from './QuickTaskCreator.module.css';

export interface QuickTaskCreatorProps {
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

export const QuickTaskCreator: React.FC<QuickTaskCreatorProps> = ({
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
  const containerClasses = [
    styles.container,
    state.isEditing && styles.editing,
    !isFullyVisible && styles.hidden,
  ].filter(Boolean).join(' ');

  return (
    <div 
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={containerClasses}
    >
      {state.isEditing ? (
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.iconContainer}>
            <Plus className={styles.icon} weight="bold" />
          </div>
          
          <input
            ref={inputRef}
            type="text"
            value={state.title}
            onChange={handleTitleChange}
            onKeyDown={handleKeyDown}
            className={styles.input}
            placeholder="Digite o título da tarefa..."
          />
        </form>
      ) : (
        <div onClick={handleClick} className={styles.form}>
          <div className={styles.iconContainer}>
            <Plus className={styles.icon} weight="bold" />
          </div>
          
          <span className={styles.label}>
            Nova Tarefa
          </span>
        </div>
      )}
    </div>
  );
};
