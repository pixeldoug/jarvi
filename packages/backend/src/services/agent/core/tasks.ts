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

const ACTIVE_TASKS_LIMIT = 50;
const ALL_TASKS_LIMIT = 100;

const ACTIVE_TASK_ORDERING = `
  CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
  due_date ASC,
  CASE WHEN time IS NULL THEN 1 ELSE 0 END,
  time ASC,
  created_at ASC
`;

const TASK_COLUMNS =
  'id, user_id, title, description, completed, priority, category, due_date, time, created_at';

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
  // PostgreSQL driver returns DATE/TIMESTAMP columns as Date objects, not strings.
  const dueDateStr = t.due_date ? String(t.due_date).split('T')[0] : null;
  const timeStr = t.time ? String(t.time).substring(0, 5) : null;

  const parts: string[] = [`"${t.title}"`];
  if (dueDateStr) parts.push(`vence ${dueDateStr}`);
  if (timeStr) parts.push(`às ${timeStr}`);
  if (t.priority) parts.push(`prioridade ${t.priority}`);
  if (t.category) parts.push(`cat: ${t.category}`);

  if (dueDateStr && dueDateStr < todayIso) {
    parts.push('VENCIDA');
  } else if (dueDateStr === todayIso && timeStr && timeStr < nowHM) {
    parts.push('HORÁRIO JÁ PASSOU');
  }

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
