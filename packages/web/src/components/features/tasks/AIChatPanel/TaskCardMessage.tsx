import { useEffect, type ReactNode } from 'react';
import {
  Calendar,
  Hash,
  Fire,
  Trash,
  Repeat,
  Bell,
  CaretDown,
  Star,
  CheckCircle,
} from '@phosphor-icons/react';
import { Chip } from '../../../ui';
import { TaskCheckbox } from '../TaskCheckbox';
import { useTasks } from '../../../../contexts/TaskContext';
import { formatFrequencyChip } from '../../../../lib/recurrence';
import { formatReminderLabel, isConfiguredReminder } from '../../../../lib/reminders';
import type { ToolCallData } from '../../../../hooks/useChatStream';
import styles from './AIChatPanel.module.css';

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Urgente',
  urgent: 'Urgente',
};

function normalizeTime(time?: string | null): string {
  if (!time) return '';
  const trimmed = time.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower === 'null' || lower === 'undefined') return '';
  return trimmed;
}

/** Prefer the persisted tool result; only fall back to toolArgs when the field is absent. */
function pickPersistedField(
  data: Record<string, unknown> | undefined,
  key: string,
  args: Record<string, unknown>,
): string {
  if (data && key in data) {
    const val = data[key];
    if (val == null || String(val).trim() === '') return '';
    return String(val);
  }
  const argVal = args[key];
  if (argVal == null || String(argVal).trim() === '') return '';
  return String(argVal);
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

interface ArtifactChip {
  key: string;
  label: string;
  icon: ReactNode;
}

interface DetailRow {
  key: string;
  kind: string;
  label: string;
  icon: ReactNode;
}

interface TaskCardMessageProps {
  toolCall: ToolCallData;
  onTaskClick?: (taskId: string) => void;
  onToggleCompletion?: (taskId: string) => void;
}

export function TaskCardMessage({ toolCall, onTaskClick, onToggleCompletion }: TaskCardMessageProps) {
  const { tasks, remindersByTaskId, fetchReminders } = useTasks();
  const data = toolCall.result?.data;
  const taskId = data ? String(data.id || '') : '';
  const isDeleted = toolCall.toolName === 'delete_task';

  useEffect(() => {
    if (!taskId || isDeleted) return;
    void fetchReminders(taskId);
  }, [taskId, isDeleted, fetchReminders]);

  if (!data) return null;

  const liveTask = taskId ? tasks.find((t) => t.id === taskId) : undefined;
  const reminders = taskId ? (remindersByTaskId[taskId] ?? []) : [];
  const configuredReminders = reminders.filter(isConfiguredReminder);

  // When the live task exists, use it as source of truth (including cleared fields).
  // Fall back to the tool-call snapshot only before the task is in local state.
  const title = liveTask
    ? liveTask.title
    : pickPersistedField(data, 'title', toolCall.toolArgs);
  const isCompleted = liveTask
    ? liveTask.completed
    : toolCall.toolName === 'complete_task' || Boolean(data.completed);
  const priority = liveTask?.priority
    || pickPersistedField(data, 'priority', toolCall.toolArgs);
  // Resolve due date with care:
  // - live `due_date` / legacy camelCase `dueDate` from optimistic writes
  // - empty string/null on the live task means "cleared" (don't use snapshot)
  // - `undefined` on the live task means "cache never got the field" → snapshot ok
  const snapshotDueDate = pickPersistedField(data, 'due_date', toolCall.toolArgs);
  let dueDate = snapshotDueDate;
  if (liveTask) {
    const legacyDueDate = (liveTask as { dueDate?: string }).dueDate;
    if (liveTask.due_date != null && liveTask.due_date !== '') {
      dueDate = liveTask.due_date;
    } else if (legacyDueDate) {
      dueDate = legacyDueDate;
    } else if (liveTask.due_date === null || liveTask.due_date === '') {
      dueDate = '';
    } else {
      // due_date is undefined on the cache entry — prefer snapshot if present
      dueDate = snapshotDueDate;
    }
  }
  const category = liveTask
    ? (liveTask.category || '')
    : pickPersistedField(data, 'category', toolCall.toolArgs);
  const time = normalizeTime(
    liveTask ? liveTask.time : pickPersistedField(data, 'time', toolCall.toolArgs),
  );
  const recurrenceType = liveTask?.recurrence_type;
  const recurrenceConfig = liveTask?.recurrence_config;

  if (!title && !isCompleted && !isDeleted) return null;

  // A deleted task no longer exists, so there's nothing to navigate to —
  // unlike the other cards, this one is never clickable.
  const isClickable = !isDeleted && Boolean(taskId && onTaskClick);
  const canToggle = !isDeleted && Boolean(taskId && onToggleCompletion);

  const handleClick = () => {
    if (isClickable) onTaskClick?.(taskId);
  };

  const formattedDate = formatDueDate(dueDate);
  const dateChipLabel = formattedDate
    ? time
      ? `${formattedDate}, ${time}`
      : formattedDate
    : time;
  // In the hover menu, surface every set priority — including medium.
  const priorityLabel = priority ? PRIORITY_LABELS[priority] || priority : '';
  const snapshotRecurrenceType = pickPersistedField(data, 'recurrence_type', toolCall.toolArgs);
  const snapshotRecurrenceConfig = pickPersistedField(data, 'recurrence_config', toolCall.toolArgs);
  const frequencyLabel =
    formatFrequencyChip(recurrenceType, recurrenceConfig)
    || formatFrequencyChip(
      (snapshotRecurrenceType || undefined) as Parameters<typeof formatFrequencyChip>[0],
      snapshotRecurrenceConfig || null,
    );
  const isImportant = Boolean(liveTask?.important);

  const dateChip: ArtifactChip | null = dateChipLabel
    ? {
        key: 'date',
        label: dateChipLabel,
        icon: <Calendar weight="regular" />,
      }
    : null;

  // Rich detail rows for the hover dropdown (everything beyond the date chip).
  const detailRows: DetailRow[] = [];
  if (category) {
    detailRows.push({
      key: 'category',
      kind: 'Categoria',
      label: category.startsWith('#') ? category : `# ${category}`,
      icon: <Hash weight="regular" />,
    });
  }
  if (priorityLabel) {
    detailRows.push({
      key: 'priority',
      kind: 'Prioridade',
      label: priorityLabel,
      icon: <Fire weight="regular" />,
    });
  }
  if (frequencyLabel) {
    detailRows.push({
      key: 'recurrence',
      kind: 'Recorrência',
      label: frequencyLabel,
      icon: <Repeat weight="regular" />,
    });
  }
  if (configuredReminders.length > 0) {
    configuredReminders.forEach((reminder, index) => {
      detailRows.push({
        key: `reminder-${reminder.id || index}`,
        kind: configuredReminders.length > 1 ? `Lembrete ${index + 1}` : 'Lembrete',
        label: formatReminderLabel(reminder),
        icon: <Bell weight="regular" />,
      });
    });
  }
  if (isImportant) {
    detailRows.push({
      key: 'important',
      kind: 'Destaque',
      label: 'Importante',
      icon: <Star weight="fill" />,
    });
  }
  if (isCompleted) {
    detailRows.push({
      key: 'status',
      kind: 'Status',
      label: 'Concluída',
      icon: <CheckCircle weight="fill" />,
    });
  }

  const hasMeta = Boolean(dateChip || detailRows.length > 0);

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
          <TaskCheckbox
            checked={isCompleted}
            onChange={() => {
              if (canToggle) onToggleCompletion?.(taskId);
            }}
            ariaLabel={isCompleted ? 'Marcar como não concluída' : 'Marcar como concluída'}
          />
        )}
        <span
          className={`${styles.taskCardTitle} ${isCompleted || isDeleted ? styles.taskCardTitleDone : ''}`}
        >
          {title || (isDeleted ? 'Tarefa excluída' : 'Tarefa concluída')}
        </span>
      </div>

      {!isDeleted && hasMeta && (
        <div
          className={styles.taskCardMeta}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {dateChip && (
            <Chip
              label={dateChip.label}
              icon={dateChip.icon}
              size="medium"
              active
            />
          )}

          {detailRows.length > 0 && (
            <div className={styles.taskCardExtra}>
              <button
                type="button"
                className={styles.taskCardExtraTrigger}
                aria-label={`Mais ${detailRows.length} detalhes`}
                aria-haspopup="true"
              >
                <span>+{detailRows.length}</span>
                <CaretDown size={12} weight="bold" />
              </button>
              <div className={styles.taskCardDropdown} role="menu">
                {detailRows.map((row) => (
                  <div key={row.key} className={styles.taskCardDropdownRow} role="menuitem">
                    <span className={styles.taskCardDropdownIcon} aria-hidden>
                      {row.icon}
                    </span>
                    <span className={styles.taskCardDropdownText}>
                      <span className={styles.taskCardDropdownKind}>{row.kind}</span>
                      <span className={styles.taskCardDropdownLabel}>{row.label}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
