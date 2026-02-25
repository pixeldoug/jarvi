import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { v4 as uuidv4 } from 'uuid';

export const getSubTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Verify the parent task belongs to this user
        const taskCheck = await client.query(
          'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
          [taskId, userId]
        );
        if (taskCheck.rows.length === 0) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }

        const result = await client.query(
          'SELECT * FROM task_subtasks WHERE task_id = $1 AND user_id = $2 ORDER BY created_at ASC',
          [taskId, userId]
        );
        res.json(result.rows);
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      const taskCheck = await db.get(
        'SELECT id FROM tasks WHERE id = ? AND user_id = ?',
        [taskId, userId]
      );
      if (!taskCheck) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const subtasks = await db.all(
        'SELECT * FROM task_subtasks WHERE task_id = ? AND user_id = ? ORDER BY created_at ASC',
        [taskId, userId]
      );
      res.json(subtasks);
    }
  } catch (error) {
    console.error('Error fetching subtasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createSubTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const { title } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!title || !title.trim()) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const subtaskId = uuidv4();
    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const taskCheck = await client.query(
          'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
          [taskId, userId]
        );
        if (taskCheck.rows.length === 0) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }

        await client.query(
          `INSERT INTO task_subtasks (id, task_id, user_id, title, completed, created_at, updated_at)
           VALUES ($1, $2, $3, $4, FALSE, $5, $6)`,
          [subtaskId, taskId, userId, title.trim(), now, now]
        );

        const result = await client.query(
          'SELECT * FROM task_subtasks WHERE id = $1',
          [subtaskId]
        );
        res.status(201).json(result.rows[0]);
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      const taskCheck = await db.get(
        'SELECT id FROM tasks WHERE id = ? AND user_id = ?',
        [taskId, userId]
      );
      if (!taskCheck) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      await db.run(
        `INSERT INTO task_subtasks (id, task_id, user_id, title, completed, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [subtaskId, taskId, userId, title.trim(), now, now]
      );

      const newSubtask = await db.get(
        'SELECT * FROM task_subtasks WHERE id = ?',
        [subtaskId]
      );
      res.status(201).json(newSubtask);
    }
  } catch (error) {
    console.error('Error creating subtask:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateSubTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId, id } = req.params;
    const { title } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!title || !title.trim()) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          `UPDATE task_subtasks SET title = $1, updated_at = $2
           WHERE id = $3 AND task_id = $4 AND user_id = $5
           RETURNING *`,
          [title.trim(), now, id, taskId, userId]
        );
        if (result.rows.length === 0) {
          res.status(404).json({ error: 'Subtask not found' });
          return;
        }
        res.json(result.rows[0]);
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      await db.run(
        `UPDATE task_subtasks SET title = ?, updated_at = ?
         WHERE id = ? AND task_id = ? AND user_id = ?`,
        [title.trim(), now, id, taskId, userId]
      );
      const updated = await db.get(
        'SELECT * FROM task_subtasks WHERE id = ?',
        [id]
      );
      if (!updated) {
        res.status(404).json({ error: 'Subtask not found' });
        return;
      }
      res.json(updated);
    }
  } catch (error) {
    console.error('Error updating subtask:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const toggleSubTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId, id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const existing = await client.query(
          'SELECT * FROM task_subtasks WHERE id = $1 AND task_id = $2 AND user_id = $3',
          [id, taskId, userId]
        );
        if (existing.rows.length === 0) {
          res.status(404).json({ error: 'Subtask not found' });
          return;
        }

        const result = await client.query(
          `UPDATE task_subtasks SET completed = $1, updated_at = $2
           WHERE id = $3 AND task_id = $4 AND user_id = $5
           RETURNING *`,
          [!existing.rows[0].completed, now, id, taskId, userId]
        );
        res.json(result.rows[0]);
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      const existing = await db.get(
        'SELECT * FROM task_subtasks WHERE id = ? AND task_id = ? AND user_id = ?',
        [id, taskId, userId]
      );
      if (!existing) {
        res.status(404).json({ error: 'Subtask not found' });
        return;
      }

      await db.run(
        `UPDATE task_subtasks SET completed = ?, updated_at = ?
         WHERE id = ? AND task_id = ? AND user_id = ?`,
        [existing.completed ? 0 : 1, now, id, taskId, userId]
      );
      const updated = await db.get(
        'SELECT * FROM task_subtasks WHERE id = ?',
        [id]
      );
      res.json(updated);
    }
  } catch (error) {
    console.error('Error toggling subtask:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteSubTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId, id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          'DELETE FROM task_subtasks WHERE id = $1 AND task_id = $2 AND user_id = $3 RETURNING id',
          [id, taskId, userId]
        );
        if (result.rows.length === 0) {
          res.status(404).json({ error: 'Subtask not found' });
          return;
        }
        res.json({ message: 'Subtask deleted successfully' });
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      const existing = await db.get(
        'SELECT id FROM task_subtasks WHERE id = ? AND task_id = ? AND user_id = ?',
        [id, taskId, userId]
      );
      if (!existing) {
        res.status(404).json({ error: 'Subtask not found' });
        return;
      }

      await db.run(
        'DELETE FROM task_subtasks WHERE id = ? AND task_id = ? AND user_id = ?',
        [id, taskId, userId]
      );
      res.json({ message: 'Subtask deleted successfully' });
    }
  } catch (error) {
    console.error('Error deleting subtask:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
