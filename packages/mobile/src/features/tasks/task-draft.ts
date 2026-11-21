/**
 * Editable copy of a task and its mapping to the create/update payloads.
 * Updates only carry the fields that changed, because omitted fields keep
 * their server value (see UpdateTaskInput).
 */
import { parseDescription, serializeDescription } from '@/lib/description';
import { dateKeyOf, normalizeTime, parseDateKey, toDateKey } from '@/lib/dates';
import { buildDefaultRecurrenceConfig, parseRecurrenceConfig } from '@/lib/recurrence';
import { isSameReminder, type ConfiguredReminder } from '@/lib/reminders';
import type { RecurrenceConfig, RecurrenceType } from '@/types/recurrence';
import type { CreateTaskInput, Task, TaskPriority, UpdateTaskInput } from '@/types/models';

export interface TaskDraft {
  title: string;
  description: string;
  /** False when the stored description has formatting or attachments from the web. */
  descriptionEditable: boolean;
  dueDate: string | null;
  time: string | null;
  category: string | null;
  priority: TaskPriority | null;
  recurrenceType: RecurrenceType;
  recurrenceConfig: RecurrenceConfig | null;
  reminders: ConfiguredReminder[];
}

export function emptyDraft(defaults: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: '',
    description: '',
    descriptionEditable: true,
    dueDate: null,
    time: null,
    category: null,
    priority: null,
    recurrenceType: 'none',
    recurrenceConfig: null,
    reminders: [],
    ...defaults,
  };
}

export function draftFromTask(task: Task, reminders: ConfiguredReminder[] = []): TaskDraft {
  const description = parseDescription(task.description);
  const dueDate = dateKeyOf(task.due_date);
  return {
    title: task.title,
    description: description.text,
    descriptionEditable: description.editable,
    dueDate,
    // Some rows carry a time without a date; the app never edits that time.
    time: dueDate ? normalizeTime(task.time) : null,
    category: task.category || null,
    priority: task.priority ?? null,
    recurrenceType: task.recurrence_type ?? 'none',
    recurrenceConfig: parseRecurrenceConfig(task.recurrence_config),
    reminders,
  };
}

/** Switching the repeat option; a recurrence needs a date to anchor on. */
export function withRecurrence(draft: TaskDraft, type: RecurrenceType, today: Date = new Date()): TaskDraft {
  if (type === 'none') return { ...draft, recurrenceType: 'none', recurrenceConfig: null };
  const dueDate = draft.dueDate ?? toDateKey(today);
  return {
    ...draft,
    dueDate,
    recurrenceType: type,
    recurrenceConfig: buildDefaultRecurrenceConfig(type, parseDateKey(dueDate) ?? today, draft.recurrenceConfig?.until),
  };
}

/**
 * Applies an edit. Relative reminders ("1 dia antes") count from the due date
 * and time (00:00 when untimed), so they are dropped only when this edit
 * removes the date or the time they were set against — never on other edits.
 */
export function applyDraftPatch(draft: TaskDraft, patch: Partial<TaskDraft>): TaskDraft {
  const next = { ...draft, ...patch };
  const clearedTime = 'time' in patch && !patch.time && !!draft.time;
  const clearedDate = 'dueDate' in patch && !patch.dueDate && !!draft.dueDate;
  if (!clearedTime && !clearedDate) return next;
  return { ...next, reminders: next.reminders.filter((reminder) => reminder.type !== 'relative') };
}

function recurrenceFields(draft: TaskDraft) {
  if (draft.recurrenceType === 'none' || !draft.recurrenceConfig) {
    return { recurrence_type: 'none' as const, recurrence_config: null, recurrence_until: null };
  }
  const until = draft.recurrenceConfig.until;
  return {
    recurrence_type: draft.recurrenceType,
    recurrence_config: JSON.stringify(draft.recurrenceConfig),
    recurrence_until: until?.type === 'onDate' && until.date ? until.date : null,
  };
}

export function createInput(draft: TaskDraft): CreateTaskInput {
  const recurrence = recurrenceFields(draft);
  return {
    title: draft.title.trim(),
    ...(draft.description.trim() ? { description: serializeDescription(draft.description) } : {}),
    ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
    ...(draft.dueDate && draft.time ? { time: draft.time } : {}),
    ...(draft.category ? { category: draft.category } : {}),
    ...(draft.priority ? { priority: draft.priority } : {}),
    ...(recurrence.recurrence_type !== 'none'
      ? {
          recurrence_type: recurrence.recurrence_type,
          recurrence_config: recurrence.recurrence_config ?? undefined,
          recurrence_until: recurrence.recurrence_until,
        }
      : {}),
    ...(draft.reminders.length > 0 ? { reminders: draft.reminders } : {}),
  };
}

export function updateInput(original: TaskDraft, draft: TaskDraft): UpdateTaskInput {
  const input: UpdateTaskInput = {};
  if (draft.title.trim() !== original.title.trim()) input.title = draft.title.trim();
  if (draft.descriptionEditable && draft.description.trim() !== original.description.trim()) {
    input.description = serializeDescription(draft.description);
  }
  if (draft.dueDate !== original.dueDate) input.dueDate = draft.dueDate ?? '';
  const time = draft.dueDate ? draft.time : null;
  if (time !== original.time) input.time = time ?? '';
  if (draft.category !== original.category) input.category = draft.category;
  if (draft.priority !== original.priority) input.priority = draft.priority;

  const before = recurrenceFields(original);
  const after = recurrenceFields(draft);
  if (before.recurrence_type !== after.recurrence_type || before.recurrence_config !== after.recurrence_config) {
    Object.assign(input, after);
  }
  return input;
}

export function remindersChanged(original: ConfiguredReminder[], next: ConfiguredReminder[]): boolean {
  if (original.length !== next.length) return true;
  return next.some((reminder) => !original.some((existing) => isSameReminder(existing, reminder)));
}
