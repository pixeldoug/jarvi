/**
 * ControlBar Component - Jarvi Web
 *
 * Prompt bar with toggle to switch between AI mode and manual task creation.
 * Following JarviDS design system from Figma (node 40000921:35316).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ClipboardEvent, DragEvent } from 'react';
import { CalendarDots, Hash, Fire, Sparkle, PencilSimple, PaperPlaneTilt, CaretDown, Paperclip, FileText, X, UploadSimple, Bell } from '@phosphor-icons/react';
import { Repeat } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { RecurrenceType, TaskReminderDraft } from '@jarvi/shared';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { TaskDatePicker, PriorityPicker, CategoryPicker, FrequencyPicker, ReminderPicker, type FrequencyValue } from '../../features/tasks';
import { useCategories, type Category } from '../../../contexts/CategoryContext';
import { useMergedTaskCategories } from '../../../hooks/useMergedTaskCategories';
import { useKeyboardOffset } from '../../../hooks/useKeyboardOffset';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import type { ChatAttachment } from '../../../hooks/useChatStream';
import {
  MAX_CHAT_ATTACHMENTS,
  PendingAttachment,
  filesToPendingAttachments,
  toChatAttachmentPayload,
} from '../../../utils/chatAttachments';
import { formatFrequencyChip } from '../../../lib/recurrence';
import { formatRemindersChipLabel } from '../../../lib/reminders';
import { toast } from '../Sonner';
import { AttachmentViewer } from '../AttachmentViewer';
import styles from './ControlBar.module.css';

export interface TaskCreationData {
  title: string;
  description: string;
  dueDate?: string;
  time?: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high';
  recurrence_type?: RecurrenceType;
  recurrence_config?: string;
  recurrence_until?: string | null;
  reminders?: TaskReminderDraft[];
}

export interface ControlBarProps {
  /** Callback when a task is created */
  onCreateTask?: (task: TaskCreationData) => Promise<any> | void;
  /** Callback to open task details sidebar with a task */
  onOpenTaskDetails?: (task: any) => void;
  /** Callback to open AI chat panel */
  onOpenChat?: () => void;
  /** Callback when prompt is submitted with text and optional attachments (falls back to onOpenChat) */
  onSubmitPrompt?: (text: string, attachments?: ChatAttachment[]) => void;
  /** When true, slides and fades the bar out of view */
  hidden?: boolean;
  /** Default category pre-filled when entering task creation mode */
  defaultCategory?: string;
  /** Called on mobile after an action completes (prompt submit or task creation) so the FAB can re-appear */
  onMobileClose?: () => void;
}

export function ControlBar({
  onCreateTask,
  onOpenTaskDetails,
  onOpenChat,
  onSubmitPrompt,
  hidden = false,
  defaultCategory,
  onMobileClose,
}: ControlBarProps) {
  const { createCategory } = useCategories();
  const mergedTaskCategories = useMergedTaskCategories();
  const { trialExpired } = useSubscription();

  // Keep the bar above the virtual keyboard on mobile (see hook docs)
  useKeyboardOffset();

  // 'prompt' = AI mode (default) | 'task' = manual task creation
  const [mode, setMode] = useState<'prompt' | 'task'>('prompt');

  // Prompt bar state
  const [promptText, setPromptText] = useState('');
  const [promptAttachments, setPromptAttachments] = useState<PendingAttachment[]>([]);
  const [viewingPromptAttachment, setViewingPromptAttachment] = useState<PendingAttachment | null>(null);
  const [isDraggingPrompt, setIsDraggingPrompt] = useState(false);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const promptFileInputRef = useRef<HTMLInputElement>(null);

  // Task creation state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [dueTime, setDueTime] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | undefined>(undefined);
  const [isDefaultDate, setIsDefaultDate] = useState(false);
  const [frequency, setFrequency] = useState<FrequencyValue>({ recurrenceType: 'none', recurrenceConfig: null });
  const [reminders, setReminders] = useState<TaskReminderDraft[]>([]);

  // Popover states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showFrequencyPicker, setShowFrequencyPicker] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const dateChipRef = useRef<HTMLDivElement>(null);
  const categoryChipRef = useRef<HTMLDivElement>(null);
  const priorityChipRef = useRef<HTMLDivElement>(null);
  const frequencyChipRef = useRef<HTMLDivElement>(null);
  const reminderChipRef = useRef<HTMLDivElement>(null);

  const handleSwitchToTask = useCallback(() => {
    if (trialExpired) return;
    setMode('task');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setDueDate(today);
    setIsDefaultDate(true);
    if (defaultCategory) setCategory(defaultCategory);
    // Carry over whatever the user already typed in the prompt bar as the task title
    const carriedTitle = promptText.trim();
    if (carriedTitle) {
      setTitle(carriedTitle);
      setPromptText('');
    }
  }, [defaultCategory, promptText]);

  const handleSwitchToPrompt = useCallback(() => {
    setMode('prompt');
    setTitle('');
    setDescription('');
    setDueDate(null);
    setDueTime('');
    setCategory('');
    setPriority(undefined);
    setIsDefaultDate(false);
    setFrequency({ recurrenceType: 'none', recurrenceConfig: null });
    setReminders([]);
    setShowDatePicker(false);
    setShowCategoryPicker(false);
    setShowPriorityPicker(false);
    setShowFrequencyPicker(false);
    setShowReminderPicker(false);
  }, []);

  // Focus title input when entering task mode, placing the cursor at the end
  // so a carried-over prompt title is ready to keep typing from.
  useEffect(() => {
    if (mode === 'task') {
      const id = setTimeout(() => {
        const el = titleInputRef.current;
        if (!el) return;
        el.focus();
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }, 200);
      return () => clearTimeout(id);
    }
  }, [mode]);

  // Sync defaultCategory into category state whenever it changes while in task mode
  useEffect(() => {
    if (mode === 'task') {
      setCategory(defaultCategory || '');
    }
  }, [defaultCategory]);

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

  // Auto-resize prompt textarea: grow with content up to 10 lines, then scroll
  const MAX_PROMPT_LINES = 10;
  useEffect(() => {
    const el = promptInputRef.current;
    if (!el) return;

    el.style.height = 'auto';

    const cs = getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 22;
    const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const maxHeight = lineHeight * MAX_PROMPT_LINES + paddingY;

    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [promptText, mode]);

  // ── Prompt handlers ──────────────────────────────────────────────────────────

  const addPromptFiles = useCallback(async (files: File[]) => {
    if (!files.length || trialExpired) return;
    const prepared = await filesToPendingAttachments(files);
    if (!prepared.length) return;
    setPromptAttachments((prev) => [...prev, ...prepared].slice(0, MAX_CHAT_ATTACHMENTS));
  }, [trialExpired]);

  const handleRemovePromptAttachment = useCallback((id: string) => {
    setPromptAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handlePromptFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void addPromptFiles(Array.from(e.target.files ?? []));
      e.target.value = '';
    },
    [addPromptFiles],
  );

  const handlePromptPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.clipboardData.files);
      if (!files.length) return;
      e.preventDefault();
      void addPromptFiles(files);
    },
    [addPromptFiles],
  );

  const handlePromptDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (trialExpired) return;
    e.preventDefault();
    setIsDraggingPrompt(true);
  }, [trialExpired]);

  const handlePromptDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Ignore leaves that just move onto a child element of the drop zone.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDraggingPrompt(false);
  }, []);

  const handlePromptDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingPrompt(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) void addPromptFiles(files);
    },
    [addPromptFiles],
  );

  const handlePromptSubmit = () => {
    if (trialExpired) return;
    const text = promptText.trim();
    const payload = toChatAttachmentPayload(promptAttachments);
    if (onSubmitPrompt && (text || payload.length > 0)) {
      onSubmitPrompt(text, payload);
    } else if (onOpenChat) {
      onOpenChat();
    }
    setPromptText('');
    setPromptAttachments([]);
    onMobileClose?.();
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
    }

    const taskData: TaskCreationData = {
      title: title.trim(),
      description: description.trim(),
      dueDate: formattedDueDate,
      time: dueTime || undefined,
      category: category || undefined,
      priority,
      recurrence_type: frequency.recurrenceType,
      recurrence_config: frequency.recurrenceConfig ? JSON.stringify(frequency.recurrenceConfig) : undefined,
      recurrence_until: frequency.recurrenceConfig?.until.type === 'onDate' ? frequency.recurrenceConfig.until.date : undefined,
      reminders: reminders.length > 0 ? reminders : undefined,
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
    onMobileClose?.();
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

  const handleFrequencyChange = (next: FrequencyValue) => {
    setFrequency(next);
    // Recurrence needs a starting due date to anchor to — default to today
    // when the user configures a frequency before picking a date.
    if (next.recurrenceType !== 'none' && !dueDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setDueDate(today);
      setIsDefaultDate(true);
    }
  };

  const handleFrequencyClear = () => {
    setFrequency({ recurrenceType: 'none', recurrenceConfig: null });
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
      {onMobileClose && (
        <button
          type="button"
          className={styles.mobileCloseButton}
          onClick={onMobileClose}
          aria-label="Fechar"
        >
          <CaretDown weight="bold" size={16} />
        </button>
      )}
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
                    iconOnly
                    active={!!priority || showPriorityPicker}
                    onClick={() => setShowPriorityPicker(true)}
                    onClear={priority ? () => setPriority(undefined) : undefined}
                  />
                </div>

                <div ref={frequencyChipRef} style={{ display: 'inline-flex' }}>
                  <Chip
                    label={formatFrequencyChip(frequency.recurrenceType, frequency.recurrenceConfig) || 'Recorrência'}
                    icon={<Repeat size={16} />}
                    size="medium"
                    interactive
                    iconOnly
                    active={frequency.recurrenceType !== 'none' || showFrequencyPicker}
                    onClick={() => setShowFrequencyPicker(true)}
                    onClear={frequency.recurrenceType !== 'none' ? handleFrequencyClear : undefined}
                  />
                </div>

                <div ref={reminderChipRef} style={{ display: 'inline-flex' }}>
                  <Chip
                    label={formatRemindersChipLabel(reminders)}
                    icon={<Bell weight="regular" />}
                    size="medium"
                    interactive
                    iconOnly
                    active={reminders.length > 0 || showReminderPicker}
                    onClick={() => setShowReminderPicker(true)}
                    onClear={reminders.length > 0 ? () => setReminders([]) : undefined}
                  />
                </div>
              </div>

              <div className={styles.taskActions}>
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
            className={styles.promptMode}
            onDragOver={handlePromptDragOver}
            onDragLeave={handlePromptDragLeave}
            onDrop={handlePromptDrop}
          >
            {isDraggingPrompt && (
              <div className={styles.dropOverlay}>
                <UploadSimple size={20} weight="bold" />
                <span>Solte para anexar</span>
              </div>
            )}
            {promptAttachments.length > 0 && (
              <div className={styles.attachmentBar}>
                {promptAttachments.map((a) => (
                  <div key={a.id} className={styles.attachmentChip} title={a.name}>
                    <button
                      type="button"
                      className={styles.attachmentChipPreview}
                      onClick={() => setViewingPromptAttachment(a)}
                      aria-label={`Visualizar ${a.name}`}
                    >
                      <FileText size={14} weight="fill" className={styles.attachmentChipIcon} />
                      <span className={styles.attachmentChipName}>{a.name}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.attachmentRemove}
                      onClick={() => handleRemovePromptAttachment(a.id)}
                      aria-label={`Remover ${a.name}`}
                    >
                      <X size={12} weight="bold" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.promptRow}>
              <input
                ref={promptFileInputRef}
                type="file"
                multiple
                className={styles.hiddenFileInput}
                onChange={handlePromptFileInputChange}
              />

              <textarea
                ref={promptInputRef}
                rows={1}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onKeyDown={handlePromptKeyDown}
                onPaste={handlePromptPaste}
                placeholder="Como posso te ajudar?"
                className={styles.promptInput}
                disabled={trialExpired}
              />

              <div className={styles.promptActionsLeft}>
                <button
                  type="button"
                  className={styles.attachButton}
                  onClick={() => promptFileInputRef.current?.click()}
                  aria-label="Anexar arquivo"
                  disabled={trialExpired || promptAttachments.length >= MAX_CHAT_ATTACHMENTS}
                >
                  <Paperclip size={20} />
                </button>

                {toggleGroup}
              </div>

              <button
                type="button"
                className={styles.sendButton}
                onClick={handlePromptSubmit}
                aria-label="Enviar"
                disabled={trialExpired}
              >
                <PaperPlaneTilt weight="fill" size={20} />
              </button>
            </div>
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

      <FrequencyPicker
        isOpen={showFrequencyPicker}
        onClose={() => setShowFrequencyPicker(false)}
        anchorRef={frequencyChipRef}
        value={frequency}
        onChange={handleFrequencyChange}
        baseDate={dueDate || undefined}
      />

      <ReminderPicker
        isOpen={showReminderPicker}
        onClose={() => setShowReminderPicker(false)}
        anchorRef={reminderChipRef}
        reminders={reminders}
        onChange={setReminders}
        taskDueDate={dueDate}
        taskDueTime={dueTime}
      />

      {viewingPromptAttachment && (
        <AttachmentViewer
          attachment={{
            id: viewingPromptAttachment.id,
            name: viewingPromptAttachment.name,
            mimeType: viewingPromptAttachment.mimeType,
            previewUrl: `data:${viewingPromptAttachment.mimeType};base64,${viewingPromptAttachment.data}`,
          }}
          onClose={() => setViewingPromptAttachment(null)}
          onRemove={() => handleRemovePromptAttachment(viewingPromptAttachment.id)}
        />
      )}
    </motion.div>
  );
}
