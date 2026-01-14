import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

export interface DatabaseConfig {
  filename: string;
  driver: any;
}

export const getDatabaseConfig = (): DatabaseConfig => ({
  filename: process.env.DATABASE_URL || './jarvi.db',
  driver: sqlite3.Database,
});

let db: Database;

export const initializeDatabase = async (): Promise<void> => {
  const config = getDatabaseConfig();

  db = await open(config);

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      completed BOOLEAN DEFAULT FALSE,
      priority TEXT,
      category TEXT,
      important BOOLEAN DEFAULT FALSE,
      time TEXT,
      due_date DATETIME,
      recurrence_type TEXT DEFAULT 'none',
      recurrence_config TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT,
      tags TEXT,
      is_favorite BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS note_shares (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      shared_with_user_id TEXT NOT NULL,
      permission TEXT DEFAULT 'read', -- 'read' or 'write'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
      FOREIGN KEY (owner_id) REFERENCES users (id),
      FOREIGN KEY (shared_with_user_id) REFERENCES users (id),
      UNIQUE(note_id, shared_with_user_id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      date DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      frequency TEXT NOT NULL,
      target INTEGER DEFAULT 1,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES habits (id)
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL,
      completed BOOLEAN NOT NULL,
      date DATETIME NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (habit_id) REFERENCES habits (id)
    );
  `);

  // Migração: adicionar colunas que podem estar faltando
  try {
    await db.exec(`
      ALTER TABLE tasks ADD COLUMN important BOOLEAN DEFAULT FALSE;
    `);
  } catch (e) {
    // Coluna já existe, ignorar erro
  }

  try {
    await db.exec(`
      ALTER TABLE tasks ADD COLUMN time TEXT;
    `);
  } catch (e) {
    // Coluna já existe, ignorar erro
  }

  try {
    await db.exec(`
      ALTER TABLE tasks ADD COLUMN recurrence_type TEXT DEFAULT 'none';
    `);
  } catch (e) {
    // Coluna já existe, ignorar erro
  }

  try {
    await db.exec(`
      ALTER TABLE tasks ADD COLUMN recurrence_config TEXT;
    `);
  } catch (e) {
    // Coluna já existe, ignorar erro
  }

  try {
    await db.exec(`
      ALTER TABLE notes ADD COLUMN category TEXT;
    `);
  } catch (e) {
    // Coluna já existe, ignorar erro
  }

  console.log('✅ Database initialized successfully');
};

export const getDatabase = (): Database => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

export const closeDatabase = async (): Promise<void> => {
  if (db) {
    await db.close();
  }
};
