import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { v4 as uuidv4 } from 'uuid';

const normalizeCategoryName = (name: string): string => name.trim().toLowerCase();

const parseCategoryNames = (raw: unknown): string[] => {
  if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) {
    return raw;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed;
      }
    } catch {
      return [];
    }
  }

  return [];
};

const sanitizeCategoryNames = (categoryNames: string[]): string[] => {
  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const categoryName of categoryNames) {
    const trimmed = categoryName.trim();
    if (!trimmed) continue;

    const normalized = normalizeCategoryName(trimmed);
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    sanitized.push(trimmed);
  }

  return sanitized;
};

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
      let transactionStarted = false;
      try {
        await client.query('BEGIN');
        transactionStarted = true;

        // Check if category exists and belongs to user
        const existingResult = await client.query(
          'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
          [id, userId]
        );

        if (existingResult.rows.length === 0) {
          await client.query('ROLLBACK');
          transactionStarted = false;
          res.status(404).json({ error: 'Category not found' });
          return;
        }

        const existingCategory = existingResult.rows[0];
        const previousCategoryName = existingCategory.name;
        const nextCategoryName = name?.trim() || existingCategory.name;

        await client.query(
          `UPDATE categories 
           SET name = $1, color = $2, icon = $3, updated_at = $4
           WHERE id = $5 AND user_id = $6`,
          [
            nextCategoryName,
            color !== undefined ? color : existingCategory.color,
            icon !== undefined ? icon : existingCategory.icon,
            now,
            id,
            userId,
          ]
        );

        const previousCategoryNameNormalized = normalizeCategoryName(previousCategoryName);
        const nextCategoryNameNormalized = normalizeCategoryName(nextCategoryName);
        const shouldSyncCategoryReferences =
          previousCategoryName !== nextCategoryName ||
          previousCategoryNameNormalized !== nextCategoryNameNormalized;

        if (shouldSyncCategoryReferences) {
          await client.query(
            `UPDATE tasks
             SET category = $1, updated_at = $2
             WHERE user_id = $3
               AND category IS NOT NULL
               AND LOWER(TRIM(category)) = $4`,
            [nextCategoryName, now, userId, previousCategoryNameNormalized]
          );

          await client.query(
            `UPDATE notes
             SET category = $1, updated_at = $2
             WHERE user_id = $3
               AND category IS NOT NULL
               AND LOWER(TRIM(category)) = $4`,
            [nextCategoryName, now, userId, previousCategoryNameNormalized]
          );

          const listsResult = await client.query(
            'SELECT id, category_names FROM lists WHERE user_id = $1',
            [userId]
          );

          for (const list of listsResult.rows) {
            const parsedCategoryNames = parseCategoryNames(list.category_names);
            if (parsedCategoryNames.length === 0) continue;

            let hasChanges = false;
            const updatedCategoryNames = parsedCategoryNames.map((categoryName) => {
              if (normalizeCategoryName(categoryName) === previousCategoryNameNormalized) {
                hasChanges = true;
                return nextCategoryName;
              }
              return categoryName;
            });

            if (!hasChanges) continue;

            await client.query(
              `UPDATE lists
               SET category_names = $1, updated_at = $2
               WHERE id = $3 AND user_id = $4`,
              [JSON.stringify(sanitizeCategoryNames(updatedCategoryNames)), now, list.id, userId]
            );
          }
        }

        const result = await client.query('SELECT * FROM categories WHERE id = $1', [id]);
        updatedCategory = result.rows[0];

        await client.query('COMMIT');
        transactionStarted = false;
      } catch (error) {
        if (transactionStarted) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            console.error('Error rolling back category update transaction:', rollbackError);
          }
        }
        throw error;
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      let transactionStarted = false;
      await db.exec('BEGIN');
      transactionStarted = true;
      
      try {
        // Check if category exists and belongs to user
        const existingCategory = await db.get(
          'SELECT * FROM categories WHERE id = ? AND user_id = ?',
          [id, userId]
        );

        if (!existingCategory) {
          await db.exec('ROLLBACK');
          transactionStarted = false;
          res.status(404).json({ error: 'Category not found' });
          return;
        }

        const previousCategoryName = existingCategory.name;
        const nextCategoryName = name?.trim() || existingCategory.name;

        await db.run(
          `UPDATE categories 
           SET name = ?, color = ?, icon = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
          [
            nextCategoryName,
            color !== undefined ? color : existingCategory.color,
            icon !== undefined ? icon : existingCategory.icon,
            now,
            id,
            userId,
          ]
        );

        const previousCategoryNameNormalized = normalizeCategoryName(previousCategoryName);
        const nextCategoryNameNormalized = normalizeCategoryName(nextCategoryName);
        const shouldSyncCategoryReferences =
          previousCategoryName !== nextCategoryName ||
          previousCategoryNameNormalized !== nextCategoryNameNormalized;

        if (shouldSyncCategoryReferences) {
          await db.run(
            `UPDATE tasks
             SET category = ?, updated_at = ?
             WHERE user_id = ?
               AND category IS NOT NULL
               AND LOWER(TRIM(category)) = ?`,
            [nextCategoryName, now, userId, previousCategoryNameNormalized]
          );

          await db.run(
            `UPDATE notes
             SET category = ?, updated_at = ?
             WHERE user_id = ?
               AND category IS NOT NULL
               AND LOWER(TRIM(category)) = ?`,
            [nextCategoryName, now, userId, previousCategoryNameNormalized]
          );

          const lists = await db.all(
            'SELECT id, category_names FROM lists WHERE user_id = ?',
            [userId]
          );

          for (const list of lists) {
            const parsedCategoryNames = parseCategoryNames(list.category_names);
            if (parsedCategoryNames.length === 0) continue;

            let hasChanges = false;
            const updatedCategoryNames = parsedCategoryNames.map((categoryName) => {
              if (normalizeCategoryName(categoryName) === previousCategoryNameNormalized) {
                hasChanges = true;
                return nextCategoryName;
              }
              return categoryName;
            });

            if (!hasChanges) continue;

            await db.run(
              `UPDATE lists
               SET category_names = ?, updated_at = ?
               WHERE id = ? AND user_id = ?`,
              [JSON.stringify(sanitizeCategoryNames(updatedCategoryNames)), now, list.id, userId]
            );
          }
        }

        updatedCategory = await db.get('SELECT * FROM categories WHERE id = ?', [id]);
        await db.exec('COMMIT');
        transactionStarted = false;
      } catch (error) {
        if (transactionStarted) {
          try {
            await db.exec('ROLLBACK');
          } catch (rollbackError) {
            console.error('Error rolling back SQLite category update transaction:', rollbackError);
          }
        }
        throw error;
      }
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
      let transactionStarted = false;
      try {
        await client.query('BEGIN');
        transactionStarted = true;

        // Check if category exists
        const existingResult = await client.query(
          'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
          [id, userId]
        );

        if (existingResult.rows.length === 0) {
          await client.query('ROLLBACK');
          transactionStarted = false;
          res.status(404).json({ error: 'Category not found' });
          return;
        }

        const existingCategory = existingResult.rows[0];
        const categoryNameNormalized = normalizeCategoryName(existingCategory.name);
        const now = new Date().toISOString();

        await client.query(
          `UPDATE tasks
           SET category = NULL, updated_at = $1
           WHERE user_id = $2
             AND category IS NOT NULL
             AND LOWER(TRIM(category)) = $3`,
          [now, userId, categoryNameNormalized]
        );

        await client.query(
          `UPDATE notes
           SET category = NULL, updated_at = $1
           WHERE user_id = $2
             AND category IS NOT NULL
             AND LOWER(TRIM(category)) = $3`,
          [now, userId, categoryNameNormalized]
        );

        const listsResult = await client.query(
          'SELECT id, category_names FROM lists WHERE user_id = $1',
          [userId]
        );

        for (const list of listsResult.rows) {
          const parsedCategoryNames = parseCategoryNames(list.category_names);
          if (parsedCategoryNames.length === 0) continue;

          const filteredCategoryNames = sanitizeCategoryNames(
            parsedCategoryNames.filter(
              (categoryName) => normalizeCategoryName(categoryName) !== categoryNameNormalized
            )
          );

          if (filteredCategoryNames.length === parsedCategoryNames.length) continue;

          await client.query(
            `UPDATE lists
             SET category_names = $1, updated_at = $2
             WHERE id = $3 AND user_id = $4`,
            [JSON.stringify(filteredCategoryNames), now, list.id, userId]
          );
        }

        await client.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [id, userId]);
        await client.query('COMMIT');
        transactionStarted = false;
      } catch (error) {
        if (transactionStarted) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            console.error('Error rolling back category delete transaction:', rollbackError);
          }
        }
        throw error;
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      let transactionStarted = false;
      await db.exec('BEGIN');
      transactionStarted = true;
      
      try {
        // Check if category exists
        const existingCategory = await db.get(
          'SELECT * FROM categories WHERE id = ? AND user_id = ?',
          [id, userId]
        );

        if (!existingCategory) {
          await db.exec('ROLLBACK');
          transactionStarted = false;
          res.status(404).json({ error: 'Category not found' });
          return;
        }

        const categoryNameNormalized = normalizeCategoryName(existingCategory.name);
        const now = new Date().toISOString();

        await db.run(
          `UPDATE tasks
           SET category = NULL, updated_at = ?
           WHERE user_id = ?
             AND category IS NOT NULL
             AND LOWER(TRIM(category)) = ?`,
          [now, userId, categoryNameNormalized]
        );

        await db.run(
          `UPDATE notes
           SET category = NULL, updated_at = ?
           WHERE user_id = ?
             AND category IS NOT NULL
             AND LOWER(TRIM(category)) = ?`,
          [now, userId, categoryNameNormalized]
        );

        const lists = await db.all(
          'SELECT id, category_names FROM lists WHERE user_id = ?',
          [userId]
        );

        for (const list of lists) {
          const parsedCategoryNames = parseCategoryNames(list.category_names);
          if (parsedCategoryNames.length === 0) continue;

          const filteredCategoryNames = sanitizeCategoryNames(
            parsedCategoryNames.filter(
              (categoryName) => normalizeCategoryName(categoryName) !== categoryNameNormalized
            )
          );

          if (filteredCategoryNames.length === parsedCategoryNames.length) continue;

          await db.run(
            `UPDATE lists
             SET category_names = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`,
            [JSON.stringify(filteredCategoryNames), now, list.id, userId]
          );
        }

        await db.run('DELETE FROM categories WHERE id = ? AND user_id = ?', [id, userId]);
        await db.exec('COMMIT');
        transactionStarted = false;
      } catch (error) {
        if (transactionStarted) {
          try {
            await db.exec('ROLLBACK');
          } catch (rollbackError) {
            console.error('Error rolling back SQLite category delete transaction:', rollbackError);
          }
        }
        throw error;
      }
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


