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
      whatsapp_phone TEXT UNIQUE,
      whatsapp_verified ${booleanType} DEFAULT FALSE,
      whatsapp_link_code TEXT,
      whatsapp_link_code_expires_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      avatar_explicitly_removed ${booleanType} DEFAULT FALSE,
      preferred_name TEXT,
      created_at ${timestampType},
      updated_at ${timestampType}
    );`,

    `CREATE TABLE IF NOT EXISTS early_access_leads (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      whatsapp TEXT NOT NULL,
      wants_broadcast_updates ${booleanType} DEFAULT FALSE,
      source TEXT DEFAULT 'marketing-landing',
      created_at ${timestampType},
      updated_at ${timestampType}
    );`,

    `CREATE TABLE IF NOT EXISTS onboarding_leads (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      areas_json TEXT NOT NULL DEFAULT '[]',
      areas_other TEXT,
      task_origins_json TEXT NOT NULL DEFAULT '[]',
      task_origins_other TEXT,
      tracking_methods_json TEXT NOT NULL DEFAULT '[]',
      tracking_methods_other TEXT,
      pain_points_json TEXT NOT NULL DEFAULT '[]',
      pain_points_other TEXT,
      desired_capabilities_json TEXT NOT NULL DEFAULT '[]',
      desired_capabilities_other TEXT,
      ideal_outcome_text TEXT,
      interview_availability TEXT,
      contact_value TEXT,
      contact_type TEXT,
      wants_broadcast_updates ${booleanType} DEFAULT FALSE,
      memory_seed_text TEXT,
      raw_payload_json TEXT,
      source TEXT DEFAULT 'marketing-onboarding',
      flow_version TEXT DEFAULT 'figma-onboarding-v1',
      approval_status TEXT DEFAULT 'pending',
      approval_requested_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      approved_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      approved_by TEXT,
      rejected_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      rejected_by TEXT,
      approval_email_sent_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      slack_channel_id TEXT,
      slack_message_ts TEXT,
      converted_user_id TEXT,
      converted_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      created_at ${timestampType},
      updated_at ${timestampType}
    );`,

    `CREATE TABLE IF NOT EXISTS user_memory_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      memory_text TEXT NOT NULL DEFAULT '',
      source TEXT DEFAULT 'manual',
      source_ref TEXT,
      consent_ai_memory ${booleanType} DEFAULT TRUE,
      created_at ${timestampType},
      updated_at ${timestampType},
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );`,
    
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      original_whatsapp_content TEXT,
      media_attachments TEXT,
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
    );`,

    `CREATE TABLE IF NOT EXISTS task_subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      completed ${booleanType} DEFAULT FALSE,
      created_at ${timestampType},
      updated_at ${timestampType},
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS pending_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source TEXT DEFAULT 'whatsapp',
      raw_content TEXT,
      transcription TEXT,
      original_whatsapp_content TEXT,
      media_attachments TEXT,
      suggested_title TEXT NOT NULL,
      suggested_description TEXT,
      suggested_priority TEXT,
      suggested_due_date ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      suggested_time TEXT,
      suggested_category TEXT,
      status TEXT DEFAULT 'awaiting_confirmation',
      whatsapp_message_sid TEXT,
      whatsapp_phone TEXT,
      expires_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      created_at ${timestampType},
      updated_at ${timestampType},
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

  const whatsappUserMigrations = [
    'ALTER TABLE users ADD COLUMN whatsapp_phone TEXT',
    'ALTER TABLE users ADD COLUMN whatsapp_verified BOOLEAN DEFAULT FALSE',
    'ALTER TABLE users ADD COLUMN whatsapp_link_code TEXT',
    'ALTER TABLE users ADD COLUMN whatsapp_link_code_expires_at TIMESTAMP',
  ];

  const whatsappTaskMigrations = [
    'ALTER TABLE tasks ADD COLUMN original_whatsapp_content TEXT',
    'ALTER TABLE tasks ADD COLUMN media_attachments TEXT',
  ];

  const whatsappPendingTaskMigrations = [
    'ALTER TABLE pending_tasks ADD COLUMN original_whatsapp_content TEXT',
    'ALTER TABLE pending_tasks ADD COLUMN media_attachments TEXT',
  ];

  const createPendingTasksTablePostgres = `CREATE TABLE IF NOT EXISTS pending_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source TEXT DEFAULT 'whatsapp',
    raw_content TEXT,
    transcription TEXT,
    original_whatsapp_content TEXT,
    media_attachments TEXT,
    suggested_title TEXT NOT NULL,
    suggested_description TEXT,
    suggested_priority TEXT,
    suggested_due_date TIMESTAMP,
    suggested_time TEXT,
    suggested_category TEXT,
    status TEXT DEFAULT 'awaiting_confirmation',
    whatsapp_message_sid TEXT,
    whatsapp_phone TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`;

  const createPendingTasksTableSqlite = `CREATE TABLE IF NOT EXISTS pending_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source TEXT DEFAULT 'whatsapp',
    raw_content TEXT,
    transcription TEXT,
    original_whatsapp_content TEXT,
    media_attachments TEXT,
    suggested_title TEXT NOT NULL,
    suggested_description TEXT,
    suggested_priority TEXT,
    suggested_due_date DATETIME,
    suggested_time TEXT,
    suggested_category TEXT,
    status TEXT DEFAULT 'awaiting_confirmation',
    whatsapp_message_sid TEXT,
    whatsapp_phone TEXT,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`;
  
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

      // Migration: Add WhatsApp linking columns
      for (const migration of whatsappUserMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }

      try {
        await client.query(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_whatsapp_phone_unique ON users (whatsapp_phone)'
        );
      } catch (e) {
        // Index already exists, ignore
      }

      // Migration: backfill and normalize task/list categories with categories catalog
      await runCategoryBackfillMigrationPostgres(client);

      // Migration: Create task_subtasks table for existing databases
      try {
        await client.query(`CREATE TABLE IF NOT EXISTS task_subtasks (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          completed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )`);
      } catch (e) {
        // Table already exists, ignore
      }

      // Migration: Create onboarding_leads table for existing databases
      try {
        await client.query(`CREATE TABLE IF NOT EXISTS onboarding_leads (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          areas_json TEXT NOT NULL DEFAULT '[]',
          areas_other TEXT,
          task_origins_json TEXT NOT NULL DEFAULT '[]',
          task_origins_other TEXT,
          tracking_methods_json TEXT NOT NULL DEFAULT '[]',
          tracking_methods_other TEXT,
          pain_points_json TEXT NOT NULL DEFAULT '[]',
          pain_points_other TEXT,
          desired_capabilities_json TEXT NOT NULL DEFAULT '[]',
          desired_capabilities_other TEXT,
          ideal_outcome_text TEXT,
          interview_availability TEXT,
          contact_value TEXT,
          contact_type TEXT,
          wants_broadcast_updates BOOLEAN DEFAULT FALSE,
          memory_seed_text TEXT,
          raw_payload_json TEXT,
          source TEXT DEFAULT 'marketing-onboarding',
          flow_version TEXT DEFAULT 'figma-onboarding-v1',
          approval_status TEXT DEFAULT 'pending',
          approval_requested_at TIMESTAMP,
          approved_at TIMESTAMP,
          approved_by TEXT,
          rejected_at TIMESTAMP,
          rejected_by TEXT,
          approval_email_sent_at TIMESTAMP,
          slack_channel_id TEXT,
          slack_message_ts TEXT,
          converted_user_id TEXT,
          converted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
      } catch (e) {
        // Table already exists, ignore
      }

      // Migration: Create pending_tasks table for existing databases
      try {
        await client.query(createPendingTasksTablePostgres);
      } catch (e) {
        // Table already exists, ignore
      }

      const onboardingApprovalMigrations = [
        "ALTER TABLE onboarding_leads ADD COLUMN approval_status TEXT DEFAULT 'pending'",
        'ALTER TABLE onboarding_leads ADD COLUMN approval_requested_at TIMESTAMP',
        'ALTER TABLE onboarding_leads ADD COLUMN approved_at TIMESTAMP',
        'ALTER TABLE onboarding_leads ADD COLUMN approved_by TEXT',
        'ALTER TABLE onboarding_leads ADD COLUMN rejected_at TIMESTAMP',
        'ALTER TABLE onboarding_leads ADD COLUMN rejected_by TEXT',
        'ALTER TABLE onboarding_leads ADD COLUMN approval_email_sent_at TIMESTAMP',
        'ALTER TABLE onboarding_leads ADD COLUMN slack_channel_id TEXT',
        'ALTER TABLE onboarding_leads ADD COLUMN slack_message_ts TEXT',
      ];

      for (const migration of onboardingApprovalMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }

      // Migration: Add WhatsApp-specific task columns
      for (const migration of whatsappTaskMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }

      // Migration: Create user_memory_profiles table for existing databases
      try {
        await client.query(`CREATE TABLE IF NOT EXISTS user_memory_profiles (
          id TEXT PRIMARY KEY,
          user_id TEXT UNIQUE NOT NULL,
          memory_text TEXT NOT NULL DEFAULT '',
          source TEXT DEFAULT 'manual',
          source_ref TEXT,
          consent_ai_memory BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
      } catch (e) {
        // Table already exists, ignore
      }

      // Migration: Add WhatsApp-specific pending task columns
      for (const migration of whatsappPendingTaskMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }

      // Migration: Add timezone column to users
      try {
        await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo'");
      } catch (e) {
        // Column already exists, ignore
      }

      // Migration: Add last_reconciled_at column to users
      try {
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMP');
      } catch (e) {
        // Column already exists, ignore
      }

      // Migration: Add position column to categories for user-defined ordering
      try {
        await client.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS position INTEGER');
      } catch (e) {
        // Column already exists, ignore
      }

      // Migration: Add visible column to categories for sidebar visibility control
      try {
        await client.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS visible BOOLEAN DEFAULT TRUE');
      } catch (e) {
        // Column already exists, ignore
      }

      // Migration: Add filter fields to lists table
      const listFilterMigrations = [
        'ALTER TABLE lists ADD COLUMN IF NOT EXISTS priority TEXT',
        'ALTER TABLE lists ADD COLUMN IF NOT EXISTS connected_app TEXT',
        'ALTER TABLE lists ADD COLUMN IF NOT EXISTS show_completed INTEGER DEFAULT 1',
        'ALTER TABLE lists ADD COLUMN IF NOT EXISTS filter_no_category INTEGER DEFAULT 0',
      ];
      for (const migration of listFilterMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }

      // Migration: Add Gmail OAuth token columns
      const gmailUserMigrations = [
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_connected_at TIMESTAMP',
      ];
      for (const migration of gmailUserMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }

      // Migration: Create gmail_processed_emails table to avoid re-analyzing the same email
      try {
        await client.query(`CREATE TABLE IF NOT EXISTS gmail_processed_emails (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          gmail_message_id TEXT NOT NULL,
          processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, gmail_message_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
      } catch (e) {
        // Table already exists, ignore
      }

      // Migration: Add source column to tasks table
      try {
        await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`);
      } catch (e) {
        // Column already exists, ignore
      }

      // Migration: Add gmail_message_id to pending_tasks for deduplication
      try {
        await client.query(`ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS gmail_message_id TEXT`);
      } catch (e) {
        // Column already exists, ignore
      }

      // Migration: Add trial_extended flag to users
      try {
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_extended BOOLEAN DEFAULT FALSE');
      } catch (e) {
        // Column already exists, ignore
      }

      // Migration: Create processed_webhook_events table for Stripe webhook idempotency.
      // Stripe may deliver the same event_id multiple times (e.g. after retries); we
      // record each one so handlers don't double-apply state changes.
      try {
        await client.query(`CREATE TABLE IF NOT EXISTS processed_webhook_events (
          event_id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
      } catch (e) {
        // Table already exists, ignore
      }

      // Migration: Add avatar_explicitly_removed flag to users
      try {
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_explicitly_removed BOOLEAN DEFAULT FALSE');
      } catch (e) {
        // Column already exists, ignore
      }

      // Migration: Add preferred_name column to users
      try {
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_name TEXT');
      } catch (e) {
        // Column already exists, ignore
      }
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

    // Migration: Add WhatsApp linking columns for SQLite
    for (const migration of whatsappUserMigrations) {
      try {
        await db.exec(migration);
      } catch (e) {
        // Column already exists, ignore
      }
    }

    try {
      await db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_whatsapp_phone_unique ON users (whatsapp_phone)'
      );
    } catch (e) {
      // Index already exists, ignore
    }

    // Migration: backfill and normalize task/list categories with categories catalog
    await runCategoryBackfillMigrationSqlite();

    // Migration: Create task_subtasks table for existing SQLite databases
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS task_subtasks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`);
    } catch (e) {
      // Table already exists, ignore
    }

    // Migration: Create onboarding_leads table for existing SQLite databases
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS onboarding_leads (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        areas_json TEXT NOT NULL DEFAULT '[]',
        areas_other TEXT,
        task_origins_json TEXT NOT NULL DEFAULT '[]',
        task_origins_other TEXT,
        tracking_methods_json TEXT NOT NULL DEFAULT '[]',
        tracking_methods_other TEXT,
        pain_points_json TEXT NOT NULL DEFAULT '[]',
        pain_points_other TEXT,
        desired_capabilities_json TEXT NOT NULL DEFAULT '[]',
        desired_capabilities_other TEXT,
        ideal_outcome_text TEXT,
        interview_availability TEXT,
        contact_value TEXT,
        contact_type TEXT,
        wants_broadcast_updates BOOLEAN DEFAULT FALSE,
        memory_seed_text TEXT,
        raw_payload_json TEXT,
        source TEXT DEFAULT 'marketing-onboarding',
        flow_version TEXT DEFAULT 'figma-onboarding-v1',
        approval_status TEXT DEFAULT 'pending',
        approval_requested_at DATETIME,
        approved_at DATETIME,
        approved_by TEXT,
        rejected_at DATETIME,
        rejected_by TEXT,
        approval_email_sent_at DATETIME,
        slack_channel_id TEXT,
        slack_message_ts TEXT,
        converted_user_id TEXT,
        converted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
    } catch (e) {
      // Table already exists, ignore
    }

    // Migration: Create pending_tasks table for existing SQLite databases
    try {
      await db.exec(createPendingTasksTableSqlite);
    } catch (e) {
      // Table already exists, ignore
    }

    const onboardingApprovalMigrations = [
      "ALTER TABLE onboarding_leads ADD COLUMN approval_status TEXT DEFAULT 'pending'",
      'ALTER TABLE onboarding_leads ADD COLUMN approval_requested_at DATETIME',
      'ALTER TABLE onboarding_leads ADD COLUMN approved_at DATETIME',
      'ALTER TABLE onboarding_leads ADD COLUMN approved_by TEXT',
      'ALTER TABLE onboarding_leads ADD COLUMN rejected_at DATETIME',
      'ALTER TABLE onboarding_leads ADD COLUMN rejected_by TEXT',
      'ALTER TABLE onboarding_leads ADD COLUMN approval_email_sent_at DATETIME',
      'ALTER TABLE onboarding_leads ADD COLUMN slack_channel_id TEXT',
      'ALTER TABLE onboarding_leads ADD COLUMN slack_message_ts TEXT',
    ];

    for (const migration of onboardingApprovalMigrations) {
      try {
        await db.exec(migration);
      } catch (e) {
        // Column already exists, ignore
      }
    }

    // Migration: Add WhatsApp-specific task columns for SQLite
    for (const migration of whatsappTaskMigrations) {
      try {
        await db.exec(migration);
      } catch (e) {
        // Column already exists, ignore
      }
    }

    // Migration: Create user_memory_profiles table for existing SQLite databases
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS user_memory_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        memory_text TEXT NOT NULL DEFAULT '',
        source TEXT DEFAULT 'manual',
        source_ref TEXT,
        consent_ai_memory BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    } catch (e) {
      // Table already exists, ignore
    }

    // Migration: Add WhatsApp-specific pending task columns for SQLite
    for (const migration of whatsappPendingTaskMigrations) {
      try {
        await db.exec(migration);
      } catch (e) {
        // Column already exists, ignore
      }
    }

    // Migration: Add timezone column to users
    try {
      await db.exec("ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'America/Sao_Paulo'");
    } catch (e) {
      // Column already exists, ignore
    }

    // Migration: Add last_reconciled_at column to users
    try {
      await db.exec('ALTER TABLE users ADD COLUMN last_reconciled_at DATETIME');
    } catch (e) {
      // Column already exists, ignore
    }

    // Migration: Add position column to categories for user-defined ordering
    try {
      await db.exec('ALTER TABLE categories ADD COLUMN position INTEGER');
    } catch (e) {
      // Column already exists, ignore
    }

    // Migration: Add visible column to categories for sidebar visibility control
    try {
      await db.exec('ALTER TABLE categories ADD COLUMN visible INTEGER DEFAULT 1');
    } catch (e) {
      // Column already exists, ignore
    }

    // Migration: Add filter fields to lists table
    const listFilterMigrationsSqlite = [
      'ALTER TABLE lists ADD COLUMN priority TEXT',
      'ALTER TABLE lists ADD COLUMN connected_app TEXT',
      'ALTER TABLE lists ADD COLUMN show_completed INTEGER DEFAULT 1',
      'ALTER TABLE lists ADD COLUMN filter_no_category INTEGER DEFAULT 0',
    ];
    for (const migration of listFilterMigrationsSqlite) {
      try {
        await db.exec(migration);
      } catch (e) {
        // Column already exists, ignore
      }
    }

    // Migration: Add Gmail OAuth token columns for SQLite
    const gmailUserMigrationsSqlite = [
      'ALTER TABLE users ADD COLUMN google_access_token TEXT',
      'ALTER TABLE users ADD COLUMN google_refresh_token TEXT',
      'ALTER TABLE users ADD COLUMN gmail_connected_at DATETIME',
    ];
    for (const migration of gmailUserMigrationsSqlite) {
      try {
        await db.exec(migration);
      } catch (e) {
        // Column already exists, ignore
      }
    }

    // Migration: Create gmail_processed_emails table for SQLite
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS gmail_processed_emails (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        gmail_message_id TEXT NOT NULL,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, gmail_message_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    } catch (e) {
      // Table already exists, ignore
    }

    // Migration: Add source column to tasks table for SQLite
    try {
      await db.exec(`ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'manual'`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Migration: Add gmail_message_id to pending_tasks for deduplication (SQLite)
    try {
      await db.exec(`ALTER TABLE pending_tasks ADD COLUMN gmail_message_id TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Migration: Add trial_extended flag to users (SQLite)
    try {
      await db.exec('ALTER TABLE users ADD COLUMN trial_extended BOOLEAN DEFAULT FALSE');
    } catch (e) {
      // Column already exists, ignore
    }

    // Migration: Create processed_webhook_events table for Stripe webhook idempotency (SQLite).
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS processed_webhook_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
    } catch (e) {
      // Table already exists, ignore
    }

    // Migration: Add avatar_explicitly_removed flag to users (SQLite)
    try {
      await db.exec('ALTER TABLE users ADD COLUMN avatar_explicitly_removed BOOLEAN DEFAULT FALSE');
    } catch (e) {
      // Column already exists, ignore
    }

    // Migration: Add preferred_name column to users (SQLite)
    try {
      await db.exec('ALTER TABLE users ADD COLUMN preferred_name TEXT');
    } catch (e) {
      // Column already exists, ignore
    }
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
