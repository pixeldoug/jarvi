/**
 * What the Apple Watch list shows, one chip each: today's tasks (open and
 * completed), the next open ones, overdue open tasks, and the open tasks
 * spoken on the watch, with only the fields the watch reads. The same rules
 * as targets/watch/TodayTasks.swift, so the server never drops a task the
 * watch would show; sending only these instead of every task the user ever
 * had is what makes the list fast over the watch's slow link.
 */

export const WATCH_TASK_COLUMNS = 'id, title, completed, time, due_date, created_at, source';

/** `tasks.source` of a task spoken on the watch (POST /api/tasks/voice). */
export const WATCH_SOURCE = 'watch';

export interface WatchTaskRow {
  id: string;
  title: string;
  completed: boolean | number;
  time: string | null;
  due_date: string | Date | null;
  created_at: string | Date | null;
  source?: string | null;
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

/** How many upcoming tasks the watch gets: the soonest ones. */
export const WATCH_UPCOMING_LIMIT = 50;

/** How many open tasks spoken on the watch it gets: the newest ones. */
export const WATCH_SPOKEN_LIMIT = 50;

/** Overdue and still open, or due today (open or done). */
export const isWatchTask = (row: Pick<WatchTaskRow, 'completed' | 'due_date'>, today: string): boolean => {
  const key = dueDateKey(row.due_date);
  if (!key) return false;
  if (key === today) return true;
  return key < today && !isCompleted(row.completed);
};

/** Open and due after today ("Próximas", like the iPhone's later sections). */
export const isUpcomingWatchTask = (
  row: Pick<WatchTaskRow, 'completed' | 'due_date'>,
  today: string,
): boolean => {
  const key = dueDateKey(row.due_date);
  return !!key && key > today && !isCompleted(row.completed);
};

/** Spoken on the watch and still open ("Do relógio"). */
export const isSpokenWatchTask = (row: Pick<WatchTaskRow, 'completed' | 'source'>): boolean =>
  row.source === WATCH_SOURCE && !isCompleted(row.completed);

/**
 * The response: overdue + today, then the soonest upcoming ones (by date,
 * at most `WATCH_UPCOMING_LIMIT`), then open tasks spoken on the watch that
 * are not in the list yet (a far-off date), each task once. `current` holds
 * every task up to tomorrow (its open tomorrow ones count as upcoming);
 * `later` holds the soonest open ones after that, so today's tasks can never
 * use up the upcoming limit; `spoken` holds the newest open ones spoken on
 * the watch.
 */
export const watchTaskList = (
  current: WatchTaskRow[],
  later: WatchTaskRow[],
  today: string,
  spoken: WatchTaskRow[] = [],
): WatchTaskRow[] => {
  const result = current.filter((row) => isWatchTask(row, today));
  const seen = new Set(result.map((row) => row.id));
  const upcoming = [...current, ...later]
    .filter((row) => {
      if (seen.has(row.id) || !isUpcomingWatchTask(row, today)) return false;
      seen.add(row.id);
      return true;
    })
    .sort((a, b) => (dueDateKey(a.due_date) ?? '').localeCompare(dueDateKey(b.due_date) ?? ''))
    .slice(0, WATCH_UPCOMING_LIMIT);
  // Only what was kept: a spoken task cut from the upcoming limit still goes in.
  const kept = new Set([...result, ...upcoming].map((row) => row.id));
  const spokenRest = spoken
    .filter((row) => {
      if (kept.has(row.id) || !isSpokenWatchTask(row)) return false;
      kept.add(row.id);
      return true;
    })
    .slice(0, WATCH_SPOKEN_LIMIT);
  return [...result, ...upcoming, ...spokenRest];
};
