/**
 * ControlBar Component - Jarvi Web
 * 
 * Navigation bar for switching between app sections
 * Supports two modes:
 * - navigation: Default tabs + action button
 * - task: Expanded task creation form
 * 
 * Following JarviDS design system from Figma
 * Uses Motion One for smooth animations
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDots, Hash, Fire, X, LockSimple } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { Tooltip } from '../Tooltip';
import { TaskDatePicker, PriorityPicker, CategoryPicker } from '../../features/tasks';
import { useCategories, type Category } from '../../../contexts/CategoryContext';
import { toast } from '../Sonner';
import styles from './ControlBar.module.css';

export interface TaskCreationData {
  title: string;
  description: string;
  dueDate?: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface ControlBarProps {
  /** Current active page */
  activePage?: 'tasks' | 'notes' | 'goals' | 'finances';
  /** Callback when a task is created - returns the created task */
  onCreateTask?: (task: TaskCreationData) => Promise<any> | void;
  /** Callback to open task details sidebar with a task */
  onOpenTaskDetails?: (task: any) => void;
  /** Primary action button text */
  primaryActionText?: string;
}

const tabs = [
  { id: 'tasks', label: 'Tarefas', path: '/tasks', comingSoon: false },
  { id: 'notes', label: 'Notas', path: '/notes', comingSoon: true },
  { id: 'goals', label: 'Objetivos', path: '/goals', comingSoon: true },
  { id: 'finances', label: 'Finanças', path: '/finances', comingSoon: true },
] as const;

export function ControlBar({
  activePage = 'tasks',
  onCreateTask,
  onOpenTaskDetails,
  primaryActionText = 'Nova Tarefa',
}: ControlBarProps) {
  const navigate = useNavigate();
  const { categories, createCategory } = useCategories();
  const [mode, setMode] = useState<'navigation' | 'task'>('navigation');
  
  // Task creation state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [dueTime, setDueTime] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | undefined>(undefined);
  const [isDefaultDate, setIsDefaultDate] = useState(false); // Track if date is default "Hoje"
  
  // Popover states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const dateChipRef = useRef<HTMLDivElement>(null);
  const categoryChipRef = useRef<HTMLDivElement>(null);
  const priorityChipRef = useRef<HTMLDivElement>(null);

  const handleOpenTaskMode = useCallback(() => {
    setMode('task');
    // Definir data padrão como "Hoje"
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setDueDate(today);
    setIsDefaultDate(true); // Mark as default date
  }, []);

  // Focus title input when switching to task mode
  // Delay accounts for animation duration (150ms) + small buffer
  useEffect(() => {
    if (mode === 'task') {
      const timeoutId = setTimeout(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus();
        }
      }, 200); // Wait for animation to complete (150ms) + buffer
      
      return () => clearTimeout(timeoutId);
    }
  }, [mode]);

  // Global keyboard shortcut handler for Cmd/Ctrl+/
  useEffect(() => {
    if (!onCreateTask) return; // Only add listener if onCreateTask is provided

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Check if Cmd+/ (Mac) or Ctrl+/ (Windows/Linux) is pressed
      const isModifierPressed = event.metaKey || event.ctrlKey;
      const isSlashKey = event.key === '/' || event.code === 'Slash';
      
      // Debug log (can be removed later)
      if (isModifierPressed && (event.key === '/' || event.code === 'Slash')) {
        console.log('Cmd+/ detected:', { key: event.key, code: event.code, metaKey: event.metaKey, ctrlKey: event.ctrlKey });
      }
      
      if (isModifierPressed && isSlashKey) {
        // Check if user is typing in an input/textarea
        const target = event.target as HTMLElement;
        const isInput = 
          target.tagName === 'INPUT' || 
          target.tagName === 'TEXTAREA' || 
          target.isContentEditable ||
          target.closest('[contenteditable="true"]') !== null;

        // Only prevent default and open task mode if not in an input field
        if (!isInput && mode === 'navigation') {
          console.log('Opening task mode via Cmd+/');
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          handleOpenTaskMode();
        }
      }
    };

    // Use capture phase with high priority to intercept before other handlers
    document.addEventListener('keydown', handleGlobalKeyDown, { capture: true, passive: false });

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
    };
  }, [onCreateTask, mode, handleOpenTaskMode]); // Include handleOpenTaskMode in dependencies

  // Auto-resize description textarea
  useEffect(() => {
    if (descriptionRef.current) {
      descriptionRef.current.style.height = 'auto';
      descriptionRef.current.style.height = `${descriptionRef.current.scrollHeight}px`;
    }
  }, [description]);

  const handleTabClick = (path: string) => {
    navigate(path);
  };

  const handleCloseTaskMode = () => {
    setMode('navigation');
    setTitle('');
    setDescription('');
    setDueDate(null);
    setDueTime('');
    setCategory('');
    setPriority(undefined);
    setIsDefaultDate(false);
    setShowDatePicker(false);
  };

  const handleSubmitTask = async () => {
    if (!title.trim()) return;

    // Format date as ISO string (YYYY-MM-DD) if present
    let formattedDueDate: string | undefined;
    if (dueDate) {
      formattedDueDate = dueDate.toISOString().split('T')[0];
      if (dueTime) {
        formattedDueDate = `${formattedDueDate}T${dueTime}:00`;
      }
    }

    const taskData: TaskCreationData = {
      title: title.trim(),
      description: description.trim(),
      dueDate: formattedDueDate,
      category: category || undefined,
      priority,
    };

    // Create task and get the created task
    const createdTask = await onCreateTask?.(taskData);
    
    // Show toast notification with callback to open task details
    toast.success('Tarefa criada com sucesso', { 
      hasButton: true,
      action: createdTask && onOpenTaskDetails ? {
        label: 'Visualizar',
        onClick: () => onOpenTaskDetails(createdTask),
      } : undefined,
    });
    
    handleCloseTaskMode();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCloseTaskMode();
    }
    if (e.key === 'Enter' && !e.shiftKey && e.target === titleInputRef.current) {
      e.preventDefault();
      if (title.trim()) {
        handleSubmitTask();
      }
    }
  };

  // Handle date selection from TaskDatePicker
  const handleDateSelect = (date: Date | null) => {
    setDueDate(date);
    setIsDefaultDate(false); // User explicitly selected a date, no longer default
    if (!date) {
      setDueTime('');
    }
    // Não fechar automaticamente - o popover só fecha ao clicar fora
  };

  // Handle time selection from TaskDatePicker integrated time picker
  const handleTimeSelect = (time: string | null) => {
    setDueTime(time || '');
  };

  // Open date picker
  const handleDateChipClick = () => {
    setShowDatePicker(true);
  };

  // Format the date chip label
  const formatDateChip = () => {
    if (!dueDate) return 'Sem data';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const selected = new Date(dueDate);
    selected.setHours(0, 0, 0, 0);
    
    if (selected.getTime() === today.getTime()) {
      return dueTime ? `Hoje ${dueTime}` : 'Hoje';
    }
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (selected.getTime() === tomorrow.getTime()) {
      return dueTime ? `Amanhã ${dueTime}` : 'Amanhã';
    }
    
    const day = dueDate.getDate();
    const month = dueDate.toLocaleDateString('pt-BR', { month: 'short' })
      .replace('.', '')
      .replace(/^./, str => str.toUpperCase());
    
    return dueTime ? `${day} ${month} ${dueTime}` : `${day} ${month}`;
  };

  // Clear date and time
  const handleClearDate = () => {
    setDueDate(null);
    setDueTime('');
    setIsDefaultDate(false);
  };

  // Clear priority
  const handleClearPriority = () => {
    setPriority(undefined);
  };

  // Clear category
  const handleClearCategory = () => {
    setCategory('');
  };

  // Handle category selection
  const handleCategorySelect = (cat: Category) => {
    setCategory(cat.name);
  };

  // Handle create category
  const handleCreateCategory = async (name: string) => {
    try {
      const newCategory = await createCategory({ name: name.trim() });
      setCategory(newCategory.name); // Auto-select the new category
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        toast.error('Categoria já existe', { description: 'Escolha um nome diferente' });
      } else {
        toast.error('Erro ao criar categoria');
      }
    }
  };

  const isSubmitDisabled = !title.trim();

  // ============================================================
  // 🎨 ANIMATION CONFIG - EDITE AQUI!
  // ============================================================
  //
  // 📌 OPÇÕES DE TRANSITION:
  //
  // 1) Simples com duração:
  //    transition={{ duration: 0.2 }}
  //
  // 2) Com easing (linear, easeIn, easeOut, easeInOut):
  //    transition={{ duration: 0.2, ease: 'easeOut' }}
  //
  // 3) Com delay (espera antes de começar):
  //    transition={{ duration: 0.2, delay: 0.1 }}
  //
  // 4) Spring (animação com bounce):
  //    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
  //    - stiffness: 100-1000 (maior = mais rápido)
  //    - damping: 10-100 (maior = menos bounce)
  //
  // 📌 PROPRIEDADES ANIMÁVEIS:
  //    opacity, x, y, scale, rotate, width, height...
  //
  // 📌 INTERAÇÃO:
  //    whileHover={{ scale: 1.05 }}
  //    whileTap={{ scale: 0.95 }}
  //
  // ============================================================

  return (
    <div
      className={mode === 'task' ? styles.controlBarTask : styles.controlBar}
      onKeyDown={mode === 'task' ? handleKeyDown : undefined}
      data-theme="dark"
      data-control-bar
    >
      {/* mode: 'wait' | 'popLayout' | 'sync' */}
      <AnimatePresence mode="wait">
        {mode === 'task' ? (
          // ========== TASK MODE ==========
          <motion.div
            key="task-mode"
            // Estado inicial (antes de aparecer)
            initial={{ opacity: 0 }}
            // Estado final (quando visível)
            animate={{ opacity: 1 }}
            // Estado de saída (quando some)
            exit={{ opacity: 0 }}
            // Como animar
            transition={{ duration: 0.15 }}
            style={{ width: '100%' }}
          >
            {/* Content Area */}
            <div className={styles.taskContent}>
              <div className={styles.taskWrapper}>
                <div className={styles.taskInputContainer}>
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Digite o título da tarefa"
                    className={styles.taskTitleInput}
                    autoFocus
                  />
                </div>
              </div>
              
              <div className={styles.taskDescriptionContainer}>
                <textarea
                  ref={descriptionRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição"
                  className={styles.taskDescriptionInput}
                  rows={1}
                />
              </div>
            </div>

            {/* Footer with Chips + Submit */}
            <div className={styles.taskFooter}>
              <div className={styles.chipsGroup}>
                {/* Date Chip */}
                <div ref={dateChipRef} style={{ display: 'inline-flex' }}>
                  <Chip
                    label={formatDateChip()}
                    icon={<CalendarDots weight="regular" />}
                    size="medium"
                    interactive
                    active={showDatePicker || (!isDefaultDate && !!dueDate) || !!dueTime}
                    onClick={handleDateChipClick}
                    onClear={(dueDate || dueTime) ? handleClearDate : undefined}
                  />
                </div>

                {/* Category Chip */}
                <div ref={categoryChipRef} style={{ display: 'inline-flex' }}>
                  <Chip
                    label={category || 'Categoria'}
                    icon={<Hash weight="regular" />}
                    size="medium"
                    interactive
                    active={!!category || showCategoryPicker}
                    onClick={() => setShowCategoryPicker(true)}
                    onClear={category ? handleClearCategory : undefined}
                  />
                </div>

                {/* Priority Chip */}
                <div ref={priorityChipRef} style={{ display: 'inline-flex' }}>
                  <Chip
                    label={priority === 'high' ? 'Urgente' : priority === 'medium' ? 'Média' : priority === 'low' ? 'Baixa' : 'Prioridade'}
                    icon={<Fire weight="regular" />}
                    size="medium"
                    interactive
                    active={!!priority || showPriorityPicker}
                    onClick={() => setShowPriorityPicker(true)}
                    onClear={priority ? handleClearPriority : undefined}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <Button
                variant="primary"
                className={styles.submitButton}
                onClick={handleSubmitTask}
                disabled={isSubmitDisabled}
              >
                Adicionar Tarefa
              </Button>
            </div>

            {/* Close Button */}
            <Button
              variant="ghost"
              icon={X}
              iconPosition="icon-only"
              className={styles.closeButton}
              onClick={handleCloseTaskMode}
              aria-label="Fechar"
            />
          </motion.div>
        ) : (
          // ========== NAVIGATION MODE ==========
          <motion.div
            key="navigation-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={styles.footer}
          >
            {tabs.map((tab) => (
              <div key={tab.id} style={{ flex: 1 }}>
                {tab.comingSoon ? (
                  <Tooltip label="Em breve" position="top">
                    <Button
                      variant="ghost"
                      className={`${styles.tab}`}
                      onClick={(e) => e.preventDefault()}
                      aria-disabled="true"
                      
                    >
                      <LockSimple weight="fill" className={styles.lockIcon} />
                      {tab.label}
                    </Button>
                  </Tooltip>
                ) : (
                  <Button
                    variant="ghost"
                    className={`${styles.tab} ${activePage === tab.id ? styles.tabActive : ''}`}
                    onClick={() => handleTabClick(tab.path)}
                  >
                    {tab.label}
                  </Button>
                )}
              </div>
            ))}
            
            {onCreateTask && (
              <Button
                variant="primary"
                className={styles.actionButton}
                onClick={handleOpenTaskMode}
                shortcut="⌘/"
              >
                {primaryActionText}
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Popovers - rendered outside AnimatePresence for proper positioning */}
      <TaskDatePicker
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        selectedDate={dueDate || undefined}
        onDateSelect={handleDateSelect}
        onTimeSelect={handleTimeSelect}
        selectedTime={dueTime || undefined}
        anchorRef={dateChipRef}
      />

      <CategoryPicker
        isOpen={showCategoryPicker}
        onClose={() => setShowCategoryPicker(false)}
        categories={categories}
        selectedCategory={category || undefined}
        onSelectCategory={handleCategorySelect}
        onCreateCategory={handleCreateCategory}
        anchorRef={categoryChipRef}
      />

      <PriorityPicker
        isOpen={showPriorityPicker}
        onClose={() => setShowPriorityPicker(false)}
        selectedPriority={priority}
        onPrioritySelect={(p) => setPriority(p)}
        anchorRef={priorityChipRef}
      />
    </div>
  );
}
