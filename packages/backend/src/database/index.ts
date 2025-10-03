import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { Pool, Client } from 'pg';

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
      created_at ${timestampType},
      updated_at ${timestampType}
    );`,
    
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      completed ${booleanType} DEFAULT FALSE,
      priority TEXT DEFAULT 'medium',
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
