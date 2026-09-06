import { useLayoutEffect, useRef, useState } from 'react';
import { Calendar, Trash } from '@phosphor-icons/react';
import { Card, Chip } from '../../components/ui';
import { TaskCheckbox, TaskDatePicker } from '../../components/features/tasks';
import { formatTaskDate, parseDateString } from '../../lib/utils';
import styles from './OnboardingTaskComposer.module.css';

export interface OnboardingDraftTask {
  id: string;
  title: string;
  dueDate: string | null;
  time: string | null;
}

interface OnboardingTaskComposerProps {
  tasks: OnboardingDraftTask[];
  onChange: (tasks: OnboardingDraftTask[]) => void;
  /** Full task row (checkbox + date) or a simple idea input */
  mode?: 'task' | 'idea';
}

function toDateKey(date: Date | null): string | null {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createDraftTask(
  title = '',
  dueDate: string | null = null,
  time: string | null = null,
): OnboardingDraftTask {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    dueDate,
    time,
  };
}

export function serializeDraftTasks(tasks: OnboardingDraftTask[]): string {
  return tasks
    .map((task) => {
      const title = task.title.trim();
      if (!title) return '';
      const dateLabel = formatTaskDate(task.dueDate ?? undefined, task.time ?? undefined);
      return dateLabel ? `${title} (${dateLabel})` : title;
    })
    .filter(Boolean)
    .join('\n');
}

export function parseDraftTasks(text: string): OnboardingDraftTask[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((title) => createDraftTask(title));
}

function TaskRow({
  title,
  dueDate,
  time,
  placeholder,
  autoFocus,
  onTitleChange,
  onDateChange,
  onTimeChange,
  onCommit,
  onRemove,
  simple,
}: {
  title: string;
  dueDate: string | null;
  time: string | null;
  placeholder: string;
  autoFocus?: boolean;
  onTitleChange: (title: string) => void;
  onDateChange: (dueDate: string | null) => void;
  onTimeChange: (time: string | null) => void;
  onCommit: () => void;
  onRemove?: () => void;
  simple?: boolean;
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const dateChipRef = useRef<HTMLDivElement>(null);
  const dateLabel = formatTaskDate(dueDate ?? undefined, time ?? undefined);

  return (
    <div className={styles.row} data-skip-form-enter="true">
      <div className={styles.content}>
        {!simple && (
          <TaskCheckbox checked={false} onChange={() => undefined} ariaLabel={`${title || 'Nova tarefa'} (rascunho)`} />
        )}
        <div className={styles.titleGroup}>
          {!simple && (
            <>
              <div ref={dateChipRef} className={styles.chipWrap}>
                <Chip
                  label={dateLabel ?? 'Data'}
                  icon={<Calendar size={16} weight="regular" />}
                  interactive
                  active={showDatePicker || Boolean(dueDate)}
                  onClick={() => setShowDatePicker((open) => !open)}
                  size="small"
                />
              </div>
              <TaskDatePicker
                isOpen={showDatePicker}
                onClose={() => setShowDatePicker(false)}
                layout="horizontal"
                selectedDate={parseDateString(dueDate ?? undefined) ?? undefined}
                selectedTime={time || undefined}
                onDateSelect={(date) => onDateChange(toDateKey(date))}
                onTimeSelect={(nextTime) => onTimeChange(nextTime || null)}
                anchorRef={dateChipRef}
              />
            </>
          )}
          <input
            className={styles.titleInput}
            value={title}
            autoFocus={autoFocus}
            placeholder={placeholder}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              e.stopPropagation();
              onCommit();
            }}
          />
        </div>
      </div>
      {onRemove && (
        <button type="button" className={styles.removeButton} onClick={onRemove} aria-label="Remover tarefa">
          <Trash size={16} />
        </button>
      )}
    </div>
  );
}

export function OnboardingTaskComposer({ tasks, onChange, mode = 'task' }: OnboardingTaskComposerProps) {
  const simple = mode === 'idea';
  const placeholder = 'Digite o que vier à mente...';
  const [composerTitle, setComposerTitle] = useState('');
  const [composerDueDate, setComposerDueDate] = useState<string | null>(null);
  const [composerTime, setComposerTime] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [tasks.length]);

  const commitComposer = () => {
    const title = composerTitle.trim();
    if (!title) return;
    onChange([...tasks, createDraftTask(title, composerDueDate, composerTime)]);
    setComposerTitle('');
    setComposerDueDate(null);
    setComposerTime(null);
  };

  const updateTask = (id: string, patch: Partial<OnboardingDraftTask>) => {
    onChange(tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  };

  return (
    <Card className={styles.card} padding="sm" shadow="none" rounded="none" border={false}>
      <div ref={listRef} className={styles.list}>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            title={task.title}
            dueDate={task.dueDate}
            time={task.time}
            placeholder={placeholder}
            simple={simple}
            onTitleChange={(title) => updateTask(task.id, { title })}
            onDateChange={(dueDate) => updateTask(task.id, { dueDate, time: dueDate ? task.time : null })}
            onTimeChange={(time) => updateTask(task.id, { time })}
            onCommit={commitComposer}
            onRemove={() => onChange(tasks.filter((item) => item.id !== task.id))}
          />
        ))}
        <TaskRow
          title={composerTitle}
          dueDate={composerDueDate}
          time={composerTime}
          placeholder={placeholder}
          simple={simple}
          autoFocus
          onTitleChange={setComposerTitle}
          onDateChange={(dueDate) => {
            setComposerDueDate(dueDate);
            if (!dueDate) setComposerTime(null);
          }}
          onTimeChange={setComposerTime}
          onCommit={commitComposer}
        />
      </div>
    </Card>
  );
}
