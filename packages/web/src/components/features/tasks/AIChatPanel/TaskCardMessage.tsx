import { CheckCircle, Calendar, Hash, Fire, Trash } from '@phosphor-icons/react';
import { Chip } from '../../../ui';
import type { ToolCallData } from '../../../../hooks/useChatStream';
import styles from './AIChatPanel.module.css';

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Urgente',
};

function normalizeTime(time?: string): string {
  if (!time) return '';
  const trimmed = time.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower === 'null' || lower === 'undefined') return '';
  return trimmed;
}

function formatDueDate(raw: string): string {
  if (!raw) return '';
  // Parse YYYY-MM-DD safely (avoid timezone shifts from new Date(string))
  const parts = raw.split('T')[0].split('-');
  if (parts.length !== 3) return raw;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return 'Hoje';
  if (date.getTime() === tomorrow.getTime()) return 'Amanhã';

  const day = date.getDate();
  const month = date
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .replace(/^./, (s) => s.toUpperCase());
  return `${day} ${month}`;
}

interface TaskCardMessageProps {
  toolCall: ToolCallData;
  onTaskClick?: (taskId: string) => void;
}

export function TaskCardMessage({ toolCall, onTaskClick }: TaskCardMessageProps) {
  const data = toolCall.result?.data;
  if (!data) return null;

  const isDeleted = toolCall.toolName === 'delete_task';
  const taskId = String(data.id || '');
  const title = String(data.title || toolCall.toolArgs.title || '');
  const isCompleted = toolCall.toolName === 'complete_task' || Boolean(data.completed);
  const priority = String(data.priority || toolCall.toolArgs.priority || '');
  const dueDate = String(data.due_date || toolCall.toolArgs.due_date || '');
  const category = String(data.category || toolCall.toolArgs.category || '');
  const time = normalizeTime(String(data.time || toolCall.toolArgs.time || ''));

  if (!title && !isCompleted && !isDeleted) return null;

  // A deleted task no longer exists, so there's nothing to navigate to —
  // unlike the other cards, this one is never clickable.
  const isClickable = !isDeleted && Boolean(taskId && onTaskClick);

  const handleClick = () => {
    if (isClickable) onTaskClick?.(taskId);
  };

  const formattedDate = formatDueDate(dueDate);
  // Match the tasklist / details formatting: "9 Jun, 10:35" / "Amanhã, 10:35".
  // Fall back to showing just the time when a time is set without a date.
  const dateChipLabel = formattedDate
    ? time
      ? `${formattedDate}, ${time}`
      : formattedDate
    : time;
  const priorityLabel = PRIORITY_LABELS[priority] || priority;

  return (
    <div
      className={`${styles.taskCard} ${isClickable ? styles.taskCardClickable : ''}`}
      onClick={handleClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && handleClick() : undefined}
    >
      <div className={styles.taskCardHeader}>
        {isDeleted ? (
          <Trash size={20} weight="regular" className={styles.taskCardCheckDone} />
        ) : (
          <CheckCircle
            size={20}
            weight={isCompleted ? 'fill' : 'regular'}
            className={isCompleted ? styles.taskCardCheckDone : styles.taskCardCheck}
          />
        )}
        <span
          className={`${styles.taskCardTitle} ${isCompleted || isDeleted ? styles.taskCardTitleDone : ''}`}
        >
          {title || (isDeleted ? 'Tarefa excluída' : 'Tarefa concluída')}
        </span>
      </div>

      {/* A deleted task's date/category/priority are no longer relevant — the
          card only needs to confirm WHICH task was removed. */}
      {!isDeleted && (dateChipLabel || category || priorityLabel) && (
        <div className={styles.taskCardChips}>
          {dateChipLabel && (
            <Chip
              label={dateChipLabel}
              icon={<Calendar weight="regular" />}
              size="medium"
              active
            />
          )}
          {category && (
            <Chip
              label={category}
              icon={<Hash weight="regular" />}
              size="medium"
              active
            />
          )}
          {priorityLabel && (
            <Chip
              label={priorityLabel}
              icon={<Fire weight="regular" />}
              size="medium"
              active
            />
          )}
        </div>
      )}
    </div>
  );
}
