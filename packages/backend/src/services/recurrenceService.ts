/**
 * Recurrence engine.
 *
 * Owns the two triggers that advance a recurring task to its next occurrence:
 *  - Synchronous: called from taskController.toggleTaskCompletion right when a
 *    recurring task is marked completed, so the next occurrence shows up
 *    immediately instead of waiting for the sweep.
 *  - Periodic sweep (runRecurrenceSweep): started from index.ts on a node-cron
 *    schedule. Catches tasks whose due date has already passed even if the
 *    user never completed them (reminder-style recurrence), and acts as a
 *    safety net for the synchronous path.
 *
 * Each occurrence is a NEW row in `tasks` (never mutates due_date on an
 * existing row) so completion history per-occurrence is preserved.
 * `recurrence_parent_id` always points at the ROOT task of the series (not
 * the immediately preceding occurrence), which keeps "fetch the whole
 * series" a single WHERE clause instead of a recursive walk.
 * `recurrence_next_task_id` is an idempotency marker: once a row has spawned
 * its successor, it is never processed again by the sweep or the synchronous
 * trigger.
 */
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { sanitizeTimeString } from '../utils/taskTime';
import {
  RecurrenceConfig,
  RecurrenceType,
  TIME_OF_DAY_DEFAULTS,
  WEEKDAYS_DAYS_OF_WEEK,
} from '@jarvi/shared';

export interface RecurrenceTaskRow {
  id: string;
  user_id: string;
  source: string | null;
  title: string;
  description: string | null;
  priority: string | null;
  category: string | null;
  important: boolean | number | null;
  time: string | null;
  due_date: string | null;
  completed: boolean | number;
  recurrence_type: string | null;
  recurrence_config: string | null;
  recurrence_until: string | null;
  recurrence_parent_id: string | null;
  recurrence_next_task_id: string | null;
}

interface NextOccurrence {
  dueDate: string; // YYYY-MM-DD
  time: string | null;
}

// ---------------------------------------------------------------------------
// Date/time helpers — all math happens in UTC on the YYYY-MM-DD date part so
// results are independent of the server's local timezone (matches the rest
// of the app, which treats `due_date` as an opaque date string and `time` as
// a separate "HH:MM").
// ---------------------------------------------------------------------------

const toUtcDate = (dateStr: string): Date => {
  const datePart = dateStr.slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
};

const fromUtcDate = (date: Date): string => date.toISOString().slice(0, 10);

const parseTimeParts = (time: string | null): { hours: number; minutes: number } => {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return { hours: 0, minutes: 0 };
  const [h, m] = time.split(':').map(Number);
  return { hours: h, minutes: m };
};

const formatTime = (hours: number, minutes: number): string => {
  const normalizedHours = ((hours % 24) + 24) % 24;
  return `${String(normalizedHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const clampMonthDay = (year: number, monthIndex0: number, day: number): number => {
  const daysInMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  return Math.min(Math.max(day, 1), daysInMonth);
};

const parseConfig = (raw: string | null): RecurrenceConfig | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RecurrenceConfig;
  } catch {
    return null;
  }
};

const isUntilReached = (config: RecurrenceConfig | null, candidateDueDate: string): boolean => {
  if (!config?.until || config.until.type !== 'onDate' || !config.until.date) return false;
  return candidateDueDate.slice(0, 10) > config.until.date.slice(0, 10);
};

/** Advances `base` by whole hours, correctly rolling the date over midnight. */
const addHours = (base: Date, time: string | null, hours: number): NextOccurrence => {
  const { hours: h, minutes: m } = parseTimeParts(time);
  const next = new Date(base);
  next.setUTCHours(h, m, 0, 0);
  next.setUTCHours(next.getUTCHours() + hours);
  return { dueDate: fromUtcDate(next), time: formatTime(next.getUTCHours(), next.getUTCMinutes()) };
};

const addDays = (base: Date, days: number): Date => {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

/** Next day (after `base`, exclusive) whose UTC day-of-week is Mon-Fri. */
const nextWeekday = (base: Date): Date => {
  let next = addDays(base, 1);
  while (!WEEKDAYS_DAYS_OF_WEEK.includes(next.getUTCDay())) {
    next = addDays(next, 1);
  }
  return next;
};

/**
 * Next date after `base` (exclusive) whose UTC day-of-week is in `daysOfWeek`.
 *
 * For plain weekly (`weekIntervalDays === 7`) this is simply "next matching
 * weekday, wrapping to next week if needed". For custom "every N weeks"
 * (`weekIntervalDays === N * 7`), days within the same rotation (i.e. still
 * ahead of `base` in day-of-week order) advance normally; once the candidate
 * wraps past Saturday back to Sunday — starting a new weekly cycle — the
 * extra `weekIntervalDays - 7` is added so cycles are skipped correctly.
 */
const nextDayInWeekSet = (base: Date, daysOfWeek: number[], weekIntervalDays = 7): Date => {
  const sorted = [...new Set(daysOfWeek)].sort((a, b) => a - b);
  if (sorted.length === 0) return addDays(base, weekIntervalDays);

  const baseDow = base.getUTCDay();
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = addDays(base, offset);
    const candidateDow = candidate.getUTCDay();
    if (!sorted.includes(candidateDow)) continue;

    const wrappedIntoNewWeek = candidateDow <= baseDow;
    if (!wrappedIntoNewWeek || weekIntervalDays === 7) return candidate;
    return addDays(candidate, weekIntervalDays - 7);
  }

  // Unreachable for a non-empty `daysOfWeek`, kept as a safe fallback.
  return addDays(base, weekIntervalDays);
};

const addMonths = (base: Date, months: number, monthDay: number): Date => {
  const year = base.getUTCFullYear();
  const monthIndex0 = base.getUTCMonth() + months;
  const targetYear = year + Math.floor(monthIndex0 / 12);
  const targetMonthIndex0 = ((monthIndex0 % 12) + 12) % 12;
  const clampedDay = clampMonthDay(targetYear, targetMonthIndex0, monthDay);
  return new Date(Date.UTC(targetYear, targetMonthIndex0, clampedDay));
};

/**
 * Computes the next occurrence's due date + time for a task, or `null` when
 * the recurrence has no next step (type is 'none'/unparseable, or
 * `recurrence_until` has already been reached).
 */
export function computeNextOccurrence(task: RecurrenceTaskRow): NextOccurrence | null {
  const recurrenceType = (task.recurrence_type || 'none') as RecurrenceType;
  if (recurrenceType === 'none') return null;
  if (!task.due_date) return null;

  const config = parseConfig(task.recurrence_config);
  const base = toUtcDate(task.due_date);
  let result: NextOccurrence;

  switch (recurrenceType) {
    case 'hourly': {
      const everyHours = Math.max(1, config?.everyHours ?? 1);
      result = addHours(base, task.time, everyHours);
      break;
    }

    case 'daily': {
      const time = config?.time || (config?.timeOfDay && TIME_OF_DAY_DEFAULTS[config.timeOfDay]) || task.time || TIME_OF_DAY_DEFAULTS.morning;
      result = { dueDate: fromUtcDate(addDays(base, 1)), time };
      break;
    }

    case 'weekdays': {
      const time = config?.time || (config?.timeOfDay && TIME_OF_DAY_DEFAULTS[config.timeOfDay]) || task.time || TIME_OF_DAY_DEFAULTS.morning;
      result = { dueDate: fromUtcDate(nextWeekday(base)), time };
      break;
    }

    case 'weekly': {
      const daysOfWeek = config?.daysOfWeek?.length ? config.daysOfWeek : [base.getUTCDay()];
      const time = config?.time || (config?.timeOfDay && TIME_OF_DAY_DEFAULTS[config.timeOfDay]) || task.time || TIME_OF_DAY_DEFAULTS.morning;
      result = { dueDate: fromUtcDate(nextDayInWeekSet(base, daysOfWeek, 7)), time };
      break;
    }

    case 'monthly': {
      const monthDay = config?.monthDay ?? base.getUTCDate();
      const time = config?.time || task.time || TIME_OF_DAY_DEFAULTS.morning;
      result = { dueDate: fromUtcDate(addMonths(base, 1, monthDay)), time };
      break;
    }

    case 'custom': {
      const custom = config?.custom;
      if (!custom) return null;
      const interval = Math.max(1, custom.interval || 1);
      const time = config?.time || task.time || TIME_OF_DAY_DEFAULTS.morning;

      switch (custom.frequency) {
        case 'hourly':
          result = addHours(base, task.time, interval);
          break;
        case 'daily':
          result = { dueDate: fromUtcDate(addDays(base, interval)), time };
          break;
        case 'weekly': {
          const daysOfWeek = custom.daysOfWeek?.length ? custom.daysOfWeek : [base.getUTCDay()];
          result = { dueDate: fromUtcDate(nextDayInWeekSet(base, daysOfWeek, interval * 7)), time };
          break;
        }
        case 'monthly': {
          const monthDay = custom.monthDay ?? base.getUTCDate();
          result = { dueDate: fromUtcDate(addMonths(base, interval, monthDay)), time };
          break;
        }
        default:
          return null;
      }
      break;
    }

    default:
      return null;
  }

  if (isUntilReached(config, result.dueDate)) return null;
  return { dueDate: result.dueDate, time: sanitizeTimeString(result.time) };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const toBool = (value: boolean | number | null | undefined): boolean => Boolean(value);

/**
 * Creates the next occurrence row for `task` (cloning title/description/
 * category/priority/importance) and marks `task` as having generated it via
 * `recurrence_next_task_id`. No-op (returns null) if there's no next
 * occurrence to generate, or if `task` already generated one.
 */
export async function generateNextOccurrenceForTask(
  task: RecurrenceTaskRow,
): Promise<RecurrenceTaskRow | null> {
  if (task.recurrence_next_task_id) return null;

  const next = computeNextOccurrence(task);
  if (!next) return null;

  const newTaskId = uuidv4();
  const now = new Date().toISOString();
  const seriesRootId = task.recurrence_parent_id || task.id;

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO tasks (
           id, user_id, source, title, description, completed, priority, category, important,
           time, due_date, recurrence_type, recurrence_config, recurrence_until,
           recurrence_parent_id, created_at, updated_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          newTaskId,
          task.user_id,
          task.source,
          task.title,
          task.description,
          false,
          task.priority,
          task.category,
          toBool(task.important),
          next.time,
          next.dueDate,
          task.recurrence_type,
          task.recurrence_config,
          task.recurrence_until,
          seriesRootId,
          now,
          now,
        ],
      );
      await client.query(
        'UPDATE tasks SET recurrence_next_task_id = $1, updated_at = $2 WHERE id = $3',
        [newTaskId, now, task.id],
      );
      const result = await client.query('SELECT * FROM tasks WHERE id = $1', [newTaskId]);
      return result.rows[0] as RecurrenceTaskRow;
    } finally {
      client.release();
    }
  }

  const db = getDatabase();
  await db.run(
    `INSERT INTO tasks (
       id, user_id, source, title, description, completed, priority, category, important,
       time, due_date, recurrence_type, recurrence_config, recurrence_until,
       recurrence_parent_id, created_at, updated_at
     )
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      newTaskId,
      task.user_id,
      task.source,
      task.title,
      task.description,
      false,
      task.priority,
      task.category,
      toBool(task.important),
      next.time,
      next.dueDate,
      task.recurrence_type,
      task.recurrence_config,
      task.recurrence_until,
      seriesRootId,
      now,
      now,
    ],
  );
  await db.run('UPDATE tasks SET recurrence_next_task_id = ?, updated_at = ? WHERE id = ?', [
    newTaskId,
    now,
    task.id,
  ]);
  const created = await db.get('SELECT * FROM tasks WHERE id = ?', [newTaskId]);
  return created as RecurrenceTaskRow;
}

/**
 * Convenience wrapper used by taskController right after a task flips to
 * completed=true. Swallows errors so a recurrence-generation failure never
 * breaks the primary completion response.
 */
export async function generateNextOccurrenceIfRecurring(
  taskId: string,
): Promise<RecurrenceTaskRow | null> {
  try {
    const task = await getTaskById(taskId);
    if (!task || !task.recurrence_type || task.recurrence_type === 'none') return null;
    return await generateNextOccurrenceForTask(task);
  } catch (error) {
    console.error('[recurrenceService] Failed to generate next occurrence:', {
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

const getTaskById = async (taskId: string): Promise<RecurrenceTaskRow | null> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    return (result.rows[0] as RecurrenceTaskRow) ?? null;
  }
  const db = getDatabase();
  const row = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  return (row as RecurrenceTaskRow) ?? null;
};

/**
 * Periodic sweep: finds recurring tasks that are either completed or already
 * past their due date and haven't generated their next occurrence yet, and
 * generates it for each. Safety net for recurrences the user never
 * explicitly completes (reminder-style) and for the case where the
 * synchronous trigger failed.
 */
export async function runRecurrenceSweep(): Promise<{ processed: number; created: number }> {
  const nowIso = new Date().toISOString();
  let candidates: RecurrenceTaskRow[] = [];

  if (isPostgreSQL()) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM tasks
       WHERE recurrence_type IS NOT NULL
         AND recurrence_type != 'none'
         AND recurrence_next_task_id IS NULL
         AND (completed = TRUE OR due_date < $1)`,
      [nowIso],
    );
    candidates = result.rows as RecurrenceTaskRow[];
  } else {
    const db = getDatabase();
    candidates = (await db.all(
      `SELECT * FROM tasks
       WHERE recurrence_type IS NOT NULL
         AND recurrence_type != 'none'
         AND recurrence_next_task_id IS NULL
         AND (completed = 1 OR due_date < ?)`,
      [nowIso],
    )) as RecurrenceTaskRow[];
  }

  let created = 0;
  for (const task of candidates) {
    const result = await generateNextOccurrenceForTask(task).catch((error) => {
      console.error('[recurrenceService] Sweep failed for task:', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (result) created += 1;
  }

  return { processed: candidates.length, created };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Starts the hourly sweep. A plain node-cron job (no Redis/BullMQ) is enough
 * here: this is a periodic "scan the table" job, not a per-event queue, and
 * Redis is optional in dev (see AGENTS.md) so a hard dependency on it would
 * make recurrence silently stop working when Redis isn't running.
 */
export function startRecurrenceScheduler(): cron.ScheduledTask {
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule('0 * * * *', () => {
    runRecurrenceSweep()
      .then(({ processed, created }) => {
        if (processed > 0) {
          console.log(`[recurrenceService] Sweep processed ${processed} task(s), created ${created} occurrence(s).`);
        }
      })
      .catch((error) => {
        console.error('[recurrenceService] Sweep run failed:', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  return scheduledTask;
}
