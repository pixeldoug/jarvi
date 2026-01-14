import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { v4 as uuidv4 } from 'uuid';

// Get all categories for the authenticated user
export const getCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    let categories;
    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query(
        'SELECT * FROM categories WHERE user_id = $1 ORDER BY name ASC',
        [userId]
      );
      categories = result.rows;
    } else {
      const db = getDatabase();
      categories = await db.all(
        'SELECT * FROM categories WHERE user_id = ? ORDER BY name ASC',
        [userId]
      );
    }

    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new category
export const createCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, color, icon } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const categoryId = uuidv4();
    const now = new Date().toISOString();
    const trimmedName = name.trim();

    let newCategory;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO categories (id, user_id, name, color, icon, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [categoryId, userId, trimmedName, color || null, icon || null, now, now]
        );
        const result = await client.query('SELECT * FROM categories WHERE id = $1', [categoryId]);
        newCategory = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      await db.run(
        `INSERT INTO categories (id, user_id, name, color, icon, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [categoryId, userId, trimmedName, color || null, icon || null, now, now]
      );
      newCategory = await db.get('SELECT * FROM categories WHERE id = ?', [categoryId]);
    }

    res.status(201).json(newCategory);
  } catch (error: any) {
    // Handle unique constraint violation
    if (error.code === '23505' || error.message?.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Category with this name already exists' });
      return;
    }
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a category
export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, color, icon } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const now = new Date().toISOString();

    let updatedCategory;
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        // Check if category exists and belongs to user
        const existingResult = await client.query(
          'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
          [id, userId]
        );

        if (existingResult.rows.length === 0) {
          res.status(404).json({ error: 'Category not found' });
          return;
        }

        const existingCategory = existingResult.rows[0];

        await client.query(
          `UPDATE categories 
           SET name = $1, color = $2, icon = $3, updated_at = $4
           WHERE id = $5 AND user_id = $6`,
          [
            name?.trim() || existingCategory.name,
            color !== undefined ? color : existingCategory.color,
            icon !== undefined ? icon : existingCategory.icon,
            now,
            id,
            userId,
          ]
        );

        const result = await client.query('SELECT * FROM categories WHERE id = $1', [id]);
        updatedCategory = result.rows[0];
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      
      // Check if category exists and belongs to user
      const existingCategory = await db.get(
        'SELECT * FROM categories WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!existingCategory) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      await db.run(
        `UPDATE categories 
         SET name = ?, color = ?, icon = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          name?.trim() || existingCategory.name,
          color !== undefined ? color : existingCategory.color,
          icon !== undefined ? icon : existingCategory.icon,
          now,
          id,
          userId,
        ]
      );

      updatedCategory = await db.get('SELECT * FROM categories WHERE id = ?', [id]);
    }

    res.json(updatedCategory);
  } catch (error: any) {
    // Handle unique constraint violation
    if (error.code === '23505' || error.message?.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Category with this name already exists' });
      return;
    }
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a category
export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
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
        // Check if category exists
        const existingResult = await client.query(
          'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
          [id, userId]
        );

        if (existingResult.rows.length === 0) {
          res.status(404).json({ error: 'Category not found' });
          return;
        }

        await client.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [id, userId]);
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      
      // Check if category exists
      const existingCategory = await db.get(
        'SELECT * FROM categories WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!existingCategory) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      await db.run('DELETE FROM categories WHERE id = ? AND user_id = ?', [id, userId]);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


