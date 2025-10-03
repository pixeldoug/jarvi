import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { v4 as uuidv4 } from 'uuid';

export const createNote = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { title, content } = req.body;
    const userId = req.user?.id;
    
    console.log('createNote - Creating note:', title);

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const noteId = uuidv4();
    const now = new Date().toISOString();
    let newNote;

    if (isPostgreSQL()) {
      // PostgreSQL
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO notes (id, user_id, title, content, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            noteId,
            userId,
            title,
            content || '',
            now,
            now,
          ]
        );

        const result = await client.query('SELECT * FROM notes WHERE id = $1', [noteId]);
        newNote = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();
      await db.run(
        `INSERT INTO notes (id, user_id, title, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          noteId,
          userId,
          title,
          content || '',
          now,
          now,
        ]
      );

      newNote = await db.get('SELECT * FROM notes WHERE id = ?', [noteId]);
    }

    res.status(201).json(newNote);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    let notes;

    if (isPostgreSQL()) {
      // PostgreSQL
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM notes 
           WHERE user_id = $1 
           ORDER BY updated_at DESC`,
          [userId]
        );
        notes = result.rows;
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();
      notes = await db.all(
        `SELECT * FROM notes 
         WHERE user_id = ? 
         ORDER BY updated_at DESC`,
        [userId]
      );
    }

    res.json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateNote = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const now = new Date().toISOString();
    let updatedNote;

    if (isPostgreSQL()) {
      // PostgreSQL
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query(
          `UPDATE notes 
           SET title = $1, content = $2, updated_at = $3
           WHERE id = $4 AND user_id = $5`,
          [title, content || '', now, id, userId]
        );

        const result = await client.query('SELECT * FROM notes WHERE id = $1', [id]);
        updatedNote = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();
      await db.run(
        `UPDATE notes 
         SET title = ?, content = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [title, content || '', now, id, userId]
      );

      updatedNote = await db.get('SELECT * FROM notes WHERE id = ?', [id]);
    }

    if (!updatedNote) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    res.json(updatedNote);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteNote = async (
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

    let deletedNote;

    if (isPostgreSQL()) {
      // PostgreSQL
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM notes WHERE id = $1 AND user_id = $2',
          [id, userId]
        );
        deletedNote = result.rows[0];

        if (deletedNote) {
          await client.query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [id, userId]);
        }
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();
      deletedNote = await db.get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [id, userId]);

      if (deletedNote) {
        await db.run('DELETE FROM notes WHERE id = ? AND user_id = ?', [id, userId]);
      }
    }

    if (!deletedNote) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    res.json(deletedNote);
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
