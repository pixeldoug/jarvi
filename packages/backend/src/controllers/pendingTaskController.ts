import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import {
  type PendingTaskRecord,
  type PendingTaskUpdateInput,
  confirmPending,
  deletePendingTaskRow,
  getPendingTaskById,
  rejectPending,
  updatePendingTaskFields,
} from '../services/pendingTaskService';

const pickFirstString = (...candidates: unknown[]): string | undefined => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate;
  }
  return undefined;
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

    const task = await confirmPending(pendingTask);
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

    await rejectPending(pendingTask);
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

    const titleCandidate = pickFirstString(req.body.title, req.body.suggested_title);
    const updates: PendingTaskUpdateInput = {
      title: titleCandidate !== undefined ? titleCandidate.trim() : undefined,
      description: pickFirstString(req.body.description, req.body.suggested_description),
      priority: pickFirstString(req.body.priority, req.body.suggested_priority),
      due_date: pickFirstString(
        req.body.dueDate,
        req.body.due_date,
        req.body.suggested_due_date,
      ),
      time: pickFirstString(req.body.time, req.body.suggested_time),
      category: pickFirstString(req.body.category, req.body.suggested_category),
    };

    if (Object.values(updates).every((v) => v === undefined)) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const updated = await updatePendingTaskFields(id, userId, updates);
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

    await deletePendingTaskRow(id, userId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting pending task:', error);
    res.status(500).json({ error: 'Failed to delete pending task' });
  }
};
