import { useEffect, useState } from 'react';
import { X, Check, CalendarBlank, Tag, Flame, Clock } from '@phosphor-icons/react';
import { PendingTask } from '../../../../hooks/usePendingTasks';
import { Chip } from '../../../ui';
import styles from './PendingTaskDetailsSidebar.module.css';
import whatsappIcon from '../../../../assets/icons/whatsapp.svg';
import gmailIcon from '../../../../assets/icons/gmail.svg';

interface PendingTaskDetailsSidebarProps {
  task: PendingTask | null;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

const PRIORITY_COLOR: Record<string, string> = {
  low: 'var(--color-system-blue-500, #3B82F6)',
  medium: 'var(--color-system-yellow-500, #F59E0B)',
  high: 'var(--color-system-orange-500, #F97316)',
  urgent: 'var(--color-system-red-500, #EF4444)',
};

const formatDate = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
    .replace('.', '');
};

const getAppSource = (source: string) => {
  if (source === 'gmail') return { name: 'Gmail', icon: gmailIcon };
  if (source === 'whatsapp') return { name: 'WhatsApp', icon: whatsappIcon };
  return null;
};

export function PendingTaskDetailsSidebar({
  task,
  onClose,
  onConfirm,
  onReject,
}: PendingTaskDetailsSidebarProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!task) return null;

  const dateLabel = formatDate(task.suggested_due_date);
  const appSource = getAppSource(task.source);
  const rawContent = task.raw_content || task.original_whatsapp_content;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(task.id);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      await onReject(task.id);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.sidebar}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleContainer}>
          {appSource && (
            <span className={styles.sourceChip}>
              <img src={appSource.icon} alt={appSource.name} className={styles.sourceIcon} />
              {appSource.name}
            </span>
          )}
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar" type="button">
          <X size={20} weight="regular" />
        </button>
      </div>

      {/* Title */}
      <h2 className={styles.title}>{task.suggested_title}</h2>

      {/* Metadata chips — using design system Chip (small, outline) */}
      <div className={styles.meta}>
        {dateLabel && (
          <Chip
            size="small"
            label={dateLabel}
            icon={<CalendarBlank size={14} weight="regular" />}
          />
        )}
        {task.suggested_time && (
          <Chip
            size="small"
            label={task.suggested_time}
            icon={<Clock size={14} weight="regular" />}
          />
        )}
        {task.suggested_priority && (
          <Chip
            size="small"
            label={PRIORITY_LABEL[task.suggested_priority] ?? task.suggested_priority}
            icon={
              <Flame
                size={14}
                weight="fill"
                color={PRIORITY_COLOR[task.suggested_priority]}
              />
            }
          />
        )}
        {task.suggested_category && (
          <Chip
            size="small"
            label={task.suggested_category}
            icon={<Tag size={14} weight="regular" />}
          />
        )}
      </div>

      {/* Description */}
      {task.suggested_description && (
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Descrição</p>
          <p className={styles.sectionText}>{task.suggested_description}</p>
        </div>
      )}

      {/* Raw content (original email / message) */}
      {rawContent && (
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Conteúdo original</p>
          <pre className={styles.rawContent}>{rawContent}</pre>
        </div>
      )}

      {/* Footer actions */}
      <div className={styles.footer}>
        <button
          className={styles.rejectBtn}
          onClick={handleReject}
          disabled={isSubmitting}
          type="button"
        >
          <X size={16} weight="regular" />
          Rejeitar
        </button>
        <button
          className={styles.confirmBtn}
          onClick={handleConfirm}
          disabled={isSubmitting}
          type="button"
        >
          <Check size={16} weight="regular" />
          Confirmar tarefa
        </button>
      </div>
    </div>
  );
}
