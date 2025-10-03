import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { v4 as uuidv4 } from 'uuid';

export const createTask = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { title, description, priority, category, important, time, dueDate, recurrence_type, recurrence_config } = req.body;
    const userId = req.user?.id; // Will come from auth middleware
    
    // Debug: log received data (simplified)
    console.log('createTask - Creating task:', title);

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const taskId = uuidv4();
    const now = new Date().toISOString();
    let newTask;

    if (isPostgreSQL()) {
      // PostgreSQL
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Inserir diretamente (colunas já existem)
        await client.query(
          `INSERT INTO tasks (id, user_id, title, description, priority, category, important, time, due_date, recurrence_type, recurrence_config, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            taskId,
            userId,
            title,
            description || null,
            priority || 'medium',
            category || null,
            important || false,
            time || null,
            dueDate || null,
            recurrence_type || 'none',
            recurrence_config || null,
            now,
            now,
          ]
        );

        const result = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
        newTask = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();
      await db.run(
        `INSERT INTO tasks (id, user_id, title, description, priority, category, important, time, due_date, recurrence_type, recurrence_config, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          taskId,
          userId,
          title,
          description || null,
          priority || 'medium',
          category || null,
          important || false,
          time || null,
          dueDate || null,
          recurrence_type || 'none',
          recurrence_config || null,
          now,
          now,
        ]
      );

      newTask = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    }

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

    let tasks;

    if (isPostgreSQL()) {
      // PostgreSQL
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM tasks 
           WHERE user_id = $1 
           ORDER BY created_at DESC`,
          [userId]
        );
        tasks = result.rows;
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();
      tasks = await db.all(
        `SELECT * FROM tasks 
         WHERE user_id = ? 
         ORDER BY created_at DESC`,
        [userId]
      );
    }

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
    const { title, description, completed, priority, category, important, time, dueDate } =
      req.body;
    const userId = req.user?.id;

    // Debug: log received data
    console.log('updateTask - Received data:', {
      id,
      title,
      description,
      completed,
      priority,
      category,
      important,
      time,
      dueDate,
      userId,
      serverTime: new Date().toISOString(),
      serverLocalTime: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    });

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const now = new Date().toISOString();
    let existingTask;
    let updatedTask;

    if (isPostgreSQL()) {
      // PostgreSQL
      console.log('Using PostgreSQL for updateTask');
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Check if task exists and belongs to user
        const existingResult = await client.query(
          'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
          [id, userId]
        );

        if (existingResult.rows.length === 0) {
          console.log('Task not found for id:', id, 'user:', userId);
          res.status(404).json({ error: 'Task not found' });
          return;
        }

        existingTask = existingResult.rows[0];
        console.log('Found existing task:', existingTask);

        // Tentar atualizar com coluna time, se falhar, atualizar sem ela
        try {
          console.log('Attempting to update with time column');
          // Converter strings vazias para null para campos de timestamp
          const timeValue = time !== undefined ? (time === '' ? null : time) : existingTask.time;
          const dueDateValue = dueDate !== undefined ? (dueDate === '' ? null : dueDate) : existingTask.due_date;
          
          await client.query(
            `UPDATE tasks 
             SET title = $1, description = $2, completed = $3, priority = $4, category = $5, important = $6, time = $7, due_date = $8, updated_at = $9
             WHERE id = $10 AND user_id = $11`,
            [
              title || existingTask.title,
              description !== undefined ? description : existingTask.description,
              completed !== undefined ? completed : existingTask.completed,
              priority || existingTask.priority,
              category !== undefined ? category : existingTask.category,
              important !== undefined ? important : existingTask.important,
              timeValue,
              dueDateValue,
              now,
              id,
              userId,
            ]
          );
          console.log('Successfully updated with time column');
        } catch (timeColumnError) {
          // Se falhar (coluna time não existe), atualizar sem a coluna time
          console.log('Time column not found, updating without time field. Error:', timeColumnError);
          // Converter strings vazias para null para campos de timestamp
          const dueDateValue = dueDate !== undefined ? (dueDate === '' ? null : dueDate) : existingTask.due_date;
          
          await client.query(
            `UPDATE tasks 
             SET title = $1, description = $2, completed = $3, priority = $4, category = $5, important = $6, due_date = $7, updated_at = $8
             WHERE id = $9 AND user_id = $10`,
            [
              title || existingTask.title,
              description !== undefined ? description : existingTask.description,
              completed !== undefined ? completed : existingTask.completed,
              priority || existingTask.priority,
              category !== undefined ? category : existingTask.category,
              important !== undefined ? important : existingTask.important,
              dueDateValue,
              now,
              id,
              userId,
            ]
          );
          console.log('Successfully updated without time column');
        }

        const result = await client.query('SELECT * FROM tasks WHERE id = $1', [id]);
        updatedTask = result.rows[0];
        console.log('Updated task result:', updatedTask);
      } finally {
        client.release();
      }
    } else {
      // SQLite
      console.log('Using SQLite for updateTask');
      const db = getDatabase();
      
      // Check if task exists and belongs to user
      existingTask = await db.get(
        'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!existingTask) {
        console.log('Task not found for id:', id, 'user:', userId);
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      console.log('Found existing task:', existingTask);

      // Converter strings vazias para null para campos de timestamp
      const timeValue = time !== undefined ? (time === '' ? null : time) : existingTask.time;
      const dueDateValue = dueDate !== undefined ? (dueDate === '' ? null : dueDate) : existingTask.due_date;

      await db.run(
        `UPDATE tasks 
         SET title = ?, description = ?, completed = ?, priority = ?, category = ?, important = ?, time = ?, due_date = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          title || existingTask.title,
          description !== undefined ? description : existingTask.description,
          completed !== undefined ? completed : existingTask.completed,
          priority || existingTask.priority,
          category !== undefined ? category : existingTask.category,
          important !== undefined ? important : existingTask.important,
          timeValue,
          dueDateValue,
          now,
          id,
          userId,
        ]
      );

      updatedTask = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
      console.log('Updated task result:', updatedTask);
    }

    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
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

    let existingTask;

    if (isPostgreSQL()) {
      // PostgreSQL
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Check if task exists and belongs to user
        const existingResult = await client.query(
          'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
          [id, userId]
        );

        if (existingResult.rows.length === 0) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }

        await client.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [
          id,
          userId,
        ]);
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();

      // Check if task exists and belongs to user
      existingTask = await db.get(
        'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!existingTask) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      await db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, userId]);
    }

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

    const now = new Date().toISOString();
    let existingTask;
    let updatedTask;

    if (isPostgreSQL()) {
      // PostgreSQL
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Check if task exists and belongs to user
        const existingResult = await client.query(
          'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
          [id, userId]
        );

        if (existingResult.rows.length === 0) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }

        existingTask = existingResult.rows[0];
        const newCompletedStatus = !existingTask.completed;

        await client.query(
          `UPDATE tasks 
           SET completed = $1, updated_at = $2
           WHERE id = $3 AND user_id = $4`,
          [newCompletedStatus, now, id, userId]
        );

        const result = await client.query('SELECT * FROM tasks WHERE id = $1', [id]);
        updatedTask = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();

      // Check if task exists and belongs to user
      existingTask = await db.get(
        'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!existingTask) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const newCompletedStatus = !existingTask.completed;

      await db.run(
        `UPDATE tasks 
         SET completed = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [newCompletedStatus, now, id, userId]
      );

      updatedTask = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    }

    res.json(updatedTask);
  } catch (error) {
    console.error('Error toggling task completion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
