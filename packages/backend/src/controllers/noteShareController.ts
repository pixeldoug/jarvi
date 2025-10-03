import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { v4 as uuidv4 } from 'uuid';

export const shareNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { noteId } = req.params;
    const { sharedWithUserId, permission = 'read' } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!sharedWithUserId) {
      res.status(400).json({ error: 'sharedWithUserId is required' });
      return;
    }

    if (!['read', 'write'].includes(permission)) {
      res.status(400).json({ error: 'Permission must be "read" or "write"' });
      return;
    }

    // Verificar se a nota existe e pertence ao usuário
    let note;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM notes WHERE id = $1 AND user_id = $2',
          [noteId, userId]
        );
        note = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      note = await db.get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
    }

    if (!note) {
      res.status(404).json({ error: 'Note not found or unauthorized' });
      return;
    }

    // Verificar se o usuário existe
    let targetUser;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT id, email, name FROM users WHERE id = $1', [sharedWithUserId]);
        targetUser = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      targetUser = await db.get('SELECT id, email, name FROM users WHERE id = ?', [sharedWithUserId]);
    }

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verificar se já existe compartilhamento
    let existingShare;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM note_shares WHERE note_id = $1 AND shared_with_user_id = $2',
          [noteId, sharedWithUserId]
        );
        existingShare = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      existingShare = await db.get(
        'SELECT * FROM note_shares WHERE note_id = ? AND shared_with_user_id = ?',
        [noteId, sharedWithUserId]
      );
    }

    if (existingShare) {
      res.status(409).json({ error: 'Note already shared with this user' });
      return;
    }

    // Criar compartilhamento
    const shareId = uuidv4();
    const now = new Date().toISOString();

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO note_shares (id, note_id, owner_id, shared_with_user_id, permission, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [shareId, noteId, userId, sharedWithUserId, permission, now]
        );
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      await db.run(
        `INSERT INTO note_shares (id, note_id, owner_id, shared_with_user_id, permission, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [shareId, noteId, userId, sharedWithUserId, permission, now]
      );
    }

    res.status(201).json({
      message: 'Note shared successfully',
      share: {
        id: shareId,
        noteId,
        sharedWith: {
          id: targetUser.id,
          email: targetUser.email,
          name: targetUser.name,
        },
        permission,
        createdAt: now,
      },
    });
  } catch (error) {
    console.error('Error sharing note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSharedNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    let sharedNotes;

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT 
            n.*,
            ns.permission,
            ns.created_at as shared_at,
            u.name as owner_name,
            u.email as owner_email
           FROM notes n
           JOIN note_shares ns ON n.id = ns.note_id
           JOIN users u ON ns.owner_id = u.id
           WHERE ns.shared_with_user_id = $1
           ORDER BY ns.created_at DESC`,
          [userId]
        );
        sharedNotes = result.rows;
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      sharedNotes = await db.all(
        `SELECT 
          n.*,
          ns.permission,
          ns.created_at as shared_at,
          u.name as owner_name,
          u.email as owner_email
         FROM notes n
         JOIN note_shares ns ON n.id = ns.note_id
         JOIN users u ON ns.owner_id = u.id
         WHERE ns.shared_with_user_id = ?
         ORDER BY ns.created_at DESC`,
        [userId]
      );
    }

    res.json(sharedNotes);
  } catch (error) {
    console.error('Error fetching shared notes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getNoteShares = async (req: Request, res: Response): Promise<void> => {
  try {
    const { noteId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Verificar se a nota pertence ao usuário
    let note;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM notes WHERE id = $1 AND user_id = $2',
          [noteId, userId]
        );
        note = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      note = await db.get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
    }

    if (!note) {
      res.status(404).json({ error: 'Note not found or unauthorized' });
      return;
    }

    // Buscar compartilhamentos
    let shares;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT 
            ns.*,
            u.name as shared_with_name,
            u.email as shared_with_email
           FROM note_shares ns
           JOIN users u ON ns.shared_with_user_id = u.id
           WHERE ns.note_id = $1
           ORDER BY ns.created_at DESC`,
          [noteId]
        );
        shares = result.rows;
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      shares = await db.all(
        `SELECT 
          ns.*,
          u.name as shared_with_name,
          u.email as shared_with_email
         FROM note_shares ns
         JOIN users u ON ns.shared_with_user_id = u.id
         WHERE ns.note_id = ?
         ORDER BY ns.created_at DESC`,
        [noteId]
      );
    }

    res.json(shares);
  } catch (error) {
    console.error('Error fetching note shares:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateSharePermission = async (req: Request, res: Response): Promise<void> => {
  try {
    const { noteId, shareId } = req.params;
    const { permission } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!['read', 'write'].includes(permission)) {
      res.status(400).json({ error: 'Permission must be "read" or "write"' });
      return;
    }

    // Verificar se a nota pertence ao usuário
    let note;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM notes WHERE id = $1 AND user_id = $2',
          [noteId, userId]
        );
        note = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      note = await db.get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
    }

    if (!note) {
      res.status(404).json({ error: 'Note not found or unauthorized' });
      return;
    }

    // Atualizar permissão do compartilhamento
    let updatedShare;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          `UPDATE note_shares 
           SET permission = $1 
           WHERE id = $2 AND note_id = $3 AND owner_id = $4 
           RETURNING *`,
          [permission, shareId, noteId, userId]
        );
        updatedShare = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      await db.run(
        'UPDATE note_shares SET permission = ? WHERE id = ? AND note_id = ? AND owner_id = ?',
        [permission, shareId, noteId, userId]
      );
      updatedShare = await db.get(
        'SELECT * FROM note_shares WHERE id = ? AND note_id = ? AND owner_id = ?',
        [shareId, noteId, userId]
      );
    }

    if (!updatedShare) {
      res.status(404).json({ error: 'Share not found or unauthorized' });
      return;
    }

    res.json({ message: 'Share permission updated successfully', share: updatedShare });
  } catch (error) {
    console.error('Error updating share permission:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const unshareNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { noteId, shareId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Verificar se a nota pertence ao usuário
    let note;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM notes WHERE id = $1 AND user_id = $2',
          [noteId, userId]
        );
        note = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      note = await db.get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [noteId, userId]);
    }

    if (!note) {
      res.status(404).json({ error: 'Note not found or unauthorized' });
      return;
    }

    // Remover compartilhamento
    let deletedShare;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          `DELETE FROM note_shares 
           WHERE id = $1 AND note_id = $2 AND owner_id = $3 
           RETURNING *`,
          [shareId, noteId, userId]
        );
        deletedShare = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      deletedShare = await db.get(
        'SELECT * FROM note_shares WHERE id = ? AND note_id = ? AND owner_id = ?',
        [shareId, noteId, userId]
      );
      if (deletedShare) {
        await db.run(
          'DELETE FROM note_shares WHERE id = ? AND note_id = ? AND owner_id = ?',
          [shareId, noteId, userId]
        );
      }
    }

    if (!deletedShare) {
      res.status(404).json({ error: 'Share not found or unauthorized' });
      return;
    }

    res.json({ message: 'Note unshared successfully', deletedShare });
  } catch (error) {
    console.error('Error unsharing note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const searchUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const searchTerm = `%${q}%`;
    let users;

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT id, name, email 
           FROM users 
           WHERE (name ILIKE $1 OR email ILIKE $1) 
           AND id != $2 
           ORDER BY name ASC 
           LIMIT 10`,
          [searchTerm, userId]
        );
        users = result.rows;
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      users = await db.all(
        `SELECT id, name, email 
         FROM users 
         WHERE (name LIKE ? OR email LIKE ?) 
         AND id != ? 
         ORDER BY name ASC 
         LIMIT 10`,
        [searchTerm, searchTerm, userId]
      );
    }

    res.json(users);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
