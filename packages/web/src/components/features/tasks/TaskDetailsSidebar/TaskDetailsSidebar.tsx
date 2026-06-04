/**
 * TaskDetailsSidebar Component - Jarvi Web
 * 
 * Sidebar for viewing and editing task details
 * Following JarviDS design system from Figma
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Calendar, Hash, Fire, Trash, Sparkle, ArrowLeft } from '@phosphor-icons/react';
import { Task } from '../../../../contexts/TaskContext';
import { useCategories, type Category } from '../../../../contexts/CategoryContext';
import { useMergedTaskCategories } from '../../../../hooks/useMergedTaskCategories';
import { TaskCheckbox } from '../TaskCheckbox';
import { TaskDatePicker } from '../TaskDatePicker';
import { PriorityPicker, type Priority } from '../PriorityPicker';
import { CategoryPicker } from '../CategoryPicker';
import { Button, Chip } from '../../../ui';
import { parseDateString } from '../../../../lib/utils';
import { RichTextEditor } from '../../../ui/RichTextEditor/RichTextEditor';
import styles from './TaskDetailsSidebar.module.css';

export interface TaskDetailsSidebarProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onUpdateTask: (taskId: string, taskData: any) => Promise<void>;
  onToggleCompletion: (taskId: string) => Promise<void>;
  onDelete?: (taskId: string) => void | Promise<void>;
  onOpenChat?: () => void;
  /** Layout variant: sidebar (right panel) or expanded (center column) */
  variant?: 'sidebar' | 'expanded';
  /** Show back button in expanded mode (only when opened from the task list while chat is open) */
  showBackButton?: boolean;
}

export function TaskDetailsSidebar({
  isOpen,
  task,
  onClose,
  onUpdateTask,
  onToggleCompletion,
  onDelete,
  onOpenChat,
  variant = 'sidebar',
  showBackButton = false,
}: TaskDetailsSidebarProps) {
  const { createCategory } = useCategories();
  const mergedTaskCategories = useMergedTaskCategories();
  const [title, setTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [description, setDescription] = useState('');
  const descriptionRef = useRef(description);
  descriptionRef.current = description;
  const descSaveTimerRef = useRef<number | null>(null);
  const handleDescriptionSaveRef = useRef<(() => Promise<void>) | null>(null);
  const prevTaskRef = useRef<typeof task>(null);
  const onUpdateTaskRef = useRef(onUpdateTask);
  onUpdateTaskRef.current = onUpdateTask;
  // Legacy id-only ref kept for logging instrumentation
  const prevTaskIdRef = useRef<string | null>(null);
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
    if (!task) return;

    const isFirstLoad = prevTaskRef.current === null;
    const idChanged = !isFirstLoad && prevTaskRef.current!.id !== task.id;

    // When the cache updates (e.g. API response arrives after optimistic update or a
    // background refresh) and the user is NOT actively editing, sync local description.
    if (!isFirstLoad && !idChanged && (task.description ?? '') !== descriptionRef.current && descSaveTimerRef.current === null) {
      setDescription(task.description || '');
    }

    if (isFirstLoad || idChanged) {
      // Always cancel any stale pending timer when initializing or switching tasks.
      // A stale timer could fire with old content (e.g. from HMR, Strict Mode re-runs,
      // or a previous task's debounce that hadn't fired yet) and overwrite the new task's data.
      if (descSaveTimerRef.current !== null) {
        window.clearTimeout(descSaveTimerRef.current);
        descSaveTimerRef.current = null;
      }

      if (idChanged) {
        // Switching to a different task: save any pending unsaved content for the previous task.
        const prev = prevTaskRef.current!;
        const unsaved = descriptionRef.current;
        if (unsaved !== (prev.description ?? '')) {
          void onUpdateTaskRef.current(prev.id, {
            title: prev.title,
            description: unsaved,
            priority: prev.priority,
            category: prev.category,
            completed: prev.completed,
            dueDate: prev.due_date,
            time: prev.time,
          });
        }
      }
      // Reset description state for the new task (first load or task switch).
      setDescription(task.description || '');
    }
    // Always update the other fields (title, date, time, titleDraft).
    setTitle(task.title || '');
    setSelectedDate(parseDateString(task.due_date));
    setSelectedTime(task.time || '');
    if (!isEditingTitle) {
      setTitleDraft(task.title || '');
    }
    prevTaskRef.current = task;
    prevTaskIdRef.current = task.id;
  }, [task, isEditingTitle]);

  const handleDescriptionChange = useCallback((json: string) => {
    setDescription(json);
    // Debounced save — fires 1.5s after the last content change.
    // Using a ref to always call the latest version of handleDescriptionSave
    // so the closure captures the current description value.
    if (descSaveTimerRef.current !== null) window.clearTimeout(descSaveTimerRef.current);
    descSaveTimerRef.current = window.setTimeout(() => {
      descSaveTimerRef.current = null;
      void handleDescriptionSaveRef.current?.();
    }, 1500);
  }, []);

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

  const handleDescriptionSave = useCallback(async () => {
    if (!task) return;
    // Skip save if description unchanged from what's in the backend — prevents
    // spurious saves when the editor blurs before onChange has fired (e.g. file picker).
    if (description === (task.description ?? '')) return;
    // Cancel any pending debounced save to avoid a double-save.
    if (descSaveTimerRef.current !== null) {
      window.clearTimeout(descSaveTimerRef.current);
      descSaveTimerRef.current = null;
    }
    try {
      await onUpdateTask(task.id, {
        title: title || task.title,
        description,
        priority: task.priority,
        category: task.category,
        completed: task.completed,
        dueDate: task.due_date,
        time: task.time,
      });
    } catch (error) {
      console.error('Failed to update task description:', error);
    }
  }, [task, title, description, onUpdateTask]);

  // Keep ref in sync so the debounced timer always calls the latest closure.
  handleDescriptionSaveRef.current = handleDescriptionSave;

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

  const sidebarClasses = [
    styles.sidebar,
    variant === 'expanded' && styles.expanded,
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={sidebarClasses}
      role="complementary"
      aria-label="Detalhes da tarefa"
    >
      {/* Header: Checkbox + Title + Action Buttons (same flex row) */}
      <div className={styles.header}>
        {showBackButton && (
          <Button
            variant="secondary"
            icon={ArrowLeft}
            iconPosition="icon-only"
            onClick={onClose}
            aria-label="Voltar para lista de tarefas"
          />
        )}
        <div className={styles.titleContainer}>
          <TaskCheckbox
            checked={task.completed}
            onChange={handleToggleCompletionClick}
            ariaLabel={task.completed ? 'Marcar como não concluída' : 'Marcar como concluída'}
            size={variant === 'expanded' ? 'large' : 'medium'}
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

        {variant !== 'expanded' && (
          <div className={styles.headerActions}>
            {onOpenChat && (
              <Button
                variant="secondary"
                icon={Sparkle}
                iconPosition="icon-only"
                onClick={onOpenChat}
                aria-label="Abrir assistente AI"
              />
            )}
            <Button
              variant="secondary"
              icon={X}
              iconPosition="icon-only"
              onClick={onClose}
              aria-label="Fechar sidebar"
            />
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
          categories={mergedTaskCategories}
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

      {/* Description - Rich Text Editor */}
      <div className={styles.textareaContainer}>
        <RichTextEditor
          content={description}
          onChange={handleDescriptionChange}
          onBlur={handleDescriptionSave}
          placeholder="Adicione uma descrição. Digite / para comandos rápidos."
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

