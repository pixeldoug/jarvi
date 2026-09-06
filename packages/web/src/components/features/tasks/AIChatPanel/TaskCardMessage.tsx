import { useEffect } from 'react';
import { Checks, Trash } from '@phosphor-icons/react';
import { useTasks } from '../../../../contexts/TaskContext';
import { formatFrequencyChip } from '../../../../lib/recurrence';
import { formatRemindersChipLabel, isConfiguredReminder } from '../../../../lib/reminders';
import type { ToolCallData } from '../../../../hooks/useChatStream';
import { capitalizeTaskTitle } from '../../../../lib/taskTitle';
import styles from './AIChatPanel.module.css';

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

/**
 * The artifact only carries what identifies the task in the conversation.
 * Category, priority and the rest stay in the task itself, one click away.
 */
const MAX_META_PARTS = 2;

interface TaskCardMessageProps {
  toolCall: ToolCallData;
  onTaskClick?: (taskId: string) => void;
}

export function TaskCardMessage({ toolCall, onTaskClick }: TaskCardMessageProps) {
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
  const title = capitalizeTaskTitle(
    liveTask ? liveTask.title : pickPersistedField(data, 'title', toolCall.toolArgs),
  );
  const isCompleted = liveTask
    ? liveTask.completed
    : toolCall.toolName === 'complete_task' || Boolean(data.completed);
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
  const time = normalizeTime(
    liveTask ? liveTask.time : pickPersistedField(data, 'time', toolCall.toolArgs),
  );

  if (!title && !isCompleted && !isDeleted) return null;

  // A deleted task no longer exists, so there's nothing to navigate to —
  // unlike the other artifacts, this one is never clickable.
  const isClickable = !isDeleted && Boolean(taskId && onTaskClick);

  const handleClick = () => {
    if (isClickable) onTaskClick?.(taskId);
  };

  const formattedDate = formatDueDate(dueDate);
  const dateLabel = formattedDate
    ? time
      ? `${formattedDate}, ${time}`
      : formattedDate
    : time;
  const snapshotRecurrenceType = pickPersistedField(data, 'recurrence_type', toolCall.toolArgs);
  const snapshotRecurrenceConfig = pickPersistedField(data, 'recurrence_config', toolCall.toolArgs);
  const frequencyLabel =
    formatFrequencyChip(liveTask?.recurrence_type, liveTask?.recurrence_config)
    || formatFrequencyChip(
      (snapshotRecurrenceType || undefined) as Parameters<typeof formatFrequencyChip>[0],
      snapshotRecurrenceConfig || null,
    );

  const metaParts: string[] = [];
  if (dateLabel) metaParts.push(dateLabel);
  if (configuredReminders.length > 0) {
    metaParts.push(formatRemindersChipLabel(configuredReminders));
  }
  if (frequencyLabel) metaParts.push(frequencyLabel);
  const meta = isDeleted ? '' : metaParts.slice(0, MAX_META_PARTS).join(' · ');

  return (
    <div
      className={`${styles.taskRef} ${isClickable ? styles.taskRefClickable : ''}`}
      onClick={handleClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && handleClick() : undefined}
    >
      {isDeleted ? (
        <Trash size={16} weight="regular" className={styles.taskRefIcon} aria-hidden />
      ) : (
        <Checks size={16} weight="regular" className={styles.taskRefIcon} aria-hidden />
      )}
      <span
        className={`${styles.taskRefTitle} ${isCompleted || isDeleted ? styles.taskRefTitleDone : ''}`}
      >
        {title || (isDeleted ? 'Tarefa excluída' : 'Tarefa concluída')}
      </span>
      {meta && <span className={styles.taskRefMeta}>{meta}</span>}
    </div>
  );
}
