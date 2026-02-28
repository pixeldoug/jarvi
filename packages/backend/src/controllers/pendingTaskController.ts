import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';

type PendingTaskStatus = 'awaiting_confirmation' | 'confirmed' | 'rejected' | 'expired';

interface PendingTaskRecord {
  id: string;
  user_id: string;
  source: string;
  raw_content: string | null;
  suggested_title: string;
  suggested_description: string | null;
  suggested_priority: 'low' | 'medium' | 'high' | null;
  suggested_due_date: string | null;
  suggested_time: string | null;
  suggested_category: string | null;
  suggested_important: boolean;
  status: PendingTaskStatus;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskRecord {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  completed: boolean;
  priority: string | null;
  category: string | null;
  important: boolean;
  time: string | null;
  due_date: string | null;
  recurrence_type: string | null;
  recurrence_config: string | null;
  created_at: string;
  updated_at: string;
}

const SOURCE_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  whatsapp: 'WhatsApp',
};

const sourceToLabel = (source: string): string => SOURCE_LABELS[source] || source;

const nullableStringFrom = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizePriority = (value: unknown): 'low' | 'medium' | 'high' | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  return undefined;
};

const normalizeImportant = (value: unknown): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  return undefined;
};

const getPendingTaskById = async (
  id: string,
  userId: string
): Promise<PendingTaskRecord | null> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM pending_tasks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rows[0] as PendingTaskRecord) ?? null;
  }

  const db = getDatabase();
  const row = await db.get('SELECT * FROM pending_tasks WHERE id = ? AND user_id = ?', [id, userId]);
  return (row as PendingTaskRecord) ?? null;
};

const updatePendingTaskStatus = async (id: string, status: PendingTaskStatus): Promise<void> => {
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    const pool = getPool();
    await pool.query('UPDATE pending_tasks SET status = $1, updated_at = $2 WHERE id = $3', [
      status,
      now,
      id,
    ]);
    return;
  }

  const db = getDatabase();
  await db.run('UPDATE pending_tasks SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);
};

const buildTaskDescription = (pendingTask: PendingTaskRecord): string | null => {
  const summary = pendingTask.suggested_description?.trim() || '';
  const rawContext = pendingTask.raw_content?.trim() || '';

  if (!summary && !rawContext) return null;
  if (!rawContext) return summary;

  const sourceLabel = sourceToLabel(pendingTask.source);
  const contextBlock = `Contexto original (${sourceLabel}):\n${rawContext}`;

  if (!summary) {
    return contextBlock;
  }

  return `${summary}\n\n---\n${contextBlock}`;
};

const createTaskFromPending = async (pendingTask: PendingTaskRecord): Promise<TaskRecord> => {
  const taskId = uuidv4();
  const now = new Date().toISOString();
  const description = buildTaskDescription(pendingTask);

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO tasks (
           id, user_id, title, description, completed, priority, category, important,
           time, due_date, recurrence_type, recurrence_config, created_at, updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14
         )`,
        [
          taskId,
          pendingTask.user_id,
          pendingTask.suggested_title,
          description,
          false,
          pendingTask.suggested_priority,
          pendingTask.suggested_category,
          pendingTask.suggested_important,
          pendingTask.suggested_time,
          pendingTask.suggested_due_date,
          'none',
          null,
          now,
          now,
        ]
      );

      const result = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
      return result.rows[0] as TaskRecord;
    } finally {
      client.release();
    }
  }

  const db = getDatabase();
  await db.run(
    `INSERT INTO tasks (
       id, user_id, title, description, completed, priority, category, important,
       time, due_date, recurrence_type, recurrence_config, created_at, updated_at
     )
     VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?
     )`,
    [
      taskId,
      pendingTask.user_id,
      pendingTask.suggested_title,
      description,
      false,
      pendingTask.suggested_priority,
      pendingTask.suggested_category,
      pendingTask.suggested_important,
      pendingTask.suggested_time,
      pendingTask.suggested_due_date,
      'none',
      null,
      now,
      now,
    ]
  );

  const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  return task as TaskRecord;
};

export const getPendingTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    let pendingTasks: PendingTaskRecord[] = [];
    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query(
        `SELECT *
         FROM pending_tasks
         WHERE user_id = $1 AND status = 'awaiting_confirmation'
         ORDER BY created_at DESC`,
        [userId]
      );
      pendingTasks = result.rows as PendingTaskRecord[];
    } else {
      const db = getDatabase();
      pendingTasks = (await db.all(
        `SELECT *
         FROM pending_tasks
         WHERE user_id = ? AND status = 'awaiting_confirmation'
         ORDER BY created_at DESC`,
        [userId]
      )) as PendingTaskRecord[];
    }

    res.json(pendingTasks);
  } catch (error) {
    console.error('Error listing pending tasks:', error);
    res.status(500).json({ error: 'Failed to list pending tasks' });
  }
};

export const confirmPendingTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const pendingTask = await getPendingTaskById(id, userId);
    if (!pendingTask) {
      res.status(404).json({ error: 'Pending task not found' });
      return;
    }

    if (pendingTask.status !== 'awaiting_confirmation') {
      res.status(400).json({ error: 'Pending task can no longer be confirmed' });
      return;
    }

    const task = await createTaskFromPending(pendingTask);
    await updatePendingTaskStatus(id, 'confirmed');

    res.status(201).json({ task, pendingTaskId: id, status: 'confirmed' });
  } catch (error) {
    console.error('Error confirming pending task:', error);
    res.status(500).json({ error: 'Failed to confirm pending task' });
  }
};

export const rejectPendingTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const pendingTask = await getPendingTaskById(id, userId);
    if (!pendingTask) {
      res.status(404).json({ error: 'Pending task not found' });
      return;
    }

    await updatePendingTaskStatus(id, 'rejected');
    res.json({ success: true, pendingTaskId: id, status: 'rejected' });
  } catch (error) {
    console.error('Error rejecting pending task:', error);
    res.status(500).json({ error: 'Failed to reject pending task' });
  }
};

export const updatePendingTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const existing = await getPendingTaskById(id, userId);
    if (!existing) {
      res.status(404).json({ error: 'Pending task not found' });
      return;
    }

    const suggestedTitleInput =
      nullableStringFrom(req.body.title) ?? nullableStringFrom(req.body.suggested_title);
    if (suggestedTitleInput !== undefined && suggestedTitleInput === null) {
      res.status(400).json({ error: 'Title cannot be empty' });
      return;
    }

    const updates = {
      suggested_title: suggestedTitleInput,
      suggested_description:
        nullableStringFrom(req.body.description) ?? nullableStringFrom(req.body.suggested_description),
      suggested_priority:
        normalizePriority(req.body.priority) ?? normalizePriority(req.body.suggested_priority),
      suggested_due_date:
        nullableStringFrom(req.body.dueDate) ??
        nullableStringFrom(req.body.due_date) ??
        nullableStringFrom(req.body.suggested_due_date),
      suggested_time:
        nullableStringFrom(req.body.time) ?? nullableStringFrom(req.body.suggested_time),
      suggested_category:
        nullableStringFrom(req.body.category) ?? nullableStringFrom(req.body.suggested_category),
      suggested_important:
        normalizeImportant(req.body.important) ?? normalizeImportant(req.body.suggested_important),
    };

    const updateEntries = Object.entries(updates).filter(([, value]) => value !== undefined);
    if (updateEntries.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      const values: unknown[] = [];
      const setFragments = updateEntries.map(([key, value], index) => {
        values.push(value);
        return `${key} = $${index + 1}`;
      });
      values.push(now, id, userId);

      await pool.query(
        `UPDATE pending_tasks
         SET ${setFragments.join(', ')}, updated_at = $${updateEntries.length + 1}
         WHERE id = $${updateEntries.length + 2} AND user_id = $${updateEntries.length + 3}`,
        values
      );

      const result = await pool.query('SELECT * FROM pending_tasks WHERE id = $1 AND user_id = $2', [
        id,
        userId,
      ]);
      res.json((result.rows[0] as PendingTaskRecord) || null);
      return;
    }

    const db = getDatabase();
    const values: unknown[] = [];
    const setFragments = updateEntries.map(([key, value]) => {
      values.push(value);
      return `${key} = ?`;
    });
    values.push(now, id, userId);

    await db.run(
      `UPDATE pending_tasks
       SET ${setFragments.join(', ')}, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      values
    );

    const updated = await db.get('SELECT * FROM pending_tasks WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
    res.json((updated as PendingTaskRecord) || null);
  } catch (error) {
    console.error('Error updating pending task:', error);
    res.status(500).json({ error: 'Failed to update pending task' });
  }
};

export const deletePendingTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const existing = await getPendingTaskById(id, userId);
    if (!existing) {
      res.status(404).json({ error: 'Pending task not found' });
      return;
    }

    if (isPostgreSQL()) {
      const pool = getPool();
      await pool.query('DELETE FROM pending_tasks WHERE id = $1 AND user_id = $2', [id, userId]);
    } else {
      const db = getDatabase();
      await db.run('DELETE FROM pending_tasks WHERE id = ? AND user_id = ?', [id, userId]);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting pending task:', error);
    res.status(500).json({ error: 'Failed to delete pending task' });
  }
};
