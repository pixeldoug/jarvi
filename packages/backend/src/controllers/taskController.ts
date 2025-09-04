import { Request, Response } from 'express';
import { getDatabase } from '../database';
import { v4 as uuidv4 } from 'uuid';

export const createTask = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { title, description, priority, category, dueDate } = req.body;
    const userId = req.user?.id; // Will come from auth middleware

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const db = getDatabase();
    const taskId = uuidv4();
    const now = new Date().toISOString();

    await db.run(
      `
      INSERT INTO tasks (id, user_id, title, description, priority, category, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        taskId,
        userId,
        title,
        description || null,
        priority || 'medium',
        category || null,
        dueDate || null,
        now,
        now,
      ]
    );

    const newTask = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);

    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const db = getDatabase();
    const tasks = await db.all(
      `
      SELECT * FROM tasks 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `,
      [userId]
    );

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateTask = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, completed, priority, category, dueDate } =
      req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const db = getDatabase();
    const now = new Date().toISOString();

    // Check if task exists and belongs to user
    const existingTask = await db.get(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    await db.run(
      `
      UPDATE tasks 
      SET title = ?, description = ?, completed = ?, priority = ?, category = ?, due_date = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `,
      [
        title || existingTask.title,
        description !== undefined ? description : existingTask.description,
        completed !== undefined ? completed : existingTask.completed,
        priority || existingTask.priority,
        category !== undefined ? category : existingTask.category,
        dueDate !== undefined ? dueDate : existingTask.due_date,
        now,
        id,
        userId,
      ]
    );

    const updatedTask = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteTask = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const db = getDatabase();

    // Check if task exists and belongs to user
    const existingTask = await db.get(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    await db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, userId]);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const toggleTaskCompletion = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const db = getDatabase();

    // Check if task exists and belongs to user
    const existingTask = await db.get(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const newCompletedStatus = !existingTask.completed;
    const now = new Date().toISOString();

    await db.run(
      `
      UPDATE tasks 
      SET completed = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `,
      [newCompletedStatus, now, id, userId]
    );

    const updatedTask = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    res.json(updatedTask);
  } catch (error) {
    console.error('Error toggling task completion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
