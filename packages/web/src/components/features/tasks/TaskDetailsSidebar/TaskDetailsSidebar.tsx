/**
 * TaskDetailsSidebar Component - Jarvi Web
 * 
 * Sidebar for viewing and editing task details
 * Following JarviDS design system from Figma
 */

import { useState, useEffect, useRef } from 'react';
import { X, Calendar, Hash, Fire, Trash } from '@phosphor-icons/react';
import { Task } from '../../../../contexts/TaskContext';
import { useCategories, type Category } from '../../../../contexts/CategoryContext';
import { TaskCheckbox } from '../TaskCheckbox';
import { TaskDatePicker } from '../TaskDatePicker';
import { PriorityPicker, type Priority } from '../PriorityPicker';
import { CategoryPicker } from '../CategoryPicker';
import { Button, Chip } from '../../../ui';
import { parseDateString } from '../../../../lib/utils';
import styles from './TaskDetailsSidebar.module.css';

export interface TaskDetailsSidebarProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onUpdateTask: (taskId: string, taskData: any) => Promise<void>;
  onToggleCompletion: (taskId: string) => Promise<void>;
  onDelete?: (taskId: string) => void | Promise<void>;
}

export function TaskDetailsSidebar({
  isOpen,
  task,
  onClose,
  onUpdateTask,
  onToggleCompletion,
  onDelete,
}: TaskDetailsSidebarProps) {
  const { categories, createCategory } = useCategories();
  const [title, setTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const skipTitleBlurSaveRef = useRef(false);
  const dateChipRef = useRef<HTMLDivElement>(null);
  const priorityChipRef = useRef<HTMLDivElement>(null);
  const categoryChipRef = useRef<HTMLDivElement>(null);

  // Update local state when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setSelectedDate(parseDateString(task.due_date));
      setSelectedTime(task.time || '');
      if (!isEditingTitle) {
        setTitleDraft(task.title || '');
      }
    }
  }, [task, isEditingTitle]);

  // Focus title input when editing
  useEffect(() => {
    if (!isEditingTitle) return;
    // Let the input mount before focusing
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, [isEditingTitle]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditingTitle) {
          e.preventDefault();
          skipTitleBlurSaveRef.current = true;
          setIsEditingTitle(false);
          setTitleDraft(title || task?.title || '');
          return;
        }
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, isEditingTitle, title, task]);

  const handleTitleClick = () => {
    setIsEditingTitle(true);
    setTitleDraft(title || task?.title || '');
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
    setTitleDraft(title || task?.title || '');
  };

  const handleTitleSave = async () => {
    if (!task) return;

    const trimmedTitle = titleDraft.trim();
    if (!trimmedTitle) {
      handleTitleCancel();
      return;
    }

    const prevTitle = title;
    // Optimistic update so other updates don't overwrite the new title
    setTitle(trimmedTitle);
    setIsEditingTitle(false);
    setTitleDraft(trimmedTitle);

    try {
      await onUpdateTask(task.id, {
        title: trimmedTitle,
        description: task.description,
        priority: task.priority,
        category: task.category,
        completed: task.completed,
        dueDate: task.due_date,
        time: task.time,
      });
    } catch (error) {
      console.error('Failed to update task title:', error);
      setTitle(prevTitle);
      setTitleDraft(prevTitle);
      setIsEditingTitle(true);
    }
  };

  // Handle description save
  const handleDescriptionBlur = async () => {
    if (!task) return;
    
    try {
      await onUpdateTask(task.id, {
        title: title || task.title,
        description: description.trim(),
        priority: task.priority,
        category: task.category,
        completed: task.completed,
        dueDate: task.due_date,
        time: task.time,
      });
    } catch (error) {
      console.error('Failed to update task description:', error);
    }
  };

  // Handle completion toggle
  const handleToggleCompletionClick = async () => {
    if (!task) return;
    await onToggleCompletion(task.id);
  };

  // Handle date clear
  const handleDateClear = async () => {
    if (!task) return;
    
    // Optimistic update
    setSelectedDate(null);
    setSelectedTime('');
    
    try {
      await onUpdateTask(task.id, {
        title: title || task.title,
        description: task.description,
        priority: task.priority,
        category: task.category,
        completed: task.completed,
        dueDate: '',
        time: '',
      });
    } catch (error) {
      console.error('Failed to clear task date:', error);
      // Rollback on error
      setSelectedDate(parseDateString(task.due_date));
      setSelectedTime(task.time || '');
    }
  };

  // Handle delete task
  const handleDeleteClick = async () => {
    if (!task || !onDelete) return;
    
    try {
      await onDelete(task.id);
      // Close sidebar after deletion
      onClose();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  // Handle date selection from date picker
  const handleDateSelect = async (date: Date | null) => {
    if (!task) return;
    
    // Store previous values for rollback
    const prevDate = selectedDate;
    const prevTime = selectedTime;
    
    // Optimistic update
    setSelectedDate(date);
    if (!date) {
      setSelectedTime('');
    }
    
    try {
      await onUpdateTask(task.id, {
        title: title || task.title,
        description: task.description,
        priority: task.priority,
        category: task.category,
        completed: task.completed,
        dueDate: date ? date.toISOString().split('T')[0] : '',
        time: date ? selectedTime : '',
      });
    } catch (error) {
      console.error('Failed to update task date:', error);
      // Rollback on error
      setSelectedDate(prevDate);
      setSelectedTime(prevTime);
    }
  };

  // Handle time selection from TaskDatePicker integrated time picker
  const handleTimeSelect = async (time: string | null) => {
    if (!task) return;
    
    const prevTime = selectedTime;
    
    // Optimistic update
    setSelectedTime(time || '');
    
    try {
      await onUpdateTask(task.id, {
        title: title || task.title,
        description: task.description,
        priority: task.priority,
        category: task.category,
        completed: task.completed,
        dueDate: selectedDate ? selectedDate.toISOString().split('T')[0] : task.due_date,
        time: time ?? '',
      });
    } catch (error) {
      console.error('Failed to update task time:', error);
      // Rollback on error
      setSelectedTime(prevTime);
    }
  };

  // Handle date chip click
  const handleDateChipClick = () => {
    setShowDatePicker(prev => !prev);
  };

  // Close pickers when sidebar closes
  useEffect(() => {
    if (!isOpen) {
      setShowDatePicker(false);
      setShowPriorityPicker(false);
      setShowCategoryPicker(false);
    }
  }, [isOpen]);

  // Handle priority selection
  const handlePrioritySelect = async (priority: Priority) => {
    if (!task) return;
    
    try {
      await onUpdateTask(task.id, {
        title: title || task.title,
        description: task.description,
        priority: priority,
        category: task.category,
        completed: task.completed,
        dueDate: task.due_date,
        time: task.time,
      });
    } catch (error) {
      console.error('Failed to update task priority:', error);
    }
  };

  // Handle priority clear (remove priority)
  const handlePriorityClear = async () => {
    if (!task) return;
    
    try {
      await onUpdateTask(task.id, {
        title: title || task.title,
        description: task.description,
        priority: null,
        category: task.category,
        completed: task.completed,
        dueDate: task.due_date,
        time: task.time,
      });
    } catch (error) {
      console.error('Failed to clear task priority:', error);
    }
  };

  // Handle category selection
  const handleCategorySelect = async (cat: Category) => {
    if (!task) return;
    
    try {
      await onUpdateTask(task.id, {
        title: title || task.title,
        description: task.description,
        priority: task.priority,
        category: cat.name,
        completed: task.completed,
        dueDate: task.due_date,
        time: task.time,
      });
    } catch (error) {
      console.error('Failed to update task category:', error);
    }
  };

  // Handle create category
  const handleCreateCategory = async (name: string) => {
    try {
      const newCategory = await createCategory({ name: name.trim() });
      
      // Also update the task with this new category
      if (task) {
        await onUpdateTask(task.id, {
          title: title || task.title,
          description: task.description,
          priority: task.priority,
          category: newCategory.name,
          completed: task.completed,
          dueDate: task.due_date,
          time: task.time,
        });
      }
    } catch (error: any) {
      console.error('Failed to create category:', error);
    }
  };

  // Handle category clear
  const handleCategoryClear = async () => {
    if (!task) return;
    
    try {
      await onUpdateTask(task.id, {
        title: title || task.title,
        description: task.description,
        priority: task.priority,
        category: null,
        completed: task.completed,
        dueDate: task.due_date,
        time: task.time,
      });
    } catch (error) {
      console.error('Failed to clear task category:', error);
    }
  };

  // Format the date chip label based on local state
  const formatDateChip = () => {
    if (!selectedDate) return 'Definir';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    
    if (selected.getTime() === today.getTime()) {
      return selectedTime ? `Hoje ${selectedTime}` : 'Hoje';
    }
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (selected.getTime() === tomorrow.getTime()) {
      return selectedTime ? `Amanhã ${selectedTime}` : 'Amanhã';
    }
    
    const day = selectedDate.getDate();
    const month = selectedDate.toLocaleDateString('pt-BR', { month: 'short' })
      .replace('.', '')
      .replace(/^./, str => str.toUpperCase());
    
    return selectedTime ? `${day} ${month} ${selectedTime}` : `${day} ${month}`;
  };

  // Always render the container, but show/hide content based on isOpen and task
  if (!task) {
    return null;
  }

  const priorityLabels: Record<string, string> = {
    low: 'Baixa',
    medium: 'Média',
    high: 'Urgente',
  };

  return (
    <div 
      className={styles.sidebar}
      role="complementary"
      aria-label="Detalhes da tarefa"
    >
      {/* Close Button */}
      <Button
        variant="secondary"
        icon={X}
        iconPosition="icon-only"
        onClick={onClose}
        aria-label="Fechar sidebar"
        className={styles.closeButton}
      />

      {/* Header: Checkbox + Title */}
      <div className={styles.header}>
        <TaskCheckbox
          checked={task.completed}
          onChange={handleToggleCompletionClick}
          ariaLabel={task.completed ? 'Marcar como não concluída' : 'Marcar como concluída'}
          size="large"
        />
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            className={styles.titleInput}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (skipTitleBlurSaveRef.current) {
                skipTitleBlurSaveRef.current = false;
                return;
              }
              void handleTitleSave();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleTitleSave();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                skipTitleBlurSaveRef.current = true;
                handleTitleCancel();
              }
            }}
            aria-label="Título da tarefa"
          />
        ) : (
          <div
            className={styles.titleButton}
            onClick={handleTitleClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTitleClick();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Editar título da tarefa"
          >
            <h2 className={styles.title}>{title || task.title}</h2>
          </div>
        )}
      </div>

      {/* Chips: Date, Category, Priority */}
      <div className={styles.chipsContainer}>
        <div ref={dateChipRef} style={{ display: 'inline-flex' }}>
          <Chip
            label={formatDateChip()}
            icon={<Calendar weight="regular" />}
            size="medium"
            interactive
            active={showDatePicker || !!selectedDate || !!selectedTime}
            onClick={handleDateChipClick}
            onClear={selectedDate ? handleDateClear : undefined}
          />
        </div>

        {/* Date Picker Popover */}
        <TaskDatePicker
          isOpen={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          selectedDate={selectedDate || undefined}
          onDateSelect={handleDateSelect}
          onTimeSelect={handleTimeSelect}
          selectedTime={selectedTime || undefined}
          anchorRef={dateChipRef}
        />
        <div ref={categoryChipRef} style={{ display: 'inline-flex' }}>
          <Chip
            label={task.category || 'Categoria'}
            icon={<Hash weight="regular" />}
            size="medium"
            interactive
            active={showCategoryPicker || !!task.category}
            onClick={() => setShowCategoryPicker(prev => !prev)}
            onClear={task.category ? handleCategoryClear : undefined}
          />
        </div>
        
        {/* Category Picker */}
        <CategoryPicker
          isOpen={showCategoryPicker}
          onClose={() => setShowCategoryPicker(false)}
          categories={categories}
          selectedCategory={task.category || undefined}
          onSelectCategory={handleCategorySelect}
          onCreateCategory={handleCreateCategory}
          anchorRef={categoryChipRef}
        />
        
        <div ref={priorityChipRef} style={{ display: 'inline-flex' }}>
          <Chip
            label={task.priority ? (priorityLabels[task.priority] || task.priority) : 'Prioridade'}
            icon={<Fire weight="regular" />}
            size="medium"
            interactive
            active={showPriorityPicker || !!task.priority}
            onClick={() => setShowPriorityPicker(prev => !prev)}
            onClear={task.priority ? handlePriorityClear : undefined}
          />
        </div>
        
        {/* Priority Picker */}
        <PriorityPicker
          isOpen={showPriorityPicker}
          onClose={() => setShowPriorityPicker(false)}
          selectedPriority={task.priority as Priority | undefined}
          onPrioritySelect={handlePrioritySelect}
          anchorRef={priorityChipRef}
        />
      </div>

      {/* Description Textarea */}
      <div className={styles.textareaContainer}>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
          placeholder="Adicione uma descrição..."
        />
      </div>

      {/* Footer: Creation Timestamp */}
      <div className={styles.footer}>
        <span className={styles.timestamp}>
          Criada em {formatTaskCreationDate(task)}
        </span>
      </div>

      {/* Delete Button */}
      {onDelete && (
        <Button
          variant="ghost"
          icon={Trash}
          iconPosition="icon-only"
          onClick={handleDeleteClick}
          aria-label="Excluir tarefa"
          className={styles.deleteButton}
        />
      )}
    </div>
  );
}

// Helper function to format creation date
function formatTaskCreationDate(task: Task): string {
  try {
    const date = new Date(task.created_at);
    const day = date.getDate();
    const month = date.toLocaleDateString('pt-BR', { month: 'short' })
      .replace('.', '')
      .replace(/^./, str => str.toUpperCase());
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day} ${month} ${year} · ${hours}:${minutes}`;
  } catch {
    return 'Data desconhecida';
  }
}

