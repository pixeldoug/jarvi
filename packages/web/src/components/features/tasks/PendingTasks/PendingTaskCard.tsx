import { useState } from 'react';
import { X, Check } from '@phosphor-icons/react';
import { PendingTask } from '../../../../hooks/usePendingTasks';
import styles from './PendingTaskCard.module.css';
import whatsappIcon from '../../../../assets/icons/whatsapp.svg';
import gmailIcon from '../../../../assets/icons/gmail.svg';

interface PendingTaskCardProps {
  task: PendingTask;
  onConfirm: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onUpdate?: (id: string, updates: Record<string, unknown>) => Promise<void>;
  onClick?: (task: PendingTask) => void;
  isActive?: boolean;
}

const formatDateShort = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
    .replace('.', '')
    .replace(' de ', ' ');
};

const getAppSource = (source: string): { name: string; icon: string } | null => {
  if (source === 'gmail') return { name: 'Gmail', icon: gmailIcon };
  if (source === 'whatsapp') return { name: 'WhatsApp', icon: whatsappIcon };
  return null;
};

export const PendingTaskCard: React.FC<PendingTaskCardProps> = ({
  task,
  onConfirm,
  onReject,
  onClick,
  isActive = false,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dateLabel = formatDateShort(task.suggested_due_date);
  const appSource = getAppSource(task.source);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(task.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      await onReject(task.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <article
      className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
      onClick={() => onClick?.(task)}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      {/* Task content row */}
      <div className={styles.row}>
        {/* Left: checkbox + date chip + title */}
        <div className={styles.left}>
          <div className={styles.checkbox} aria-hidden="true" />
          {dateLabel && <span className={styles.dateChip}>{dateLabel}</span>}
          <span className={styles.title} title={task.suggested_title}>
            {task.suggested_title}
          </span>
        </div>

        {/* Right: source chip + category chip */}
        <div className={styles.right}>
          {appSource && (
            <span className={styles.sourceChip}>
              <img src={appSource.icon} alt={appSource.name} className={styles.sourceIcon} />
              <span>{appSource.name}</span>
            </span>
          )}

          {task.suggested_category && (
            <span className={styles.categoryChip}>{task.suggested_category}</span>
          )}
        </div>
      </div>

      {/* Action buttons — stopPropagation so card onClick isn't triggered */}
      <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.actionBtn}
          onClick={handleReject}
          disabled={isSubmitting}
          aria-label="Rejeitar tarefa"
          title="Rejeitar"
          type="button"
        >
          <X size={20} weight="regular" />
        </button>

        <button
          className={`${styles.actionBtn} ${styles.actionBtnConfirm}`}
          onClick={handleConfirm}
          disabled={isSubmitting}
          aria-label="Confirmar tarefa"
          title="Confirmar"
          type="button"
        >
          <Check size={20} weight="regular" />
        </button>
      </div>
    </article>
  );
};
