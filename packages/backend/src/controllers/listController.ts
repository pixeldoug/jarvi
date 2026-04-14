import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { v4 as uuidv4 } from 'uuid';

function safeParseCategoryNames(raw: unknown): string[] {
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
    return raw;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        return parsed;
      }
    } catch {
      return [];
    }
  }
  return [];
}

// Get all lists for the authenticated user
export const getLists = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    let lists: any[] = [];
    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query(
        'SELECT * FROM lists WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      lists = result.rows;
    } else {
      const db = getDatabase();
      lists = await db.all('SELECT * FROM lists WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    }

    const normalized = lists.map(normalizeList);

    res.json(normalized);
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

function normalizeList(raw: any) {
  return {
    ...raw,
    category_names: safeParseCategoryNames(raw?.category_names),
    show_completed: raw?.show_completed === undefined ? true : Boolean(raw.show_completed),
    filter_no_category: Boolean(raw?.filter_no_category),
  };
}

// Create a new list
export const createList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, categoryNames, priority, connectedApp, showCompleted, filterNoCategory } = req.body as {
      name?: string;
      description?: string;
      categoryNames?: string[];
      priority?: string;
      connectedApp?: string;
      showCompleted?: boolean;
      filterNoCategory?: boolean;
    };
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const trimmedName = name?.trim();
    if (!trimmedName) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const cleanedCategoryNames = Array.isArray(categoryNames)
      ? Array.from(new Set(categoryNames.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean)))
      : [];

    // Require at least one filter criterion
    const hasPriority = !!priority;
    const hasConnectedApp = !!connectedApp;
    const hasFilterNoCategory = !!filterNoCategory;
    if (cleanedCategoryNames.length === 0 && !hasPriority && !hasConnectedApp && !hasFilterNoCategory) {
      res.status(400).json({ error: 'At least one filter criterion (category, priority, connected app, or no-category) is required' });
      return;
    }

    const listId = uuidv4();
    const now = new Date().toISOString();
    const categoryNamesJson = JSON.stringify(cleanedCategoryNames);
    const showCompletedValue = showCompleted === false ? 0 : 1;
    const filterNoCategoryValue = filterNoCategory ? 1 : 0;

    let newList: any;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO lists (id, user_id, name, description, category_names, priority, connected_app, show_completed, filter_no_category, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [listId, userId, trimmedName, description?.trim() || null, categoryNamesJson, priority || null, connectedApp || null, showCompletedValue, filterNoCategoryValue, now, now]
        );
        const result = await client.query('SELECT * FROM lists WHERE id = $1', [listId]);
        newList = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      await db.run(
        `INSERT INTO lists (id, user_id, name, description, category_names, priority, connected_app, show_completed, filter_no_category, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [listId, userId, trimmedName, description?.trim() || null, categoryNamesJson, priority || null, connectedApp || null, showCompletedValue, filterNoCategoryValue, now, now]
      );
      newList = await db.get('SELECT * FROM lists WHERE id = ?', [listId]);
    }

    res.status(201).json(normalizeList(newList));
  } catch (error: any) {
    // Handle unique constraint violation
    if (error.code === '23505' || error.message?.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'List with this name already exists' });
      return;
    }
    console.error('Error creating list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a list
export const updateList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, categoryNames, priority, connectedApp, showCompleted, filterNoCategory } = req.body as {
      name?: string;
      description?: string;
      categoryNames?: string[];
      priority?: string | null;
      connectedApp?: string | null;
      showCompleted?: boolean;
      filterNoCategory?: boolean;
    };
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const now = new Date().toISOString();

    const maybeCategoryNamesJson =
      Array.isArray(categoryNames)
        ? JSON.stringify(
            Array.from(
              new Set(categoryNames.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean))
            )
          )
        : undefined;

    let updatedList: any;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const existingResult = await client.query(
          'SELECT * FROM lists WHERE id = $1 AND user_id = $2',
          [id, userId]
        );

        if (existingResult.rows.length === 0) {
          res.status(404).json({ error: 'List not found' });
          return;
        }

        const existing = existingResult.rows[0];

        await client.query(
          `UPDATE lists
           SET name = $1,
               description = $2,
               category_names = $3,
               priority = $4,
               connected_app = $5,
               show_completed = $6,
               filter_no_category = $7,
               updated_at = $8
           WHERE id = $9 AND user_id = $10`,
          [
            name?.trim() || existing.name,
            description !== undefined ? description?.trim() || null : existing.description,
            maybeCategoryNamesJson !== undefined ? maybeCategoryNamesJson : existing.category_names,
            priority !== undefined ? (priority || null) : existing.priority,
            connectedApp !== undefined ? (connectedApp || null) : existing.connected_app,
            showCompleted !== undefined ? (showCompleted ? 1 : 0) : existing.show_completed,
            filterNoCategory !== undefined ? (filterNoCategory ? 1 : 0) : (existing.filter_no_category ?? 0),
            now,
            id,
            userId,
          ]
        );

        const result = await client.query('SELECT * FROM lists WHERE id = $1', [id]);
        updatedList = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      const existing = await db.get('SELECT * FROM lists WHERE id = ? AND user_id = ?', [id, userId]);

      if (!existing) {
        res.status(404).json({ error: 'List not found' });
        return;
      }

      await db.run(
        `UPDATE lists
         SET name = ?,
             description = ?,
             category_names = ?,
             priority = ?,
             connected_app = ?,
             show_completed = ?,
             filter_no_category = ?,
             updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          name?.trim() || existing.name,
          description !== undefined ? description?.trim() || null : existing.description,
          maybeCategoryNamesJson !== undefined ? maybeCategoryNamesJson : existing.category_names,
          priority !== undefined ? (priority || null) : existing.priority,
          connectedApp !== undefined ? (connectedApp || null) : existing.connected_app,
          showCompleted !== undefined ? (showCompleted ? 1 : 0) : existing.show_completed,
          filterNoCategory !== undefined ? (filterNoCategory ? 1 : 0) : (existing.filter_no_category ?? 0),
          now,
          id,
          userId,
        ]
      );

      updatedList = await db.get('SELECT * FROM lists WHERE id = ?', [id]);
    }

    res.json(normalizeList(updatedList));
  } catch (error: any) {
    // Handle unique constraint violation
    if (error.code === '23505' || error.message?.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'List with this name already exists' });
      return;
    }
    console.error('Error updating list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a list
export const deleteList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const existingResult = await client.query(
          'SELECT id FROM lists WHERE id = $1 AND user_id = $2',
          [id, userId]
        );

        if (existingResult.rows.length === 0) {
          res.status(404).json({ error: 'List not found' });
          return;
        }

        await client.query('DELETE FROM lists WHERE id = $1 AND user_id = $2', [id, userId]);
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      const existing = await db.get('SELECT id FROM lists WHERE id = ? AND user_id = ?', [id, userId]);
      if (!existing) {
        res.status(404).json({ error: 'List not found' });
        return;
      }

      await db.run('DELETE FROM lists WHERE id = ? AND user_id = ?', [id, userId]);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

