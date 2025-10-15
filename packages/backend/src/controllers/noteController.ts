import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { v4 as uuidv4 } from 'uuid';

export const createNote = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { title, content, category } = req.body;
    const userId = req.user?.id;

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
          `INSERT INTO notes (id, user_id, title, content, category, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            noteId,
            userId,
            title,
            content || '',
            category || null,
            now,
            now,
          ]
        );

        // Buscar a nota criada com os campos calculados
        const result = await client.query(
          `SELECT n.*, 
                  'owner' as access_level,
                  NULL as shared_by_name,
                  false as is_shared
           FROM notes n
           WHERE n.id = $1`,
          [noteId]
        );
        newNote = result.rows[0];
        
        if (!newNote) {
          throw new Error('Failed to retrieve created note');
        }
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();
      await db.run(
        `INSERT INTO notes (id, user_id, title, content, category, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          noteId,
          userId,
          title,
          content || '',
          category || null,
          now,
          now,
        ]
      );

      // Buscar a nota criada com os campos calculados
      newNote = await db.get(
        `SELECT DISTINCT n.*, 
                CASE 
                  WHEN n.user_id = ? THEN 'owner'
                  ELSE ns.permission
                END as access_level,
                CASE 
                  WHEN n.user_id != ? THEN u.name
                  ELSE NULL
                END as shared_by_name,
                CASE 
                  WHEN n.user_id = ? THEN (
                    SELECT COUNT(*) > 0 
                    FROM note_shares ns2 
                    WHERE ns2.note_id = n.id AND ns2.owner_id = ?
                  )
                  ELSE 0
                END as is_shared
         FROM notes n
         LEFT JOIN note_shares ns ON n.id = ns.note_id AND ns.shared_with_user_id = ?
         LEFT JOIN users u ON n.user_id = u.id
         WHERE n.id = ?`,
        [userId, userId, userId, userId, userId, noteId]
      );
    }

    res.status(201).json(newNote);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ 
      error: 'Failed to create note',
      message: error instanceof Error ? error.message : 'Internal server error'
    });
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
        // Buscar notas próprias e compartilhadas
        const result = await client.query(
          `SELECT DISTINCT n.*, 
                  CASE 
                    WHEN n.user_id = $1 THEN 'owner'
                    ELSE ns.permission
                  END as access_level,
                  CASE 
                    WHEN n.user_id != $1 THEN u.name
                    ELSE NULL
                  END as shared_by_name,
                  CASE 
                    WHEN n.user_id = $1 THEN (
                      SELECT COUNT(*) > 0 
                      FROM note_shares ns2 
                      WHERE ns2.note_id = n.id AND ns2.owner_id = $1
                    )
                    ELSE false
                  END as is_shared
           FROM notes n
           LEFT JOIN note_shares ns ON n.id = ns.note_id AND ns.shared_with_user_id = $1
           LEFT JOIN users u ON n.user_id = u.id
           WHERE n.user_id = $1 OR ns.shared_with_user_id = $1
           ORDER BY n.updated_at DESC`,
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
        `SELECT DISTINCT n.*, 
                CASE 
                  WHEN n.user_id = ? THEN 'owner'
                  ELSE ns.permission
                END as access_level,
                CASE 
                  WHEN n.user_id != ? THEN u.name
                  ELSE NULL
                END as shared_by_name,
                CASE 
                  WHEN n.user_id = ? THEN (
                    SELECT COUNT(*) > 0 
                    FROM note_shares ns2 
                    WHERE ns2.note_id = n.id AND ns2.owner_id = ?
                  )
                  ELSE 0
                END as is_shared
         FROM notes n
         LEFT JOIN note_shares ns ON n.id = ns.note_id AND ns.shared_with_user_id = ?
         LEFT JOIN users u ON n.user_id = u.id
         WHERE n.user_id = ? OR ns.shared_with_user_id = ?
         ORDER BY n.updated_at DESC`,
        [userId, userId, userId, userId, userId, userId, userId]
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
    const { title, content, category } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Verificar permissões de escrita
    let hasWritePermission = false;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Verificar se é o dono da nota
        const ownerResult = await client.query(
          'SELECT id FROM notes WHERE id = $1 AND user_id = $2',
          [id, userId]
        );
        
        if (ownerResult.rows.length > 0) {
          hasWritePermission = true;
        } else {
          // Verificar se tem permissão de escrita via compartilhamento
          const shareResult = await client.query(
            'SELECT id FROM note_shares WHERE note_id = $1 AND shared_with_user_id = $2 AND permission = $3',
            [id, userId, 'write']
          );
          hasWritePermission = shareResult.rows.length > 0;
        }
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      // Verificar se é o dono da nota
      const ownerNote = await db.get('SELECT id FROM notes WHERE id = ? AND user_id = ?', [id, userId]);
      
      if (ownerNote) {
        hasWritePermission = true;
      } else {
        // Verificar se tem permissão de escrita via compartilhamento
        const shareNote = await db.get(
          'SELECT id FROM note_shares WHERE note_id = ? AND shared_with_user_id = ? AND permission = ?',
          [id, userId, 'write']
        );
        hasWritePermission = !!shareNote;
      }
    }

    if (!hasWritePermission) {
      res.status(403).json({ error: 'No write permission for this note' });
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
        // Primeiro verificar se é o dono ou tem permissão de escrita
        let updateQuery;
        let updateParams;
        
        if (hasWritePermission) {
          // Se tem permissão, fazer o update
          if (await client.query('SELECT id FROM notes WHERE id = $1 AND user_id = $2', [id, userId]).then(r => r.rows.length > 0)) {
            // É o dono da nota
            updateQuery = `UPDATE notes 
                          SET title = $1, content = $2, category = $3, updated_at = $4
                          WHERE id = $5 AND user_id = $6`;
            updateParams = [title, content || '', category || null, now, id, userId];
          } else {
            // É um usuário compartilhado com permissão de escrita
            updateQuery = `UPDATE notes 
                          SET title = $1, content = $2, category = $3, updated_at = $4
                          WHERE id = $5`;
            updateParams = [title, content || '', category || null, now, id];
          }
          
          await client.query(updateQuery, updateParams);
        } else {
          throw new Error('No write permission');
        }

        // Buscar a nota atualizada com os campos calculados
        const result = await client.query(
          `SELECT DISTINCT n.*, 
                  CASE 
                    WHEN n.user_id = $1 THEN 'owner'
                    ELSE ns.permission
                  END as access_level,
                  CASE 
                    WHEN n.user_id != $1 THEN u.name
                    ELSE NULL
                  END as shared_by_name,
                  CASE 
                    WHEN n.user_id = $1 THEN (
                      SELECT COUNT(*) > 0 
                      FROM note_shares ns2 
                      WHERE ns2.note_id = n.id AND ns2.owner_id = $1
                    )
                    ELSE false
                  END as is_shared
           FROM notes n
           LEFT JOIN note_shares ns ON n.id = ns.note_id AND ns.shared_with_user_id = $1
           LEFT JOIN users u ON n.user_id = u.id
           WHERE n.id = $2`,
          [userId, id]
        );
        updatedNote = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const db = getDatabase();
      
      if (hasWritePermission) {
        // Verificar se é o dono ou usuário compartilhado
        const ownerNote = await db.get('SELECT id FROM notes WHERE id = ? AND user_id = ?', [id, userId]);
        
        if (ownerNote) {
          // É o dono da nota
          await db.run(
            `UPDATE notes 
             SET title = ?, content = ?, category = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`,
            [title, content || '', category || null, now, id, userId]
          );
        } else {
          // É um usuário compartilhado com permissão de escrita
          await db.run(
            `UPDATE notes 
             SET title = ?, content = ?, category = ?, updated_at = ?
             WHERE id = ?`,
            [title, content || '', category || null, now, id]
          );
        }
      } else {
        throw new Error('No write permission');
      }

      // Buscar a nota atualizada com os campos calculados
      updatedNote = await db.get(
        `SELECT DISTINCT n.*, 
                CASE 
                  WHEN n.user_id = ? THEN 'owner'
                  ELSE ns.permission
                END as access_level,
                CASE 
                  WHEN n.user_id != ? THEN u.name
                  ELSE NULL
                END as shared_by_name,
                CASE 
                  WHEN n.user_id = ? THEN (
                    SELECT COUNT(*) > 0 
                    FROM note_shares ns2 
                    WHERE ns2.note_id = n.id AND ns2.owner_id = ?
                  )
                  ELSE 0
                END as is_shared
         FROM notes n
         LEFT JOIN note_shares ns ON n.id = ns.note_id AND ns.shared_with_user_id = ?
         LEFT JOIN users u ON n.user_id = u.id
         WHERE n.id = ?`,
        [userId, userId, userId, userId, userId, id]
      );
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
