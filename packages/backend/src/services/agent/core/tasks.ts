/**
 * Task-row helpers and prompt formatter.
 *
 * `formatTaskLine` is the single source of truth for how a task is rendered
 * inside the system prompt. Crucially it always includes `time` and tags any
 * task whose horário já passou with `HORÁRIO JÁ PASSOU` — the bug that
 * triggered this whole refactor was the web prompt silently dropping `time`.
 */

import { getDatabase, getPool, isPostgreSQL } from '../../../database';
import type { CategoryRow, ListRow, TaskRow } from './types';

// Cap on how many active tasks we load into the prompt. The first slice is
// rendered in full detail; the remainder becomes a compact index (title + id).
// Tasks beyond this cap are reachable via the `search_tasks` tool.
const ACTIVE_TASKS_LIMIT = 200;
const ALL_TASKS_LIMIT = 100;
// Default/clamp for the on-demand `search_tasks` tool result size.
const SEARCH_TASKS_DEFAULT_LIMIT = 20;
const SEARCH_TASKS_MAX_LIMIT = 50;

const ACTIVE_TASK_ORDERING = `
  CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
  due_date ASC,
  CASE WHEN time IS NULL THEN 1 ELSE 0 END,
  time ASC,
  created_at ASC
`;

const TASK_COLUMNS =
  'id, user_id, title, description, completed, priority, category, due_date, time, created_at';

export interface TaskBuckets {
  overdue: TaskRow[];
  today: TaskRow[];
  tomorrow: TaskRow[];
  upcoming: TaskRow[];
  unscheduled: TaskRow[];
}

// ---------------------------------------------------------------------------
// Date/time normalization
// ---------------------------------------------------------------------------

export function normalizeTaskDueDate(value: unknown): string | null {
  if (value == null) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const str = String(value).trim();
  if (!str) return null;

  const isoDateMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDateMatch) return isoDateMatch[1];

  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function normalizeTaskTime(value: unknown): string | null {
  if (value == null) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(11, 16);
  }

  const str = String(value).trim();
  if (!str) return null;

  const timeMatch = str.match(/(\d{2}):(\d{2})/);
  return timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : str.substring(0, 5);
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function bucketTasksByDate(tasks: TaskRow[], todayIso: string): TaskBuckets {
  const tomorrowIso = addDaysToIsoDate(todayIso, 1);
  const buckets: TaskBuckets = {
    overdue: [],
    today: [],
    tomorrow: [],
    upcoming: [],
    unscheduled: [],
  };

  for (const task of tasks) {
    const dueDate = normalizeTaskDueDate(task.due_date);

    if (!dueDate) {
      buckets.unscheduled.push(task);
    } else if (dueDate < todayIso) {
      buckets.overdue.push(task);
    } else if (dueDate === todayIso) {
      buckets.today.push(task);
    } else if (dueDate === tomorrowIso) {
      buckets.tomorrow.push(task);
    } else {
      buckets.upcoming.push(task);
    }
  }

  return buckets;
}

function truncateForPrompt(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getUserActiveTasks(userId: string): Promise<TaskRow[]> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      `SELECT ${TASK_COLUMNS}
       FROM tasks
       WHERE user_id = $1 AND completed = FALSE
       ORDER BY ${ACTIVE_TASK_ORDERING}
       LIMIT ${ACTIVE_TASKS_LIMIT}`,
      [userId],
    );
    return result.rows as TaskRow[];
  }

  return getDatabase().all<TaskRow[]>(
    `SELECT ${TASK_COLUMNS}
     FROM tasks
     WHERE user_id = ? AND completed = 0
     ORDER BY ${ACTIVE_TASK_ORDERING}
     LIMIT ${ACTIVE_TASKS_LIMIT}`,
    [userId],
  );
}

export async function getActiveTaskCount(userId: string): Promise<number> {
  if (isPostgreSQL()) {
    const result = await getPool().query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM tasks WHERE user_id = $1 AND completed = FALSE',
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  const row = await getDatabase().get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM tasks WHERE user_id = ? AND completed = 0',
    [userId],
  );
  return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------------------
// On-demand search (powers the `search_tasks` tool)
// ---------------------------------------------------------------------------

export interface TaskSearchFilters {
  /** Free text matched against title + description (case-insensitive). */
  query?: string;
  category?: string;
  priority?: string;
  /** Inclusive lower bound on due_date (YYYY-MM-DD). */
  dueFrom?: string;
  /** Inclusive upper bound on due_date (YYYY-MM-DD). */
  dueTo?: string;
  /** When true, also returns completed tasks. Defaults to false. */
  includeCompleted?: boolean;
  limit?: number;
}

export async function searchUserTasks(
  userId: string,
  filters: TaskSearchFilters,
): Promise<TaskRow[]> {
  const limit = Math.min(
    Math.max(1, filters.limit ?? SEARCH_TASKS_DEFAULT_LIMIT),
    SEARCH_TASKS_MAX_LIMIT,
  );
  const pg = isPostgreSQL();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  const ph = (): string => (pg ? `$${idx++}` : '?');

  params.push(userId);
  conditions.push(`user_id = ${ph()}`);

  if (!filters.includeCompleted) {
    conditions.push(`completed = ${pg ? 'FALSE' : '0'}`);
  }

  const query = filters.query?.trim();
  if (query) {
    const like = `%${query.toLowerCase()}%`;
    const titlePh = ph();
    params.push(like);
    const descPh = ph();
    params.push(like);
    conditions.push(
      `(LOWER(title) LIKE ${titlePh} OR LOWER(COALESCE(description, '')) LIKE ${descPh})`,
    );
  }

  const category = filters.category?.trim();
  if (category) {
    conditions.push(`LOWER(COALESCE(category, '')) = ${ph()}`);
    params.push(category.toLowerCase());
  }

  const priority = filters.priority?.trim();
  if (priority) {
    conditions.push(`priority = ${ph()}`);
    params.push(priority);
  }

  if (filters.dueFrom) {
    conditions.push(`due_date >= ${ph()}`);
    params.push(filters.dueFrom);
  }

  if (filters.dueTo) {
    conditions.push(`due_date <= ${ph()}`);
    params.push(filters.dueTo);
  }

  const sql = `SELECT ${TASK_COLUMNS}
     FROM tasks
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${ACTIVE_TASK_ORDERING}
     LIMIT ${limit}`;

  if (pg) {
    const result = await getPool().query(sql, params);
    return result.rows as TaskRow[];
  }
  return getDatabase().all<TaskRow[]>(sql, params);
}

export async function getUserAllTasks(userId: string): Promise<TaskRow[]> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      `SELECT ${TASK_COLUMNS}
       FROM tasks
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT ${ALL_TASKS_LIMIT}`,
      [userId],
    );
    return result.rows as TaskRow[];
  }

  return getDatabase().all<TaskRow[]>(
    `SELECT ${TASK_COLUMNS}
     FROM tasks
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ${ALL_TASKS_LIMIT}`,
    [userId],
  );
}

export async function getCompletedTaskCount(userId: string): Promise<number> {
  if (isPostgreSQL()) {
    const result = await getPool().query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM tasks WHERE user_id = $1 AND completed = TRUE',
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  const row = await getDatabase().get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM tasks WHERE user_id = ? AND completed = 1',
    [userId],
  );
  return Number(row?.count ?? 0);
}

export async function getTaskById(taskId: string, userId: string): Promise<TaskRow | null> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1 AND user_id = $2`,
      [taskId, userId],
    );
    return (result.rows[0] as TaskRow) || null;
  }

  const row = await getDatabase().get<TaskRow>(
    `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ? AND user_id = ?`,
    [taskId, userId],
  );
  return row || null;
}

// ---------------------------------------------------------------------------
// Lists & categories (web-only contexts)
// ---------------------------------------------------------------------------

export async function getUserLists(userId: string): Promise<ListRow[]> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      'SELECT * FROM lists WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return result.rows as ListRow[];
  }
  return (await getDatabase().all<ListRow[]>(
    'SELECT * FROM lists WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  )) as ListRow[];
}

export async function getUserCategories(userId: string): Promise<CategoryRow[]> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      'SELECT * FROM categories WHERE user_id = $1 ORDER BY position ASC, name ASC',
      [userId],
    );
    return result.rows as CategoryRow[];
  }
  return (await getDatabase().all<CategoryRow[]>(
    'SELECT * FROM categories WHERE user_id = ? ORDER BY position ASC, name ASC',
    [userId],
  )) as CategoryRow[];
}

/**
 * Snap a model-provided category string to an EXISTING user category, matching
 * case-insensitively and ignoring surrounding whitespace. Returns the canonical
 * stored name (preserving the user's casing) or null when there is no match.
 *
 * This is the deterministic guard that stops the agent from inventing free-text
 * categories that drift from the curated `categories` set. New categories must
 * be created explicitly via `create_category`, never as a side effect of
 * create_task/update_task.
 */
export function resolveExistingCategoryName(
  candidate: string | null | undefined,
  categories: CategoryRow[],
): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  const match = categories.find((c) => c.name.trim().toLowerCase() === key);
  return match ? match.name : null;
}

export function safeParseCategoryNames(raw: unknown): string[] {
  if (Array.isArray(raw) && (raw as unknown[]).every((x) => typeof x === 'string')) {
    return raw as string[];
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && (parsed as unknown[]).every((x) => typeof x === 'string')) {
        return parsed as string[];
      }
    } catch {
      return [];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Prompt formatters
// ---------------------------------------------------------------------------

/**
 * Render a single task as a prompt-friendly line. ALWAYS includes `time` when
 * present, and ALWAYS tags VENCIDA / HORÁRIO JÁ PASSOU when applicable so the
 * model never re-recommends as priority a task whose time has already passed.
 */
export function formatTaskLine(t: TaskRow, todayIso: string, nowHM: string): string {
  const dueDateStr = normalizeTaskDueDate(t.due_date);
  const timeStr = normalizeTaskTime(t.time);

  const parts: string[] = [`"${t.title}"`];
  if (dueDateStr) parts.push(`vence ${dueDateStr}`);
  if (timeStr) parts.push(`às ${timeStr}`);
  if (t.priority) parts.push(`prioridade ${t.priority}`);
  if (t.category) parts.push(`cat: ${t.category}`);
  if (t.description?.trim()) parts.push(`desc: ${truncateForPrompt(t.description)}`);

  if (dueDateStr && dueDateStr < todayIso) {
    parts.push('VENCIDA');
  } else if (dueDateStr === todayIso && timeStr && timeStr < nowHM) {
    parts.push('HORÁRIO JÁ PASSOU');
  }

  parts.push(`id: ${t.id}`);
  return `  - ${parts.join(' | ')}`;
}

/**
 * Compact one-liner for the prompt's task INDEX section: title + date + id only
 * (no description). Keeps the long tail of tasks referenceable by the model
 * without inflating tokens. High priority is flagged so it stays visible.
 */
export function formatTaskIndexLine(t: TaskRow): string {
  const dueDateStr = normalizeTaskDueDate(t.due_date);
  const timeStr = normalizeTaskTime(t.time);

  const parts: string[] = [`"${t.title}"`];
  if (dueDateStr) parts.push(`vence ${dueDateStr}`);
  if (timeStr) parts.push(`às ${timeStr}`);
  if ((t.priority ?? '').toLowerCase() === 'high') parts.push('prioridade high');
  if (t.category) parts.push(`cat: ${t.category}`);
  parts.push(`id: ${t.id}`);
  return `  - ${parts.join(' | ')}`;
}

export function formatListLine(l: ListRow): string {
  const catNames = safeParseCategoryNames(l.category_names);
  const parts: string[] = [`"${l.name}" (id: ${l.id})`];
  if (catNames.length > 0) parts.push(`cats: ${catNames.join(', ')}`);
  if (l.priority) parts.push(`prioridade: ${l.priority}`);
  if (l.connected_app) parts.push(`app: ${l.connected_app}`);
  if (l.filter_no_category) parts.push('sem categoria');
  if (l.show_completed === 0) parts.push('oculta concluídas');
  return `  - ${parts.join(' | ')}`;
}

export function formatCategoryLine(c: CategoryRow): string {
  return `  - "${c.name}" (id: ${c.id})${c.visible === 0 ? ' [oculta]' : ''}`;
}
