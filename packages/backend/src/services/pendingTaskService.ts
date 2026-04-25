/**
 * Shared service for the pending_tasks lifecycle.
 *
 * Both the REST controller (pendingTaskController) and the unified agent
 * (services/agent/core/tools.ts) consume this so we have ONE place that:
 *  - reads/writes pending_tasks
 *  - moves a confirmed pending into the live tasks table
 *  - emits the pending-task:updated socket event the frontend listens to
 */
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { sanitizeTimeString } from '../utils/taskTime';
import { getIO, hasIO } from '../utils/ioManager';

export interface PendingTaskRecord {
  id: string;
  user_id: string;
  source: string | null;
  suggested_title: string;
  suggested_description: string | null;
  suggested_priority: string | null;
  suggested_due_date: string | null;
  suggested_time: string | null;
  suggested_category: string | null;
  original_whatsapp_content: string | null;
  raw_content: string | null;
  media_attachments: string | null;
  status: string;
  expires_at?: string | null;
  created_at?: string | null;
}

export interface TaskRecord {
  id: string;
  user_id: string;
  source: string | null;
  title: string;
  description: string | null;
  priority: string | null;
  category: string | null;
  important: boolean;
  time: string | null;
  due_date: string | null;
  recurrence_type: string;
  recurrence_config: string | null;
  original_whatsapp_content: string | null;
  media_attachments: string | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface PendingTaskUpdateInput {
  title?: string | null;
  description?: string | null;
  priority?: string | null;
  due_date?: string | null;
  time?: string | null;
  category?: string | null;
}

export type PendingTaskStatus =
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'rejected'
  | 'expired'
  | 'deleted';

export const emitPendingTaskUpdated = (
  userId: string,
  pendingTaskId: string,
  status: string,
): void => {
  if (!hasIO()) return;
  getIO().to(`user:${userId}`).emit('pending-task:updated', {
    id: pendingTaskId,
    status,
  });
};

export const getPendingTaskById = async (
  id: string,
  userId: string,
): Promise<PendingTaskRecord | null> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM pending_tasks WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return (result.rows[0] as PendingTaskRecord) ?? null;
  }

  const db = getDatabase();
  const row = await db.get(
    'SELECT * FROM pending_tasks WHERE id = ? AND user_id = ?',
    [id, userId],
  );
  return (row as PendingTaskRecord) ?? null;
};

export const setPendingTaskStatus = async (
  id: string,
  status: PendingTaskStatus,
): Promise<void> => {
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    const pool = getPool();
    await pool.query(
      'UPDATE pending_tasks SET status = $1, updated_at = $2 WHERE id = $3',
      [status, now, id],
    );
    return;
  }

  const db = getDatabase();
  await db.run(
    'UPDATE pending_tasks SET status = ?, updated_at = ? WHERE id = ?',
    [status, now, id],
  );
};

export const createTaskFromPending = async (
  pendingTask: PendingTaskRecord,
): Promise<TaskRecord> => {
  const taskId = uuidv4();
  const now = new Date().toISOString();
  const source = pendingTask.source || 'manual';
  const rawContext =
    (pendingTask.original_whatsapp_content || pendingTask.raw_content)?.trim() ||
    'Sem texto original.';
  const sourceLabel = source === 'gmail' ? 'Gmail' : 'WhatsApp';
  const aiSummary =
    pendingTask.suggested_description?.trim() || 'Resumo não informado pela IA.';
  const finalDescription = `${aiSummary}\n\n---\nContexto original (${sourceLabel}):\n${rawContext}`;
  const sanitizedTime = sanitizeTimeString(pendingTask.suggested_time);

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO tasks (
           id, user_id, source, title, description, completed, priority, category, important,
           time, due_date, recurrence_type, recurrence_config, original_whatsapp_content,
           media_attachments, created_at, updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9,
           $10, $11, $12, $13, $14, $15, $16, $17
         )`,
        [
          taskId,
          pendingTask.user_id,
          source,
          pendingTask.suggested_title,
          finalDescription,
          false,
          pendingTask.suggested_priority,
          pendingTask.suggested_category,
          false,
          sanitizedTime,
          pendingTask.suggested_due_date,
          'none',
          null,
          pendingTask.original_whatsapp_content,
          pendingTask.media_attachments,
          now,
          now,
        ],
      );

      const result = await client.query('SELECT * FROM tasks WHERE id = $1', [
        taskId,
      ]);
      return result.rows[0] as TaskRecord;
    } finally {
      client.release();
    }
  }

  const db = getDatabase();
  await db.run(
    `INSERT INTO tasks (
       id, user_id, source, title, description, completed, priority, category, important,
       time, due_date, recurrence_type, recurrence_config, original_whatsapp_content,
       media_attachments, created_at, updated_at
     )
     VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?, ?, ?
     )`,
    [
      taskId,
      pendingTask.user_id,
      source,
      pendingTask.suggested_title,
      finalDescription,
      false,
      pendingTask.suggested_priority,
      pendingTask.suggested_category,
      false,
      sanitizedTime,
      pendingTask.suggested_due_date,
      'none',
      null,
      pendingTask.original_whatsapp_content,
      pendingTask.media_attachments,
      now,
      now,
    ],
  );

  const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  return task as TaskRecord;
};

/**
 * Confirm a pending task: move it into the live tasks table, set status to
 * 'confirmed', and emit the socket event. Throws on any failure.
 */
export const confirmPending = async (
  pendingTask: PendingTaskRecord,
): Promise<TaskRecord> => {
  const task = await createTaskFromPending(pendingTask);
  await setPendingTaskStatus(pendingTask.id, 'confirmed');
  emitPendingTaskUpdated(pendingTask.user_id, pendingTask.id, 'confirmed');
  return task;
};

export const rejectPending = async (
  pendingTask: PendingTaskRecord,
): Promise<void> => {
  await setPendingTaskStatus(pendingTask.id, 'rejected');
  emitPendingTaskUpdated(pendingTask.user_id, pendingTask.id, 'rejected');
};

const PENDING_TASK_FIELD_MAP = {
  title: 'suggested_title',
  description: 'suggested_description',
  priority: 'suggested_priority',
  due_date: 'suggested_due_date',
  time: 'suggested_time',
  category: 'suggested_category',
} as const;

/**
 * Apply a partial update to a pending task. Only the keys present in `updates`
 * are touched; `null` is a valid value (clears the field). Returns the updated
 * row, or null if no row was found / nothing to update.
 */
export const updatePendingTaskFields = async (
  id: string,
  userId: string,
  updates: PendingTaskUpdateInput,
): Promise<PendingTaskRecord | null> => {
  const setEntries: Array<[string, unknown]> = [];

  for (const [inputKey, column] of Object.entries(PENDING_TASK_FIELD_MAP) as Array<
    [keyof PendingTaskUpdateInput, string]
  >) {
    const value = updates[inputKey];
    if (value === undefined) continue;
    const normalized =
      inputKey === 'time' ? sanitizeTimeString(value) : value;
    setEntries.push([column, normalized]);
  }

  if (setEntries.length === 0) return null;

  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    const pool = getPool();
    const values: unknown[] = [];
    const fragments = setEntries.map(([key, value], idx) => {
      values.push(value);
      return `${key} = $${idx + 1}`;
    });
    values.push(now, id, userId);

    await pool.query(
      `UPDATE pending_tasks
       SET ${fragments.join(', ')}, updated_at = $${setEntries.length + 1}
       WHERE id = $${setEntries.length + 2} AND user_id = $${setEntries.length + 3}`,
      values,
    );

    const result = await pool.query(
      'SELECT * FROM pending_tasks WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    const updated = (result.rows[0] as PendingTaskRecord) ?? null;
    if (updated) {
      emitPendingTaskUpdated(userId, id, updated.status);
    }
    return updated;
  }

  const db = getDatabase();
  const values: unknown[] = [];
  const fragments = setEntries.map(([key, value]) => {
    values.push(value);
    return `${key} = ?`;
  });
  values.push(now, id, userId);

  await db.run(
    `UPDATE pending_tasks
     SET ${fragments.join(', ')}, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    values,
  );

  const updated = (await db.get(
    'SELECT * FROM pending_tasks WHERE id = ? AND user_id = ?',
    [id, userId],
  )) as PendingTaskRecord | undefined;

  if (updated) {
    emitPendingTaskUpdated(userId, id, updated.status);
  }
  return updated ?? null;
};

export const deletePendingTaskRow = async (
  id: string,
  userId: string,
): Promise<void> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    await pool.query('DELETE FROM pending_tasks WHERE id = $1 AND user_id = $2', [
      id,
      userId,
    ]);
  } else {
    const db = getDatabase();
    await db.run('DELETE FROM pending_tasks WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
  }
  emitPendingTaskUpdated(userId, id, 'deleted');
};

/**
 * Active pending tasks for a given user: status = awaiting_confirmation AND
 * expires_at in the future (or NULL for back-compat). Used by the WhatsApp
 * agent to inject pending-task context into the system prompt.
 */
export const getActivePendingTasksForUser = async (
  userId: string,
  limit = 10,
): Promise<PendingTaskRecord[]> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT *
       FROM pending_tasks
       WHERE user_id = $1
         AND status = 'awaiting_confirmation'
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return result.rows as PendingTaskRecord[];
  }

  const db = getDatabase();
  const rows = await db.all(
    `SELECT *
     FROM pending_tasks
     WHERE user_id = ?
       AND status = 'awaiting_confirmation'
       AND (expires_at IS NULL OR expires_at > datetime('now'))
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, limit],
  );
  return rows as PendingTaskRecord[];
};
