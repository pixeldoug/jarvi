/**
 * Task insert shared by the surfaces that create tasks outside the web form:
 * the MCP `create_task` tool and Notas ("Próximos passos" → tasks). One path
 * for the row, the `task_created` telemetry and the socket event, so they
 * can't drift between surfaces.
 *
 * Callers validate and normalize the fields first (capitalized title,
 * category resolved against the user's categories, YYYY-MM-DD due date, ...):
 * this only writes them.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { getIO, hasIO } from '../utils/ioManager';
import { recordTaskCreated } from './taskTelemetry';

/** `tasks.source` (and the telemetry `source`) of the inserted row. */
export type InsertedTaskSource = 'mcp' | 'notes';

export interface InsertTaskFields {
  title: string;
  description: string | null;
  priority: string | null;
  category: string | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  /** HH:MM */
  time: string | null;
}

export interface InsertTaskOptions {
  source: InsertedTaskSource;
  /** Notas: the note the task came from (`tasks.source_note_id`). */
  sourceNoteId?: string | null;
  /** Telemetry distinct_id; read from `users` when omitted. */
  email?: string;
  /**
   * `false` when inserting a batch: the caller emits `task:created` once,
   * after the last row, instead of one event per task.
   */
  notify?: boolean;
  /**
   * Notas: the id reserved for the task before inserting it (a next step's
   * link is claimed first, so "Criar tarefas" stays idempotent). New uuid
   * when omitted.
   */
  id?: string;
}

/** Tells the user's open web tabs to refetch their tasks. */
export function emitTaskEvent(
  userId: string,
  event: 'task:created' | 'task:changed',
  source: InsertedTaskSource,
): void {
  if (!hasIO()) return;
  getIO().to(`user:${userId}`).emit(event, { source });
}

async function readUserEmail(userId: string): Promise<string> {
  if (isPostgreSQL()) {
    const result = await getPool().query('SELECT email FROM users WHERE id = $1', [userId]);
    return (result.rows[0]?.email as string | undefined) ?? '';
  }
  const row = await getDatabase().get<{ email: string }>('SELECT email FROM users WHERE id = ?', [userId]);
  return row?.email ?? '';
}

/** Inserts the task and returns its id. */
export async function insertTask(
  userId: string,
  fields: InsertTaskFields,
  options: InsertTaskOptions,
): Promise<string> {
  const taskId = options.id ?? uuidv4();
  const now = new Date().toISOString();
  const { title, description, priority, category, dueDate, time } = fields;
  const sourceNoteId = options.sourceNoteId ?? null;

  if (isPostgreSQL()) {
    await getPool().query(
      `INSERT INTO tasks
        (id, user_id, title, description, priority, category, due_date, time, source, source_note_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [taskId, userId, title, description, priority, category, dueDate, time, options.source, sourceNoteId, now, now],
    );
  } else {
    await getDatabase().run(
      `INSERT INTO tasks
        (id, user_id, title, description, priority, category, due_date, time, source, source_note_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, userId, title, description, priority, category, dueDate, time, options.source, sourceNoteId, now, now],
    );
  }

  recordTaskCreated({
    email: options.email ?? (await readUserEmail(userId)),
    source: options.source,
    taskId,
    priority,
    hasDueDate: Boolean(dueDate),
    hasCategory: Boolean(category),
    hasRecurrence: false,
  });
  if (options.notify !== false) emitTaskEvent(userId, 'task:created', options.source);
  return taskId;
}
