/**
 * Eval helpers — build fake AgentContext and Redis for running the WhatsApp
 * agent without a real database or Redis instance.
 *
 * IMPORTANT: call `setupEvalDatabase()` once at the top of any eval entry
 * point before importing services that touch the DB.
 */

import { v4 as uuidv4 } from 'uuid';
import type { AgentContext, PendingTaskRow, TaskRow } from '../src/services/agent/core/types';

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
// Task factory
// ---------------------------------------------------------------------------

let _taskIdCounter = 1;

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

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

export interface ContextOptions {
  memory?: string;
  timezone?: string;
  preferredName?: string;
  activeTasks?: TaskRow[];
  pendingTasks?: PendingTaskRow[];
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
    categories: [],
    pendingTasks: opts.pendingTasks ?? [],
    mode: 'general',
    originalUserMessage: '',
  };
}
