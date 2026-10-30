/**
 * Recap de tarefas vencidas: which tasks it shows, in what order, and the
 * once-a-day guard for opening it on its own.
 *
 * Overdue = not completed, with a date before today (the time is ignored),
 * the rule of the Tasks page's Vencidas section. The overdue occurrences of a
 * recurring series are one item: the recurrence sweep keeps adding
 * occurrences to a series nobody completes, so a daily task left alone for a
 * few weeks has dozens of them.
 */

import type { Task } from '../contexts/TaskContext';

export interface OverdueRecapItem {
  /** Stable key: `task:<id>`, or `series:<root id>` for a recurring task */
  key: string;
  /** The most recent overdue occurrence: what the card shows */
  task: Task;
  /** Every overdue occurrence of the item, most recent first (only `task.id` for a one-off task) */
  taskIds: string[];
  /** Date (YYYY-MM-DD) of the oldest overdue occurrence */
  oldestDueDate: string;
  isRecurring: boolean;
}

/** YYYY-MM-DD in the browser's timezone */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return toLocalDateKey(new Date(year, month - 1, day + days));
}

export function taskDateKey(task: Pick<Task, 'due_date'>): string | null {
  return task.due_date ? task.due_date.split('T')[0] : null;
}

export function isTaskOverdue(task: Task, todayKey: string): boolean {
  const dueKey = taskDateKey(task);
  return !task.completed && dueKey !== null && dueKey < todayKey;
}

export function isRecurringTask(task: Pick<Task, 'recurrence_type'>): boolean {
  return !!task.recurrence_type && task.recurrence_type !== 'none';
}

/** The Recap item a task belongs to: its series for a recurring task, itself otherwise */
export function overdueRecapKey(task: Task): string {
  return isRecurringTask(task) ? `series:${task.recurrence_parent_id || task.id}` : `task:${task.id}`;
}

/** The series' first open occurrence from today on (what comes after the overdue ones) */
export function findUpcomingOccurrence(tasks: Task[], seriesKey: string, todayKey: string): Task | null {
  let upcoming: Task | null = null;
  for (const task of tasks) {
    const dueKey = taskDateKey(task);
    if (task.completed || !dueKey || dueKey < todayKey || overdueRecapKey(task) !== seriesKey) continue;
    if (!upcoming || dueKey < (taskDateKey(upcoming) as string)) upcoming = task;
  }
  return upcoming;
}

const PRIORITY_RANK: Record<Task['priority'], number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Later date first; on the same day, a task with a later time first */
const byMostRecentDue = (a: Task, b: Task): number =>
  (taskDateKey(b) ?? '').localeCompare(taskDateKey(a) ?? '') || (b.time ?? '').localeCompare(a.time ?? '');

/**
 * The Recap's cards. Most recently overdue first (yesterday's tasks are the
 * likeliest to still matter); on the same day, important and higher priority
 * first.
 */
export function buildOverdueRecapItems(tasks: Task[], todayKey: string): OverdueRecapItem[] {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!isTaskOverdue(task, todayKey)) continue;
    const key = overdueRecapKey(task);
    const group = groups.get(key);
    if (group) group.push(task);
    else groups.set(key, [task]);
  }

  const items: OverdueRecapItem[] = [...groups].map(([key, group]) => {
    const occurrences = [...group].sort(byMostRecentDue);
    const latest = occurrences[0];
    return {
      key,
      task: latest,
      taskIds: occurrences.map((task) => task.id),
      oldestDueDate: taskDateKey(occurrences[occurrences.length - 1]) as string,
      isRecurring: isRecurringTask(latest),
    };
  });

  return items.sort((a, b) => {
    const byDate = byMostRecentDue(a.task, b.task);
    if (byDate !== 0) return byDate;
    if (!!a.task.important !== !!b.task.important) return a.task.important ? -1 : 1;
    return (PRIORITY_RANK[a.task.priority] ?? 3) - (PRIORITY_RANK[b.task.priority] ?? 3);
  });
}

function daysBetween(fromKey: string, toKey: string): number {
  const toUtc = (key: string) => {
    const [year, month, day] = key.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(toKey) - toUtc(fromKey)) / 86_400_000);
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** "Venceu ontem", "Venceu há 3 dias", "Venceu há 2 semanas", … */
export function describeOverdue(dueKey: string, todayKey: string): string {
  const days = daysBetween(dueKey, todayKey);
  if (days <= 1) return 'Venceu ontem';
  if (days < 7) return `Venceu há ${days} dias`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `Venceu há ${weeks} ${plural(weeks, 'semana', 'semanas')}`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `Venceu há ${months} ${plural(months, 'mês', 'meses')}`;
  }
  const years = Math.floor(days / 365);
  return `Venceu há ${years} ${plural(years, 'ano', 'anos')}`;
}

// ── Once a day ───────────────────────────────────────────────────────────────

const SHOWN_ON_KEY_PREFIX = 'jarvi_overdue_recap_shown_on:';

/** Day (YYYY-MM-DD) the Recap last opened on its own for this user on this device */
export function readRecapShownOn(userId: string): string | null {
  try {
    return localStorage.getItem(SHOWN_ON_KEY_PREFIX + userId);
  } catch {
    return null;
  }
}

export function markRecapShownOn(userId: string, dateKey: string): void {
  try {
    localStorage.setItem(SHOWN_ON_KEY_PREFIX + userId, dateKey);
  } catch {
    // Storage unavailable: the in-memory guard still keeps it to once per page load.
  }
}

/** Dev only: `?overdueRecap=1` opens the Recap on load even if it already opened today. */
export function isOverdueRecapPreviewRequested(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('overdueRecap') === '1';
}
