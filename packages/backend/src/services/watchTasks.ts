/**
 * What the Apple Watch list shows: overdue open tasks and today's tasks
 * (open and completed), with only the fields the watch reads. The same rules
 * as targets/watch/TodayTasks.swift, so the server never drops a task the
 * watch would show; sending only these instead of every task the user ever
 * had is what makes the list fast over the watch's slow link.
 */

export const WATCH_TASK_COLUMNS = 'id, title, completed, time, due_date, created_at';

export interface WatchTaskRow {
  id: string;
  title: string;
  completed: boolean | number;
  time: string | null;
  due_date: string | Date | null;
  created_at: string | Date | null;
}

/** YYYY-MM-DD shifted by `days` (Gregorian, no time zone involved). */
export const shiftDateKey = (key: string, days: number): string => {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

/**
 * The due date's YYYY-MM-DD as the watch reads it from the JSON: a Date
 * (PostgreSQL TIMESTAMP) is serialized as an ISO string, and the watch keeps
 * what comes before the "T".
 */
export const dueDateKey = (value: unknown): string | null => {
  if (value == null) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const key = text.split('T')[0].split(' ')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
};

const isCompleted = (value: unknown): boolean => value === true || value === 1 || value === '1';

/** Overdue and still open, or due today (open or done). */
export const isWatchTask = (row: Pick<WatchTaskRow, 'completed' | 'due_date'>, today: string): boolean => {
  const key = dueDateKey(row.due_date);
  if (!key) return false;
  if (key === today) return true;
  return key < today && !isCompleted(row.completed);
};
