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
      whatsapp_promo_seen_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      whatsapp_promo_dismissed_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      avatar_explicitly_removed ${booleanType} DEFAULT FALSE,
      preferred_name TEXT,
      onboarding_completed_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      onboarding_journey_completed_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      daily_summary_enabled ${booleanType} DEFAULT TRUE,
      daily_summary_time TEXT DEFAULT '08:00',
      weekly_planning_enabled ${booleanType} DEFAULT TRUE,
      weekly_planning_time TEXT DEFAULT '19:00',
      overdue_recap_enabled ${booleanType} DEFAULT TRUE,
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

    `CREATE TABLE IF NOT EXISTS onboarding_whatsapp_otps (
      phone TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')} NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
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
      -- recurrence_type: 'none' | 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom'
      -- recurrence_config: JSON matching RecurrenceConfig (see packages/shared/src/types/recurrence.ts)
      recurrence_type TEXT DEFAULT 'none',
      recurrence_config TEXT,
      -- End date of the recurrence (mirrors recurrence_config.until for easy indexing/querying)
      recurrence_until ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      -- Points to the root task id of the recurrence series (set on generated occurrences)
      recurrence_parent_id TEXT,
      -- Idempotency marker: set once this task's next occurrence has been generated
      recurrence_next_task_id TEXT,
      -- Notas: the note whose summary the task came from (source = 'notes');
      -- NULL once that note is deleted
      source_note_id TEXT,
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
      -- Notas: AI summary (TipTap doc JSON), when it was generated, and a
      -- server-maintained plain-text snippet for the list.
      summary TEXT,
      summary_updated_at ${isPostgres ? 'TIMESTAMP' : 'DATETIME'},
      -- Fingerprint of the notes text the summary was generated from (notesFingerprint)
      summary_notes_fingerprint TEXT,
      -- One AI sentence about the note, written with the summary: the list's description
      summary_brief TEXT,
      preview TEXT,
      note_date TEXT,
      -- The user removed the note's date (the chip's "×"): no date shown
      note_date_removed ${booleanType} DEFAULT FALSE,
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

    // Notas: transcript of the recorded audio, one row per ~30 s segment.
    // The audio itself is never stored. SQLite does not enforce the FK, so
    // deleteNote and account deletion remove these rows by hand.
    `CREATE TABLE IF NOT EXISTS note_transcript_segments (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL${isPostgres ? ' REFERENCES notes (id) ON DELETE CASCADE' : ''},
      user_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      text TEXT NOT NULL,
      recorded_at ${isPostgres ? 'TIMESTAMP' : 'DATETIME'} NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at ${timestampType}
    );`,
    `CREATE INDEX IF NOT EXISTS idx_note_transcript_segments_note ON note_transcript_segments (note_id, recorded_at);`,

    // Notas: a summary next step (taskItem attrs.stepId) → the task created
    // from it. The source of truth for the link: the summary's attrs.taskId
    // mirrors it. The primary key makes "Criar tarefas" idempotent per step.
    // SQLite does not enforce FKs here either: deleteNote and account deletion
    // remove these rows by hand. A deleted task keeps its row, so the step is
    // never offered again.
    `CREATE TABLE IF NOT EXISTS note_step_tasks (
      note_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      step_text TEXT NOT NULL DEFAULT '',
      created_at ${timestampType},
      PRIMARY KEY (note_id, step_id)
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_note_step_tasks_task ON note_step_tasks (note_id, task_id);`,

    // Notas: notes a user pinned to the top of their list. Per user, so a
    // shared note is pinned only for whoever pinned it. Removed by hand with
    // the note and the account (SQLite does not enforce FKs here).
    `CREATE TABLE IF NOT EXISTS note_pins (
      user_id TEXT NOT NULL,
      note_id TEXT NOT NULL,
      pinned_at ${timestampType},
      PRIMARY KEY (user_id, note_id)
    );`,

    // Notas: wordings a next step is known by (normalized → step), so a
    // regenerated summary recognizes them: the text a step had when it became
    // a task, a rewording confirmed on regeneration, and the user's answers to
    // "is this the same step?" ('same' / 'distinct', which win over the rest;
    // distinct_from = the step with a task it is not). Removed by hand with
    // the note, like note_step_tasks.
    `CREATE TABLE IF NOT EXISTS note_step_wordings (
      note_id TEXT NOT NULL,
      wording TEXT NOT NULL,
      step_id TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      distinct_from TEXT,
      user_id TEXT,
      created_at ${timestampType},
      PRIMARY KEY (note_id, wording)
    );`,

    // Chats: the user's conversations with the agent on the web (chat panel
    // on Tarefas / Notas, Chats page), recorded by /api/ai/chat. `mode` +
    // task_id / note_id: the context of the latest turn. See chatHistoryService.
    `CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'general',
      task_id TEXT,
      note_id TEXT,
      created_at ${timestampType},
      updated_at ${timestampType}
    );`,
    `CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations (user_id, updated_at);`,

    // Chats: the messages, in order (`seq`). `content` is the plain text, `data`
    // the JSON the web rebuilds the message from. SQLite does not enforce the
    // FK: deleting a conversation or the account removes these by hand.
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL${isPostgres ? ' REFERENCES chat_conversations (id) ON DELETE CASCADE' : ''},
      user_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      data TEXT,
      created_at ${timestampType}
    );`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages (conversation_id, seq);`,
    
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

    `CREATE TABLE IF NOT EXISTS task_reminders (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      config TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
      trigger_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_attempt_at ${timestampType.replace('DEFAULT CURRENT_TIMESTAMP', '')},
      created_at ${timestampType},
      updated_at ${timestampType},
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );`,

    // One row per (user, local calendar day): the idempotency record for the
    // WhatsApp "Resumo do Dia". The UNIQUE constraint is what guarantees at
    // most one summary per user per day, even across concurrent ticks.
    `CREATE TABLE IF NOT EXISTS daily_summary_deliveries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      summary_date TEXT NOT NULL,
      status TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 0,
      message TEXT,
      error TEXT,
      created_at ${timestampType},
      updated_at ${timestampType},
      UNIQUE (user_id, summary_date)
    );`,

    // One row per (user, local Sunday): idempotency record for the WhatsApp
    // "Planejamento Semanal". `week_start` is the ISO date of the Sunday the
    // message belongs to, so a restart mid-evening never sends twice.
    `CREATE TABLE IF NOT EXISTS weekly_planning_deliveries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      error TEXT,
      created_at ${timestampType},
      updated_at ${timestampType},
      UNIQUE (user_id, week_start)
    );`,

    // Monthly cap on premium-model agent turns (UTC calendar month).
    `CREATE TABLE IF NOT EXISTS agent_month_usage (
      user_id TEXT NOT NULL,
      month TEXT NOT NULL,
      premium_turns INTEGER NOT NULL DEFAULT 0,
      updated_at ${timestampType},
      PRIMARY KEY (user_id, month)
    );`,

    `CREATE TABLE IF NOT EXISTS onboarding_rescue_deliveries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      error TEXT,
      created_at ${timestampType},
      updated_at ${timestampType},
      UNIQUE (user_id, attempt)
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
    );`,

    // Indexes powering the agent's active-task fetch and `search_tasks` tool.
    `CREATE INDEX IF NOT EXISTS idx_tasks_user_completed_due ON tasks (user_id, completed, due_date);`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_user_category ON tasks (user_id, category);`,
    // Powers the recurrence sweep's "which tasks need their next occurrence generated" query.
    `CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_sweep ON tasks (recurrence_type, completed, due_date);`,
    `CREATE INDEX IF NOT EXISTS idx_task_reminders_trigger ON task_reminders (status, trigger_at);`,
    `CREATE INDEX IF NOT EXISTS idx_task_reminders_task ON task_reminders (task_id);`,

    // Remote MCP: OAuth clients, one-time auth codes, and bearer credentials
    // (OAuth access/refresh tokens and personal access keys).
    `CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id TEXT PRIMARY KEY,
      client_name TEXT,
      redirect_uris TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
      code_hash TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      scopes TEXT NOT NULL,
      resource TEXT,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );`,
    `CREATE TABLE IF NOT EXISTS mcp_credentials (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      client_id TEXT,
      user_id TEXT NOT NULL,
      scopes TEXT NOT NULL,
      resource TEXT,
      name TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS idx_mcp_credentials_user ON mcp_credentials (user_id);`,
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
    // Agent tríade: fields the user explicitly declined ("Ainda não sei",
    // "Sem horário", "Sem lembrete"), as a JSON array. See agent/core/nextQuestion.ts.
    'ALTER TABLE tasks ADD COLUMN agent_triad_skips TEXT',
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

      // Migration: Create task_reminders table for existing databases
      try {
        await client.query(`CREATE TABLE IF NOT EXISTS task_reminders (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          channel TEXT NOT NULL,
          schedule_type TEXT NOT NULL,
          config TEXT NOT NULL,
          timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
          trigger_at TIMESTAMP,
          status TEXT NOT NULL DEFAULT 'pending',
          sent_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )`);
      } catch (e) {
        // Table already exists, ignore
      }

      try {
        await client.query(
          'CREATE INDEX IF NOT EXISTS idx_task_reminders_trigger ON task_reminders (status, trigger_at)'
        );
      } catch (e) {
        // Index already exists, ignore
      }

      try {
        await client.query(
          'CREATE INDEX IF NOT EXISTS idx_task_reminders_task ON task_reminders (task_id)'
        );
      } catch (e) {
        // Index already exists, ignore
      }

      // Migration: Add delivery-attempt tracking to task_reminders. Without a
      // persisted attempt counter a failing delivery is retried by the
      // every-minute scheduler forever, which bills one provider fee per retry.
      const reminderAttemptMigrations = [
        'ALTER TABLE task_reminders ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE task_reminders ADD COLUMN IF NOT EXISTS last_error TEXT',
        'ALTER TABLE task_reminders ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP',
      ];
      for (const migration of reminderAttemptMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column already exists, ignore
        }
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

      try {
        await client.query(`CREATE TABLE IF NOT EXISTS onboarding_whatsapp_otps (
          phone TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
      } catch (e) {
        // Table already exists, ignore
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

      // Migration: Add reconciliation_started_at column to users (claim lock
      // used to avoid duplicate concurrent memory reconciliation runs)
      try {
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS reconciliation_started_at TIMESTAMP');
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

      // Migration: Add recurrence columns (until / parent / next-occurrence marker) to tasks table
      const recurrenceTaskMigrations = [
        'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_until TIMESTAMP',
        'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_parent_id TEXT',
        'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_next_task_id TEXT',
      ];
      for (const migration of recurrenceTaskMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }

      try {
        await client.query(
          'CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_sweep ON tasks (recurrence_type, completed, due_date)'
        );
      } catch (e) {
        // Index already exists, ignore
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

      // Existing users should not receive the first-access modal. New users
      // leave this nullable and get the modal on their first authenticated visit.
      try {
        await client.query('ALTER TABLE users ADD COLUMN whatsapp_promo_seen_at TIMESTAMP');
        await client.query(
          'UPDATE users SET whatsapp_promo_seen_at = CURRENT_TIMESTAMP WHERE whatsapp_promo_seen_at IS NULL'
        );
      } catch (e) {
        // Column already exists, ignore
      }

      try {
        await client.query(
          'ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_promo_dismissed_at TIMESTAMP'
        );
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

      // Migration: Add Meta Ads attribution columns to users (Pixel/CAPI dedup)
      const metaAdsUserMigrations = [
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS meta_fbc TEXT',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS meta_fbp TEXT',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS meta_event_id TEXT',
      ];
      for (const migration of metaAdsUserMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }

      const openaiAdsUserMigrations = [
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS openai_oppref TEXT',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS openai_obref TEXT',
      ];
      for (const migration of openaiAdsUserMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }

      try {
        const columnResult = await client.query(
          `SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'users'
             AND column_name = 'onboarding_completed_at'`
        );
        if (columnResult.rows.length === 0) {
          await client.query(
            'ALTER TABLE users ADD COLUMN onboarding_completed_at TIMESTAMP'
          );
          await client.query(
            `UPDATE users
             SET onboarding_completed_at = created_at
             WHERE onboarding_completed_at IS NULL`
          );
        }
      } catch (e) {
        // Column already exists, ignore
      }

      try {
        const journeyColumn = await client.query(
          `SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'users'
             AND column_name = 'onboarding_journey_completed_at'`
        );
        if (journeyColumn.rows.length === 0) {
          await client.query(
            'ALTER TABLE users ADD COLUMN onboarding_journey_completed_at TIMESTAMP'
          );
          // Existing users already past the wizard should not get the
          // first-tasks WhatsApp intro on their next chat turn.
          await client.query(
            `UPDATE users
             SET onboarding_journey_completed_at = onboarding_completed_at
             WHERE onboarding_completed_at IS NOT NULL
               AND onboarding_journey_completed_at IS NULL`
          );
        }
      } catch (e) {
        // Column already exists, ignore
      }

      // Migration: Resumo do Dia (WhatsApp daily summary) preferences. Both
      // columns default ON so every account — existing and new — receives the
      // summary unless the person turns it off.
      const dailySummaryMigrations = [
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_summary_enabled BOOLEAN DEFAULT TRUE',
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_summary_time TEXT DEFAULT '08:00'",
        `CREATE TABLE IF NOT EXISTS daily_summary_deliveries (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          summary_date TEXT NOT NULL,
          status TEXT NOT NULL,
          item_count INTEGER NOT NULL DEFAULT 0,
          message TEXT,
          error TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (user_id, summary_date)
        )`,
        // Onboarding rescue (WhatsApp nudge for accounts that never finished
        // the wizard). One row per (user, attempt) — the claim is the dedupe.
        `CREATE TABLE IF NOT EXISTS onboarding_rescue_deliveries (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          status TEXT NOT NULL,
          message TEXT,
          error TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (user_id, attempt)
        )`,
        // Planejamento Semanal (Sunday WhatsApp nudge). Default ON like the
        // daily summary; one delivery row per (user, local Sunday).
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_planning_enabled BOOLEAN DEFAULT TRUE',
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_planning_time TEXT DEFAULT '19:00'",
        // Recap de tarefas vencidas (web, once a day on the Tasks page). Opt-out like the others.
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS overdue_recap_enabled BOOLEAN DEFAULT TRUE',
        `CREATE TABLE IF NOT EXISTS weekly_planning_deliveries (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          week_start TEXT NOT NULL,
          status TEXT NOT NULL,
          message TEXT,
          error TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (user_id, week_start)
        )`,
        `CREATE TABLE IF NOT EXISTS agent_month_usage (
          user_id TEXT NOT NULL,
          month TEXT NOT NULL,
          premium_turns INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, month)
        )`,
      ];
      for (const migration of dailySummaryMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column/table already exists, ignore
        }
      }

      // Migration: Notas (AI summary + list preview). The transcript table is
      // created in createTables, which runs on every startup.
      // `category` is in CREATE TABLE but older production tables predate it,
      // while the legacy notes PUT and category rename/delete still
      // `UPDATE notes SET category` (they fail with 42703 without it).
      const notesSummaryMigrations = [
        'ALTER TABLE notes ADD COLUMN IF NOT EXISTS category TEXT',
        'ALTER TABLE notes ADD COLUMN IF NOT EXISTS summary TEXT',
        'ALTER TABLE notes ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMP',
        // What the notes said when the summary was generated (notesFingerprint)
        'ALTER TABLE notes ADD COLUMN IF NOT EXISTS summary_notes_fingerprint TEXT',
        // One AI sentence about the note, written with the summary (the list's description)
        'ALTER TABLE notes ADD COLUMN IF NOT EXISTS summary_brief TEXT',
        'ALTER TABLE notes ADD COLUMN IF NOT EXISTS preview TEXT',
        // User-editable note date (YYYY-MM-DD); NULL = the creation day
        'ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_date TEXT',
        // The user removed the note's date: no date shown
        'ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_date_removed BOOLEAN DEFAULT FALSE',
        // Tasks created from a note's next steps point back to it
        'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_note_id TEXT',
        'CREATE INDEX IF NOT EXISTS idx_tasks_source_note_id ON tasks (source_note_id) WHERE source_note_id IS NOT NULL',
      ];
      for (const migration of notesSummaryMigrations) {
        try {
          await client.query(migration);
        } catch (e) {
          // Column already exists, ignore
        }
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

    // Migration: Create task_reminders table for existing SQLite databases
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS task_reminders (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        schedule_type TEXT NOT NULL,
        config TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
        trigger_at DATETIME,
        status TEXT NOT NULL DEFAULT 'pending',
        sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )`);
    } catch (e) {
      // Table already exists, ignore
    }

    try {
      await db.exec(
        'CREATE INDEX IF NOT EXISTS idx_task_reminders_trigger ON task_reminders (status, trigger_at)'
      );
    } catch (e) {
      // Index already exists, ignore
    }

    try {
      await db.exec(
        'CREATE INDEX IF NOT EXISTS idx_task_reminders_task ON task_reminders (task_id)'
      );
    } catch (e) {
      // Index already exists, ignore
    }

    // Migration: Add delivery-attempt tracking to task_reminders. Without a
    // persisted attempt counter a failing delivery is retried by the
    // every-minute scheduler forever, which bills one provider fee per retry.
    const reminderAttemptMigrationsSqlite = [
      'ALTER TABLE task_reminders ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE task_reminders ADD COLUMN last_error TEXT',
      'ALTER TABLE task_reminders ADD COLUMN last_attempt_at DATETIME',
    ];
    for (const migration of reminderAttemptMigrationsSqlite) {
      try {
        await db.exec(migration);
      } catch (e) {
        // Column already exists, ignore
      }
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

    // Migration: Add reconciliation_started_at column to users (claim lock
    // used to avoid duplicate concurrent memory reconciliation runs)
    try {
      await db.exec('ALTER TABLE users ADD COLUMN reconciliation_started_at DATETIME');
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

    // Migration: Add recurrence columns (until / parent / next-occurrence marker) to tasks table (SQLite)
    const recurrenceTaskMigrationsSqlite = [
      'ALTER TABLE tasks ADD COLUMN recurrence_until DATETIME',
      'ALTER TABLE tasks ADD COLUMN recurrence_parent_id TEXT',
      'ALTER TABLE tasks ADD COLUMN recurrence_next_task_id TEXT',
    ];
    for (const migration of recurrenceTaskMigrationsSqlite) {
      try {
        await db.exec(migration);
      } catch (e) {
        // Column already exists, ignore
      }
    }

    try {
      await db.exec(
        'CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_sweep ON tasks (recurrence_type, completed, due_date)'
      );
    } catch (e) {
      // Index already exists, ignore
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

    // Existing users should not receive the first-access modal. New users
    // leave this nullable and get the modal on their first authenticated visit.
    try {
      await db.exec('ALTER TABLE users ADD COLUMN whatsapp_promo_seen_at DATETIME');
      await db.exec(
        'UPDATE users SET whatsapp_promo_seen_at = CURRENT_TIMESTAMP WHERE whatsapp_promo_seen_at IS NULL'
      );
    } catch (e) {
      // Column already exists, ignore
    }

    try {
      await db.exec('ALTER TABLE users ADD COLUMN whatsapp_promo_dismissed_at DATETIME');
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

    // Migration: Add Meta Ads attribution columns to users (SQLite)
    const metaAdsUserMigrationsSqlite = [
      'ALTER TABLE users ADD COLUMN meta_fbc TEXT',
      'ALTER TABLE users ADD COLUMN meta_fbp TEXT',
      'ALTER TABLE users ADD COLUMN meta_event_id TEXT',
    ];
    for (const migration of metaAdsUserMigrationsSqlite) {
      try {
        await db.exec(migration);
      } catch (e) {
        // Column already exists, ignore
      }
    }

    const openaiAdsUserMigrationsSqlite = [
      'ALTER TABLE users ADD COLUMN openai_oppref TEXT',
      'ALTER TABLE users ADD COLUMN openai_obref TEXT',
    ];
    for (const migration of openaiAdsUserMigrationsSqlite) {
      try {
        await db.exec(migration);
      } catch (e) {
        // Column already exists, ignore
      }
    }

    try {
      await db.exec('ALTER TABLE users ADD COLUMN onboarding_completed_at DATETIME');
      await db.exec(
        `UPDATE users
         SET onboarding_completed_at = created_at
         WHERE onboarding_completed_at IS NULL`
      );
    } catch (e) {
      // Column already exists — do not backfill again (would close in-progress onboarding)
    }

    try {
      await db.exec('ALTER TABLE users ADD COLUMN onboarding_journey_completed_at DATETIME');
      await db.exec(
        `UPDATE users
         SET onboarding_journey_completed_at = onboarding_completed_at
         WHERE onboarding_completed_at IS NOT NULL
           AND onboarding_journey_completed_at IS NULL`
      );
    } catch (e) {
      // Column already exists — do not backfill again
    }

    // Migration: Resumo do Dia (WhatsApp daily summary) preferences for SQLite
    try {
      await db.exec('ALTER TABLE users ADD COLUMN daily_summary_enabled BOOLEAN DEFAULT TRUE');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      await db.exec("ALTER TABLE users ADD COLUMN daily_summary_time TEXT DEFAULT '08:00'");
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS daily_summary_deliveries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        summary_date TEXT NOT NULL,
        status TEXT NOT NULL,
        item_count INTEGER NOT NULL DEFAULT 0,
        message TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, summary_date)
      )`);
    } catch (e) {
      // Table already exists, ignore
    }
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS onboarding_rescue_deliveries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, attempt)
      )`);
    } catch (e) {
      // Table already exists, ignore
    }

    // Migration: Planejamento Semanal (Sunday WhatsApp nudge) for SQLite
    try {
      await db.exec('ALTER TABLE users ADD COLUMN weekly_planning_enabled BOOLEAN DEFAULT TRUE');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      await db.exec("ALTER TABLE users ADD COLUMN weekly_planning_time TEXT DEFAULT '19:00'");
    } catch (e) {
      // Column already exists, ignore
    }

    // Migration: Recap de tarefas vencidas (web, once a day on the Tasks page) for SQLite
    try {
      await db.exec('ALTER TABLE users ADD COLUMN overdue_recap_enabled BOOLEAN DEFAULT TRUE');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS weekly_planning_deliveries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        week_start TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, week_start)
      )`);
    } catch (e) {
      // Table already exists, ignore
    }
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS agent_month_usage (
        user_id TEXT NOT NULL,
        month TEXT NOT NULL,
        premium_turns INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, month)
      )`);
    } catch (e) {
      // Table already exists, ignore
    }

    // Migration: Notas (AI summary + list preview) for SQLite
    const notesSummaryMigrations = [
      'ALTER TABLE notes ADD COLUMN summary TEXT',
      'ALTER TABLE notes ADD COLUMN summary_updated_at DATETIME',
      // What the notes said when the summary was generated (notesFingerprint)
      'ALTER TABLE notes ADD COLUMN summary_notes_fingerprint TEXT',
      // One AI sentence about the note, written with the summary (the list's description)
      'ALTER TABLE notes ADD COLUMN summary_brief TEXT',
      'ALTER TABLE notes ADD COLUMN preview TEXT',
      // User-editable note date (YYYY-MM-DD); NULL = the creation day
      'ALTER TABLE notes ADD COLUMN note_date TEXT',
      // The user removed the note's date: no date shown
      'ALTER TABLE notes ADD COLUMN note_date_removed BOOLEAN DEFAULT 0',
      // Tasks created from a note's next steps point back to it
      'ALTER TABLE tasks ADD COLUMN source_note_id TEXT',
      'CREATE INDEX IF NOT EXISTS idx_tasks_source_note_id ON tasks (source_note_id) WHERE source_note_id IS NOT NULL',
    ];
    for (const migration of notesSummaryMigrations) {
      try {
        await db.exec(migration);
      } catch (e) {
        // Column already exists, ignore
      }
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
