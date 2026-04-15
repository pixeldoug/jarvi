/**
 * ControlBar Component - Jarvi Web
 *
 * Prompt bar with toggle to switch between AI mode and manual task creation.
 * Following JarviDS design system from Figma (node 40000921:35316).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { CalendarDots, Hash, Fire, Sparkle, PencilSimple, PaperPlaneTilt } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { TaskDatePicker, PriorityPicker, CategoryPicker } from '../../features/tasks';
import { useCategories, type Category } from '../../../contexts/CategoryContext';
import { useMergedTaskCategories } from '../../../hooks/useMergedTaskCategories';
import { useSubscription } from '../../../contexts/SubscriptionContext';
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
  /** Callback when a task is created */
  onCreateTask?: (task: TaskCreationData) => Promise<any> | void;
  /** Callback to open task details sidebar with a task */
  onOpenTaskDetails?: (task: any) => void;
  /** Callback to open AI chat panel */
  onOpenChat?: () => void;
  /** Callback when prompt is submitted with text (optional – falls back to onOpenChat) */
  onSubmitPrompt?: (text: string) => void;
  /** When true, slides and fades the bar out of view */
  hidden?: boolean;
}

export function ControlBar({
  onCreateTask,
  onOpenTaskDetails,
  onOpenChat,
  onSubmitPrompt,
  hidden = false,
}: ControlBarProps) {
  const { createCategory } = useCategories();
  const mergedTaskCategories = useMergedTaskCategories();
  const { trialExpired } = useSubscription();

  // 'prompt' = AI mode (default) | 'task' = manual task creation
  const [mode, setMode] = useState<'prompt' | 'task'>('prompt');

  // Prompt bar state
  const [promptText, setPromptText] = useState('');
  const promptInputRef = useRef<HTMLInputElement>(null);

  // Task creation state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [dueTime, setDueTime] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | undefined>(undefined);
  const [isDefaultDate, setIsDefaultDate] = useState(false);

  // Popover states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const dateChipRef = useRef<HTMLDivElement>(null);
  const categoryChipRef = useRef<HTMLDivElement>(null);
  const priorityChipRef = useRef<HTMLDivElement>(null);

  const handleSwitchToTask = useCallback(() => {
    if (trialExpired) return;
    setMode('task');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setDueDate(today);
    setIsDefaultDate(true);
  }, []);

  const handleSwitchToPrompt = useCallback(() => {
    setMode('prompt');
    setTitle('');
    setDescription('');
    setDueDate(null);
    setDueTime('');
    setCategory('');
    setPriority(undefined);
    setIsDefaultDate(false);
    setShowDatePicker(false);
    setShowCategoryPicker(false);
    setShowPriorityPicker(false);
  }, []);

  // Focus title input when entering task mode
  useEffect(() => {
    if (mode === 'task') {
      const id = setTimeout(() => titleInputRef.current?.focus(), 200);
      return () => clearTimeout(id);
    }
  }, [mode]);

  // Global Cmd+/ shortcut → switch to task mode
  useEffect(() => {
    if (!onCreateTask) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifier = e.metaKey || e.ctrlKey;
      const isSlash = e.key === '/' || e.code === 'Slash';
      if (!isModifier || !isSlash) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]') !== null;

      if (!isInput && mode === 'prompt') {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleSwitchToTask();
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true, passive: false });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onCreateTask, mode, handleSwitchToTask]);

  // Auto-resize description textarea
  useEffect(() => {
    if (descriptionRef.current) {
      descriptionRef.current.style.height = 'auto';
      descriptionRef.current.style.height = `${descriptionRef.current.scrollHeight}px`;
    }
  }, [description]);

  // ── Prompt handlers ──────────────────────────────────────────────────────────

  const handlePromptSubmit = () => {
    if (trialExpired) return;
    if (onSubmitPrompt && promptText.trim()) {
      onSubmitPrompt(promptText.trim());
    } else if (onOpenChat) {
      onOpenChat();
    }
    setPromptText('');
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlePromptSubmit();
    }
  };

  // ── Task creation handlers ────────────────────────────────────────────────────

  const handleSubmitTask = async () => {
    if (!title.trim() || trialExpired) return;

    let formattedDueDate: string | undefined;
    if (dueDate) {
      formattedDueDate = dueDate.toISOString().split('T')[0];
      if (dueTime) formattedDueDate = `${formattedDueDate}T${dueTime}:00`;
    }

    const taskData: TaskCreationData = {
      title: title.trim(),
      description: description.trim(),
      dueDate: formattedDueDate,
      category: category || undefined,
      priority,
    };

    const createdTask = await onCreateTask?.(taskData);

    toast.success('Tarefa criada com sucesso', {
      hasButton: true,
      action:
        createdTask && onOpenTaskDetails
          ? { label: 'Visualizar', onClick: () => onOpenTaskDetails(createdTask) }
          : undefined,
    });

    handleSwitchToPrompt();
  };

  const handleTaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleSwitchToPrompt();
    if (e.key === 'Enter' && !e.shiftKey && e.target === titleInputRef.current) {
      e.preventDefault();
      if (title.trim()) handleSubmitTask();
    }
  };

  const handleDateSelect = (date: Date | null) => {
    setDueDate(date);
    setIsDefaultDate(false);
    if (!date) setDueTime('');
  };

  const handleTimeSelect = (time: string | null) => {
    setDueTime(time || '');
  };

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
    const month = dueDate
      .toLocaleDateString('pt-BR', { month: 'short' })
      .replace('.', '')
      .replace(/^./, (s) => s.toUpperCase());
    return dueTime ? `${day} ${month} ${dueTime}` : `${day} ${month}`;
  };

  const handleCategorySelect = (cat: Category) => setCategory(cat.name);

  const handleCreateCategory = async (name: string) => {
    try {
      const newCategory = await createCategory({ name: name.trim() });
      setCategory(newCategory.name);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        toast.error('Categoria já existe', { description: 'Escolha um nome diferente' });
      } else {
        toast.error('Erro ao criar categoria');
      }
    }
  };

  const isSubmitDisabled = !title.trim() || trialExpired;

  // ── Toggle group ─────────────────────────────────────────────────────────────

  const toggleGroup = (
    <div className={styles.toggleGroup}>
      {/* Sparkle = AI / prompt mode */}
      <button
        type="button"
        className={`${styles.toggleButton} ${mode === 'prompt' ? styles.toggleButtonActive : ''}`}
        onClick={mode === 'task' ? handleSwitchToPrompt : undefined}
        aria-label="Modo AI"
        aria-pressed={mode === 'prompt'}
      >
        <Sparkle weight={mode === 'prompt' ? 'fill' : 'regular'} size={18} />
      </button>
      {/* Pencil = task creation mode */}
      <button
        type="button"
        className={`${styles.toggleButton} ${mode === 'task' ? styles.toggleButtonActive : ''}`}
        onClick={mode === 'prompt' ? handleSwitchToTask : undefined}
        aria-label="Criar tarefa"
        aria-pressed={mode === 'task'}
        disabled={!onCreateTask || trialExpired}
      >
        <PencilSimple weight={mode === 'task' ? 'fill' : 'regular'} size={18} />
      </button>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <motion.div
      className={mode === 'task' ? styles.controlBarTask : styles.controlBar}
      onKeyDown={mode === 'task' ? handleTaskKeyDown : undefined}
      data-theme="dark"
      data-control-bar
      style={{ x: "-50%" }}
      animate={hidden ? { opacity: 0, y: 20, pointerEvents: 'none' } : { opacity: 1, y: 0, pointerEvents: 'auto' }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
    >
      <AnimatePresence mode="wait">
        {mode === 'task' ? (
          // ── TASK MODE ──────────────────────────────────────────────────────────
          <motion.div
            key="task-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ width: '100%' }}
          >
            {/* Content */}
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

            {/* Footer */}
            <div className={styles.taskFooter}>
              <div className={styles.chipsGroup}>
                <div ref={dateChipRef} style={{ display: 'inline-flex' }}>
                  <Chip
                    label={formatDateChip()}
                    icon={<CalendarDots weight="regular" />}
                    size="medium"
                    interactive
                    active={showDatePicker || (!isDefaultDate && !!dueDate) || !!dueTime}
                    onClick={() => setShowDatePicker(true)}
                    onClear={dueDate || dueTime ? () => { setDueDate(null); setDueTime(''); setIsDefaultDate(false); } : undefined}
                  />
                </div>

                <div ref={categoryChipRef} style={{ display: 'inline-flex' }}>
                  <Chip
                    label={category || 'Categoria'}
                    icon={<Hash weight="regular" />}
                    size="medium"
                    interactive
                    active={!!category || showCategoryPicker}
                    onClick={() => setShowCategoryPicker(true)}
                    onClear={category ? () => setCategory('') : undefined}
                  />
                </div>

                <div ref={priorityChipRef} style={{ display: 'inline-flex' }}>
                  <Chip
                    label={
                      priority === 'high'
                        ? 'Urgente'
                        : priority === 'medium'
                        ? 'Média'
                        : priority === 'low'
                        ? 'Baixa'
                        : 'Prioridade'
                    }
                    icon={<Fire weight="regular" />}
                    size="medium"
                    interactive
                    active={!!priority || showPriorityPicker}
                    onClick={() => setShowPriorityPicker(true)}
                    onClear={priority ? () => setPriority(undefined) : undefined}
                  />
                </div>
              </div>

              {toggleGroup}

              <Button
                variant="primary"
                className={styles.submitButton}
                onClick={handleSubmitTask}
                disabled={isSubmitDisabled}
              >
                Adicionar
              </Button>
            </div>
          </motion.div>
        ) : (
          // ── PROMPT MODE ────────────────────────────────────────────────────────
          <motion.div
            key="prompt-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={styles.promptRow}
          >
            <input
              ref={promptInputRef}
              type="text"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={handlePromptKeyDown}
              placeholder="Me diga o que você precisa fazer ou saber..."
              className={styles.promptInput}
              disabled={trialExpired}
            />

            {toggleGroup}

            <button
              type="button"
              className={styles.sendButton}
              onClick={handlePromptSubmit}
              aria-label="Enviar"
              disabled={trialExpired}
            >
              <PaperPlaneTilt weight="fill" size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Popovers */}
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
        categories={mergedTaskCategories}
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
    </motion.div>
  );
}
