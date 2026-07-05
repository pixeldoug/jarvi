/**
 * Eval helpers — build fake AgentContext and Redis for running the WhatsApp
 * agent without a real database or Redis instance.
 *
 * IMPORTANT: call `setupEvalDatabase()` once at the top of any eval entry
 * point before importing services that touch the DB.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  AgentContext,
  CategoryRow,
  TaskRow,
} from '../src/services/agent/core/types';

// ---------------------------------------------------------------------------
// In-memory SQLite setup — call once before any DB-touching service import
// ---------------------------------------------------------------------------

/**
 * Boots an isolated in-memory SQLite and inserts a seed user row so FK
 * constraints pass when tools like `update_memory` write to the DB.
 */
export async function setupEvalDatabase(): Promise<void> {
  // Point the DB layer at an in-memory SQLite — must be set before the first
  // call to initializeDatabase().
  process.env.DATABASE_URL = 'sqlite::memory:';

  const { initializeDatabase, getDatabase } = await import('../src/database');
  await initializeDatabase();

  const db = getDatabase();
  const now = new Date().toISOString();

  // Seed the eval user so FK constraints on user_memory_profiles pass
  await db.run(
    `INSERT OR IGNORE INTO users
       (id, email, name, password, auth_provider, has_password, email_verified,
        timezone, preferred_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'eval-user',
      'eval@jarvi.test',
      'Doug (eval)',
      'eval-no-password',
      'eval',
      0,
      0,
      'America/Sao_Paulo',
      'Doug',
      now,
      now,
    ],
  );
}

// ---------------------------------------------------------------------------
// Fake Redis
// ---------------------------------------------------------------------------

export class FakeRedis {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    _expiryMode: 'EX',
    _time: number,
  ): Promise<unknown> {
    this.store.set(key, value);
    return 'OK';
  }
}

// ---------------------------------------------------------------------------
// Today in São Paulo — used to make task dates relative so scenarios don't
// break the day after you write them.
// ---------------------------------------------------------------------------

export function todayIso(timezone = 'America/Sao_Paulo'): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Weekday-aware dates — scenarios like "consulta sexta" or "academia quarta"
// must resolve to whatever the real next Friday/Wednesday is FROM TODAY, not
// a fixed day-count offset. A fixed offset (`addDays(today, 4)`) only lands on
// the right weekday if the suite happens to run on the same weekday it was
// written on — every other day it silently asserts the wrong date. The
// production prompt (`buildWeekCalendar` in `time.ts`) shows the model a
// 7-day calendar and has it match the weekday name directly, so scenarios
// must replicate that same "next occurrence within 7 days" semantics,
// including offset 0 when today already IS the target weekday.
// ---------------------------------------------------------------------------

/** JS `Date#getUTCDay()` convention: 0=domingo ... 6=sábado. */
export const WEEKDAY = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
} as const;

/**
 * Next date (>= isoDate, within the next 6 days) whose weekday matches
 * `targetWeekday`. If `isoDate` itself already falls on that weekday, returns
 * `isoDate` unchanged — this mirrors how the model resolves "sexta" when the
 * 7-day calendar it's shown has today's entry already labeled "sexta-feira".
 */
export function nextWeekday(isoDate: string, targetWeekday: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const todayWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const offset = (targetWeekday - todayWeekday + 7) % 7;
  return addDays(isoDate, offset);
}

// ---------------------------------------------------------------------------
// Wall-clock-relative times — scenarios that need a "this already happened
// today" or "this is still upcoming today" time (e.g. testing that overdue
// same-day appointments aren't prioritized) can't hardcode a clock time
// either: whether "11:00" is in the past depends on when the suite runs.
// ---------------------------------------------------------------------------

function currentHourMinute(timezone = 'America/Sao_Paulo'): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '12');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

/**
 * A same-day HH:MM offset from the current wall-clock time, clamped to
 * [00:00, 23:59]. Use a negative `minutesOffset` for a time guaranteed to
 * already be in the past today, or positive for one guaranteed still ahead.
 */
export function offsetTimeToday(minutesOffset: number, timezone = 'America/Sao_Paulo'): string {
  const { hour, minute } = currentHourMinute(timezone);
  const total = Math.max(0, Math.min(23 * 60 + 59, hour * 60 + minute + minutesOffset));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Task factory
// ---------------------------------------------------------------------------

let _taskIdCounter = 1;
let _categoryIdCounter = 1;

export function makeCategory(
  overrides: Partial<CategoryRow> & { name: string },
): CategoryRow {
  return {
    id: `category-${_categoryIdCounter++}`,
    user_id: 'eval-user',
    color: null,
    icon: null,
    visible: 1,
    position: 0,
    ...overrides,
  };
}

export function makeTask(
  overrides: Partial<TaskRow> & { title: string },
): TaskRow {
  return {
    id: `task-${_taskIdCounter++}`,
    user_id: 'eval-user',
    completed: false,
    priority: null,
    category: null,
    description: null,
    due_date: null,
    time: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export async function seedTasksForEval(tasks: TaskRow[]): Promise<void> {
  if (tasks.length === 0) return;

  const { getDatabase } = await import('../src/database');
  const db = getDatabase();
  const now = new Date().toISOString();

  for (const task of tasks) {
    await db.run(
      `INSERT OR REPLACE INTO tasks (
         id, user_id, title, description, completed, priority, category, important,
         time, due_date, recurrence_type, recurrence_config, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.user_id,
        task.title,
        task.description ?? null,
        task.completed ? 1 : 0,
        task.priority ?? null,
        task.category ?? null,
        0,
        task.time ?? null,
        task.due_date ?? null,
        'none',
        null,
        task.created_at ?? now,
        now,
      ],
    );
  }
}

export async function seedCategoriesForEval(categories: CategoryRow[]): Promise<void> {
  if (categories.length === 0) return;

  const { getDatabase } = await import('../src/database');
  const db = getDatabase();
  const now = new Date().toISOString();

  for (const [index, category] of categories.entries()) {
    await db.run(
      `INSERT OR REPLACE INTO categories (
         id, user_id, name, color, icon, position, visible, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category.id,
        category.user_id,
        category.name,
        category.color ?? null,
        category.icon ?? null,
        category.position ?? index,
        category.visible ?? 1,
        now,
        now,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

export interface ContextOptions {
  memory?: string;
  timezone?: string;
  preferredName?: string;
  activeTasks?: TaskRow[];
  categories?: CategoryRow[];
  focusedTask?: TaskRow;
  mode?: 'general' | 'task';
}

export function buildContext(opts: ContextOptions = {}): AgentContext {
  return {
    userId: 'eval-user',
    preferredName: opts.preferredName ?? 'Doug',
    timezone: opts.timezone ?? 'America/Sao_Paulo',
    memory: opts.memory ?? 'Doug é fundador da Jarvi, mora em São Paulo.',
    activeTasks: opts.activeTasks ?? [],
    completedTaskCount: 2,
    lists: [],
    categories: opts.categories ?? [],
    mode: opts.mode ?? (opts.focusedTask ? 'task' : 'general'),
    focusedTask: opts.focusedTask,
    originalUserMessage: '',
  };
}
