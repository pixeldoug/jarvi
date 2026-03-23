import { CheckCircle, Calendar, Hash, Fire } from '@phosphor-icons/react';
import { Chip } from '../../../ui';
import type { ToolCallData } from '../../../../hooks/useChatStream';
import styles from './AIChatPanel.module.css';

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Urgente',
};

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

  const taskId = String(data.id || '');
  const title = String(data.title || toolCall.toolArgs.title || '');
  const isCompleted = toolCall.toolName === 'complete_task' || Boolean(data.completed);
  const priority = String(data.priority || toolCall.toolArgs.priority || '');
  const dueDate = String(data.due_date || toolCall.toolArgs.due_date || '');
  const category = String(data.category || toolCall.toolArgs.category || '');

  if (!title && !isCompleted) return null;

  const handleClick = () => {
    if (taskId && onTaskClick) onTaskClick(taskId);
  };

  const formattedDate = formatDueDate(dueDate);
  const priorityLabel = PRIORITY_LABELS[priority] || priority;

  return (
    <div
      className={`${styles.taskCard} ${taskId && onTaskClick ? styles.taskCardClickable : ''}`}
      onClick={handleClick}
      role={taskId && onTaskClick ? 'button' : undefined}
      tabIndex={taskId && onTaskClick ? 0 : undefined}
      onKeyDown={taskId && onTaskClick ? (e) => e.key === 'Enter' && handleClick() : undefined}
    >
      <div className={styles.taskCardHeader}>
        <CheckCircle
          size={20}
          weight={isCompleted ? 'fill' : 'regular'}
          className={isCompleted ? styles.taskCardCheckDone : styles.taskCardCheck}
        />
        <span className={`${styles.taskCardTitle} ${isCompleted ? styles.taskCardTitleDone : ''}`}>
          {title || 'Tarefa concluída'}
        </span>
      </div>

      {(formattedDate || category || priorityLabel) && (
        <div className={styles.taskCardChips}>
          {formattedDate && (
            <Chip
              label={formattedDate}
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
