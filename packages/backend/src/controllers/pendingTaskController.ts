import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { getIO, hasIO } from '../utils/ioManager';

interface PendingTaskRecord {
  id: string;
  user_id: string;
  suggested_title: string;
  suggested_description: string | null;
  suggested_priority: string | null;
  suggested_due_date: string | null;
  suggested_time: string | null;
  suggested_category: string | null;
  original_whatsapp_content: string | null;
  media_attachments: string | null;
  status: string;
}

interface TaskRecord {
  id: string;
  user_id: string;
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

const emitPendingTaskUpdated = (userId: string, pendingTaskId: string, status: string): void => {
  if (!hasIO()) return;

  getIO().to(`user:${userId}`).emit('pending-task:updated', {
    id: pendingTaskId,
    status,
  });
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

const updatePendingTaskStatus = async (id: string, status: string): Promise<void> => {
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    const pool = getPool();
    await pool.query(
      'UPDATE pending_tasks SET status = $1, updated_at = $2 WHERE id = $3',
      [status, now, id]
    );
    return;
  }

  const db = getDatabase();
  await db.run('UPDATE pending_tasks SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);
};

const createTaskFromPending = async (pendingTask: PendingTaskRecord): Promise<TaskRecord> => {
  const taskId = uuidv4();
  const now = new Date().toISOString();
  const context = pendingTask.original_whatsapp_content?.trim() || 'Sem texto original.';
  const aiSummary = pendingTask.suggested_description?.trim() || 'Resumo não informado pela IA.';
  const finalDescription = `${aiSummary}\n\n---\nContexto original (WhatsApp):\n${context}`;

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO tasks (
           id, user_id, title, description, completed, priority, category, important,
           time, due_date, recurrence_type, recurrence_config, original_whatsapp_content,
           media_attachments, created_at, updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14, $15, $16
         )`,
        [
          taskId,
          pendingTask.user_id,
          pendingTask.suggested_title,
          finalDescription,
          false,
          pendingTask.suggested_priority,
          pendingTask.suggested_category,
          false,
          pendingTask.suggested_time,
          pendingTask.suggested_due_date,
          'none',
          null,
          pendingTask.original_whatsapp_content,
          pendingTask.media_attachments,
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
       time, due_date, recurrence_type, recurrence_config, original_whatsapp_content,
       media_attachments, created_at, updated_at
     )
     VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?, ?, ?
     )`,
    [
      taskId,
      pendingTask.user_id,
      pendingTask.suggested_title,
      finalDescription,
      false,
      pendingTask.suggested_priority,
      pendingTask.suggested_category,
      false,
      pendingTask.suggested_time,
      pendingTask.suggested_due_date,
      'none',
      null,
      pendingTask.original_whatsapp_content,
      pendingTask.media_attachments,
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

    let rows: PendingTaskRecord[] = [];

    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query(
        `SELECT *
         FROM pending_tasks
         WHERE user_id = $1
           AND status = 'awaiting_confirmation'
         ORDER BY created_at DESC`,
        [userId]
      );
      rows = result.rows as PendingTaskRecord[];
    } else {
      const db = getDatabase();
      rows = (await db.all(
        `SELECT *
         FROM pending_tasks
         WHERE user_id = ?
           AND status = 'awaiting_confirmation'
         ORDER BY created_at DESC`,
        [userId]
      )) as PendingTaskRecord[];
    }

    res.json(rows);
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
    emitPendingTaskUpdated(userId, id, 'confirmed');

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
    emitPendingTaskUpdated(userId, id, 'rejected');

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

    const pendingTask = await getPendingTaskById(id, userId);
    if (!pendingTask) {
      res.status(404).json({ error: 'Pending task not found' });
      return;
    }

    const updates = {
      suggested_title:
        typeof req.body.title === 'string'
          ? req.body.title.trim()
          : typeof req.body.suggested_title === 'string'
            ? req.body.suggested_title.trim()
            : undefined,
      suggested_description:
        typeof req.body.description === 'string'
          ? req.body.description
          : req.body.suggested_description !== undefined
            ? req.body.suggested_description
            : undefined,
      suggested_priority:
        typeof req.body.priority === 'string'
          ? req.body.priority
          : req.body.suggested_priority !== undefined
            ? req.body.suggested_priority
            : undefined,
      suggested_due_date:
        typeof req.body.dueDate === 'string'
          ? req.body.dueDate
          : typeof req.body.due_date === 'string'
            ? req.body.due_date
            : req.body.suggested_due_date !== undefined
              ? req.body.suggested_due_date
              : undefined,
      suggested_time:
        typeof req.body.time === 'string'
          ? req.body.time
          : req.body.suggested_time !== undefined
            ? req.body.suggested_time
            : undefined,
      suggested_category:
        typeof req.body.category === 'string'
          ? req.body.category
          : req.body.suggested_category !== undefined
            ? req.body.suggested_category
            : undefined,
    };

    const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      const values: unknown[] = [];
      const setFragments = entries.map(([key, value], index) => {
        values.push(value);
        return `${key} = $${index + 1}`;
      });
      values.push(now, id, userId);

      await pool.query(
        `UPDATE pending_tasks
         SET ${setFragments.join(', ')}, updated_at = $${entries.length + 1}
         WHERE id = $${entries.length + 2} AND user_id = $${entries.length + 3}`,
        values
      );

      const result = await pool.query('SELECT * FROM pending_tasks WHERE id = $1 AND user_id = $2', [
        id,
        userId,
      ]);
      res.json(result.rows[0] || null);
      return;
    }

    const db = getDatabase();
    const values: unknown[] = [];
    const setFragments = entries.map(([key, value]) => {
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

    const updated = await db.get('SELECT * FROM pending_tasks WHERE id = ? AND user_id = ?', [id, userId]);
    res.json(updated || null);
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

    const pendingTask = await getPendingTaskById(id, userId);
    if (!pendingTask) {
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

    emitPendingTaskUpdated(userId, id, 'deleted');
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting pending task:', error);
    res.status(500).json({ error: 'Failed to delete pending task' });
  }
};
