import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

let db: Database;
let pgPool: Pool;

export const initializeDatabase = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL || 'sqlite:./jarvi.db';
  
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    // PostgreSQL for production
    console.log('🐘 Initializing PostgreSQL database...');
    pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    
    // Test connection
    const client = await pgPool.connect();
    await client.release();
  } else {
    // SQLite for development
    console.log('🗄️ Initializing SQLite database...');
    const filename = databaseUrl.replace('sqlite:', '');
    
    db = await open({
      filename,
      driver: sqlite3.Database,
    });
  }

  // Create tables
  await createTables();
  
  // Run migrations for existing databases
  await runMigrations();

  console.log('✅ Database initialized successfully');
};

const createTables = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL || 'sqlite:./jarvi.db';
  const isPostgres = databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');
  
  const timestampType = isPostgres ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : 'DATETIME DEFAULT CURRENT_TIMESTAMP';
  const booleanType = isPostgres ? 'BOOLEAN' : 'BOOLEAN';
  const realType = isPostgres ? 'DECIMAL(10,2)' : 'REAL';
  
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT,
      auth_provider TEXT DEFAULT 'email',
      has_password ${booleanType} DEFAULT TRUE,
      email_verified ${booleanType} DEFAULT FALSE,
      email_verification_token TEXT,
      email_verification_expires ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      password_reset_token TEXT,
      password_reset_expires ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      subscription_status TEXT DEFAULT 'none',
      trial_ends_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      created_at ${timestampType},
      updated_at ${timestampType}
    );`,
    
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      completed ${booleanType} DEFAULT FALSE,
      priority TEXT,
      category TEXT,
      important ${booleanType} DEFAULT FALSE,
      due_date ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      time TEXT,
      recurrence_type TEXT DEFAULT 'none',
      recurrence_config TEXT,
      created_at ${timestampType},
      updated_at ${timestampType}
    );`,
    
    `CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT,
      tags TEXT,
      is_favorite ${booleanType} DEFAULT FALSE,
      created_at ${timestampType},
      updated_at ${timestampType}
    );`,
    
    `CREATE TABLE IF NOT EXISTS note_shares (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      shared_with_user_id TEXT NOT NULL,
      permission TEXT DEFAULT 'read',
      created_at ${timestampType},
      FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
      FOREIGN KEY (owner_id) REFERENCES users (id),
      FOREIGN KEY (shared_with_user_id) REFERENCES users (id),
      UNIQUE(note_id, shared_with_user_id)
    );`,
    
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount ${realType} NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      date ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')} NOT NULL,
      created_at ${timestampType},
      updated_at ${timestampType}
    );`,
    
    `CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      frequency TEXT NOT NULL,
      target INTEGER DEFAULT 1,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      created_at ${timestampType},
      updated_at ${timestampType}
    );`,
    
    `CREATE TABLE IF NOT EXISTS habit_logs (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL,
      completed ${booleanType} NOT NULL,
      date ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')} NOT NULL,
      notes TEXT,
      created_at ${timestampType}
    );`,
    
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      icon TEXT,
      created_at ${timestampType},
      updated_at ${timestampType},
      UNIQUE(user_id, name)
    );`,
    `CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category_names TEXT NOT NULL,
      created_at ${timestampType},
      updated_at ${timestampType},
      UNIQUE(user_id, name)
    );`
  ];
  
  if (isPostgres) {
    // Execute queries individually for PostgreSQL
    const client = await pgPool.connect();
    try {
      for (const query of queries) {
        await client.query(query);
      }
    } finally {
      client.release();
    }
  } else {
    // Execute all queries at once for SQLite
    await db.exec(queries.join('\n\n'));
  }
};

const normalizeCategoryName = (value: string): string => value.trim().toLowerCase();

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

const runCategoryBackfillMigrationPostgres = async (client: PoolClient): Promise<void> => {
  const now = new Date().toISOString();
  let createdCategories = 0;
  let updatedTasks = 0;
  let updatedLists = 0;

  const userResult = await client.query(
    `SELECT DISTINCT user_id
     FROM (
       SELECT user_id FROM tasks WHERE category IS NOT NULL AND TRIM(category) <> ''
       UNION
       SELECT user_id FROM lists
     ) AS category_users`
  );

  for (const user of userResult.rows) {
    const userId = user.user_id as string;
    const categoriesResult = await client.query(
      'SELECT id, name FROM categories WHERE user_id = $1 ORDER BY created_at ASC',
      [userId]
    );

    const categoryByNormalized = new Map<string, { id: string; name: string }>();
    for (const category of categoriesResult.rows) {
      const normalized = normalizeCategoryName(category.name);
      if (!categoryByNormalized.has(normalized)) {
        categoryByNormalized.set(normalized, { id: category.id, name: category.name });
      }
    }

    const taskCategoryRows = await client.query(
      `SELECT DISTINCT TRIM(category) AS category_name
       FROM tasks
       WHERE user_id = $1
         AND category IS NOT NULL
         AND TRIM(category) <> ''`,
      [userId]
    );

    for (const row of taskCategoryRows.rows) {
      const rawCategoryName = String(row.category_name || '').trim();
      if (!rawCategoryName) continue;

      const normalized = normalizeCategoryName(rawCategoryName);
      let canonicalCategory = categoryByNormalized.get(normalized);

      if (!canonicalCategory) {
        const categoryId = uuidv4();
        await client.query(
          `INSERT INTO categories (id, user_id, name, color, icon, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [categoryId, userId, rawCategoryName, null, null, now, now]
        );
        canonicalCategory = { id: categoryId, name: rawCategoryName };
        categoryByNormalized.set(normalized, canonicalCategory);
        createdCategories += 1;
      }

      const taskUpdateResult = await client.query(
        `UPDATE tasks
         SET category = $1, updated_at = $2
         WHERE user_id = $3
           AND category IS NOT NULL
           AND LOWER(TRIM(category)) = $4
           AND category <> $1`,
        [canonicalCategory.name, now, userId, normalized]
      );
      updatedTasks += taskUpdateResult.rowCount || 0;
    }

    const listsResult = await client.query(
      'SELECT id, category_names FROM lists WHERE user_id = $1',
      [userId]
    );

    for (const list of listsResult.rows) {
      const parsedCategoryNames = parseCategoryNames(list.category_names);
      const normalizedCategoryNames: string[] = [];

      for (const categoryName of parsedCategoryNames) {
        const trimmed = categoryName.trim();
        if (!trimmed) continue;

        const normalized = normalizeCategoryName(trimmed);
        let canonicalCategory = categoryByNormalized.get(normalized);

        if (!canonicalCategory) {
          const categoryId = uuidv4();
          await client.query(
            `INSERT INTO categories (id, user_id, name, color, icon, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [categoryId, userId, trimmed, null, null, now, now]
          );
          canonicalCategory = { id: categoryId, name: trimmed };
          categoryByNormalized.set(normalized, canonicalCategory);
          createdCategories += 1;
        }

        normalizedCategoryNames.push(canonicalCategory.name);
      }

      const nextCategoryNames = sanitizeCategoryNames(normalizedCategoryNames);
      const currentCategoryNames = parseCategoryNames(list.category_names);
      const nextJson = JSON.stringify(nextCategoryNames);
      const currentJson = JSON.stringify(currentCategoryNames);
      const shouldUpdate =
        nextJson !== currentJson ||
        (typeof list.category_names === 'string' && list.category_names !== currentJson);

      if (!shouldUpdate) continue;

      const listUpdateResult = await client.query(
        `UPDATE lists
         SET category_names = $1, updated_at = $2
         WHERE id = $3 AND user_id = $4`,
        [nextJson, now, list.id, userId]
      );
      updatedLists += listUpdateResult.rowCount || 0;
    }
  }

  console.log(
    `[Migration] Category backfill (PostgreSQL): ${createdCategories} categories created, ` +
      `${updatedTasks} tasks normalized, ${updatedLists} lists sanitized`
  );
};

const runCategoryBackfillMigrationSqlite = async (): Promise<void> => {
  const now = new Date().toISOString();
  let createdCategories = 0;
  let updatedTasks = 0;
  let updatedLists = 0;

  const users = await db.all(
    `SELECT DISTINCT user_id
     FROM (
       SELECT user_id FROM tasks WHERE category IS NOT NULL AND TRIM(category) <> ''
       UNION
       SELECT user_id FROM lists
     )`
  );

  for (const user of users) {
    const userId = user.user_id as string;
    const categories = await db.all(
      'SELECT id, name FROM categories WHERE user_id = ? ORDER BY created_at ASC',
      [userId]
    );

    const categoryByNormalized = new Map<string, { id: string; name: string }>();
    for (const category of categories) {
      const normalized = normalizeCategoryName(category.name);
      if (!categoryByNormalized.has(normalized)) {
        categoryByNormalized.set(normalized, { id: category.id, name: category.name });
      }
    }

    const taskCategoryRows = await db.all(
      `SELECT DISTINCT TRIM(category) AS category_name
       FROM tasks
       WHERE user_id = ?
         AND category IS NOT NULL
         AND TRIM(category) <> ''`,
      [userId]
    );

    for (const row of taskCategoryRows) {
      const rawCategoryName = String(row.category_name || '').trim();
      if (!rawCategoryName) continue;

      const normalized = normalizeCategoryName(rawCategoryName);
      let canonicalCategory = categoryByNormalized.get(normalized);

      if (!canonicalCategory) {
        const categoryId = uuidv4();
        await db.run(
          `INSERT INTO categories (id, user_id, name, color, icon, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [categoryId, userId, rawCategoryName, null, null, now, now]
        );
        canonicalCategory = { id: categoryId, name: rawCategoryName };
        categoryByNormalized.set(normalized, canonicalCategory);
        createdCategories += 1;
      }

      const taskUpdateResult = await db.run(
        `UPDATE tasks
         SET category = ?, updated_at = ?
         WHERE user_id = ?
           AND category IS NOT NULL
           AND LOWER(TRIM(category)) = ?
           AND category <> ?`,
        [canonicalCategory.name, now, userId, normalized, canonicalCategory.name]
      );
      updatedTasks += taskUpdateResult?.changes || 0;
    }

    const lists = await db.all(
      'SELECT id, category_names FROM lists WHERE user_id = ?',
      [userId]
    );

    for (const list of lists) {
      const parsedCategoryNames = parseCategoryNames(list.category_names);
      const normalizedCategoryNames: string[] = [];

      for (const categoryName of parsedCategoryNames) {
        const trimmed = categoryName.trim();
        if (!trimmed) continue;

        const normalized = normalizeCategoryName(trimmed);
        let canonicalCategory = categoryByNormalized.get(normalized);

        if (!canonicalCategory) {
          const categoryId = uuidv4();
          await db.run(
            `INSERT INTO categories (id, user_id, name, color, icon, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [categoryId, userId, trimmed, null, null, now, now]
          );
          canonicalCategory = { id: categoryId, name: trimmed };
          categoryByNormalized.set(normalized, canonicalCategory);
          createdCategories += 1;
        }

        normalizedCategoryNames.push(canonicalCategory.name);
      }

      const nextCategoryNames = sanitizeCategoryNames(normalizedCategoryNames);
      const currentCategoryNames = parseCategoryNames(list.category_names);
      const nextJson = JSON.stringify(nextCategoryNames);
      const currentJson = JSON.stringify(currentCategoryNames);
      const shouldUpdate =
        nextJson !== currentJson ||
        (typeof list.category_names === 'string' && list.category_names !== currentJson);

      if (!shouldUpdate) continue;

      const listUpdateResult = await db.run(
        `UPDATE lists
         SET category_names = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [nextJson, now, list.id, userId]
      );
      updatedLists += listUpdateResult?.changes || 0;
    }
  }

  console.log(
    `[Migration] Category backfill (SQLite): ${createdCategories} categories created, ` +
      `${updatedTasks} tasks normalized, ${updatedLists} lists sanitized`
  );
};

const runMigrations = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL || 'sqlite:./jarvi.db';
  const isPostgres = databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');
  
  // Migration: Add email verification columns to users table
  const emailVerificationMigrations = [
    'ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE',
    'ALTER TABLE users ADD COLUMN email_verification_token TEXT',
    'ALTER TABLE users ADD COLUMN email_verification_expires TIMESTAMP',
    'ALTER TABLE users ADD COLUMN password_reset_token TEXT',
    'ALTER TABLE users ADD COLUMN password_reset_expires TIMESTAMP',
  ];
  
  if (isPostgres) {
    const client = await pgPool.connect();
    try {
      for (const migration of emailVerificationMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }
      
      // Migration: Add auth_provider column
      try {
        await client.query('ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT \'email\'');
        // Update existing users based on password field
        await client.query('UPDATE users SET auth_provider = \'google\' WHERE password = \'google-auth\'');
        await client.query('UPDATE users SET auth_provider = \'email\' WHERE password != \'google-auth\' AND auth_provider IS NULL');
      } catch (e) {
        // Column already exists or migration already ran, ignore
      }
      
      // Migration: Add has_password column
      try {
        await client.query('ALTER TABLE users ADD COLUMN has_password BOOLEAN DEFAULT TRUE');
        // Update existing users: Google users have no password
        await client.query('UPDATE users SET has_password = FALSE WHERE password = \'google-auth\'');
        await client.query('UPDATE users SET has_password = TRUE WHERE password != \'google-auth\' AND has_password IS NULL');
      } catch (e) {
        // Column already exists or migration already ran, ignore
      }

      // Migration: backfill and normalize task/list categories with categories catalog
      await runCategoryBackfillMigrationPostgres(client);
    } finally {
      client.release();
    }
  } else {
    for (const migration of emailVerificationMigrations) {
      try {
        await db.exec(migration);
      } catch (e) {
        // Column already exists, ignore
      }
    }
    
    // Migration: Add auth_provider column for SQLite
    try {
      await db.exec('ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT \'email\'');
      // Update existing users based on password field
      await db.exec('UPDATE users SET auth_provider = \'google\' WHERE password = \'google-auth\'');
      await db.exec('UPDATE users SET auth_provider = \'email\' WHERE password != \'google-auth\' AND auth_provider IS NULL');
    } catch (e) {
      // Column already exists or migration already ran, ignore
    }
    
    // Migration: Add has_password column for SQLite
    try {
      await db.exec('ALTER TABLE users ADD COLUMN has_password BOOLEAN DEFAULT TRUE');
      // Update existing users: Google users have no password
      await db.exec('UPDATE users SET has_password = FALSE WHERE password = \'google-auth\'');
      await db.exec('UPDATE users SET has_password = TRUE WHERE password != \'google-auth\' AND has_password IS NULL');
    } catch (e) {
      // Column already exists or migration already ran, ignore
    }

    // Migration: backfill and normalize task/list categories with categories catalog
    await runCategoryBackfillMigrationSqlite();
  }
};

export const getDatabase = (): Database => {
  if (!db && !pgPool) {
    throw new Error('Database not initialized');
  }
  return db;
};

export const getPool = (): Pool => {
  if (!pgPool) {
    throw new Error('PostgreSQL pool not initialized');
  }
  return pgPool;
};

export const isPostgreSQL = (): boolean => {
  const databaseUrl = process.env.DATABASE_URL || 'sqlite:./jarvi.db';
  return databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');
};
