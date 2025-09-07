#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

// Configurações
const SQLITE_PATH = path.join(__dirname, '../packages/backend/jarvi.db');
const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/jarvi';

console.log('🔄 Starting data migration from SQLite to PostgreSQL...');

// Conecta ao SQLite local
const db = new sqlite3.Database(SQLITE_PATH, (err) => {
  if (err) {
    console.error('❌ Error connecting to SQLite:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite database');
});

// Conecta ao PostgreSQL de produção
const pgPool = new Pool({
  connectionString: POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrateUser(email) {
  return new Promise((resolve, reject) => {
    // Busca usuário no SQLite
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        reject(err);
        return;
      }

      if (!user) {
        reject(new Error(`User ${email} not found in SQLite`));
        return;
      }

      console.log(`📁 Found user: ${user.name} (${user.email})`);

      try {
        // Verifica se usuário já existe no PostgreSQL
        const pgClient = await pgPool.connect();
        const existingUser = await pgClient.query('SELECT * FROM users WHERE email = $1', [email]);

        if (existingUser.rows.length === 0) {
          // Insere usuário no PostgreSQL
          await pgClient.query(
            `INSERT INTO users (id, email, name, password, avatar, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user.id, user.email, user.name, user.password, user.avatar, user.created_at, user.updated_at]
          );
          console.log(`✅ User migrated: ${user.email}`);
        } else {
          console.log(`⚠️ User already exists in PostgreSQL: ${user.email}`);
        }

        pgClient.release();
        resolve(user);
      } catch (pgErr) {
        console.error('❌ PostgreSQL error:', pgErr.message);
        reject(pgErr);
      }
    });
  });
}

async function migrateTasks(userId) {
  return new Promise((resolve, reject) => {
    // Busca tarefas no SQLite
    db.all('SELECT * FROM tasks WHERE user_id = ?', [userId], async (err, tasks) => {
      if (err) {
        reject(err);
        return;
      }

      console.log(`📋 Found ${tasks.length} tasks for user ${userId}`);

      if (tasks.length === 0) {
        resolve([]);
        return;
      }

      try {
        const pgClient = await pgPool.connect();

        for (const task of tasks) {
          // Verifica se tarefa já existe
          const existingTask = await pgClient.query('SELECT * FROM tasks WHERE id = $1', [task.id]);

          if (existingTask.rows.length === 0) {
            await pgClient.query(
              `INSERT INTO tasks (id, user_id, title, description, completed, priority, category, due_date, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                task.id, task.user_id, task.title, task.description, 
                task.completed, task.priority, task.category, task.due_date,
                task.created_at, task.updated_at
              ]
            );
            console.log(`✅ Task migrated: "${task.title}"`);
          } else {
            console.log(`⚠️ Task already exists: "${task.title}"`);
          }
        }

        pgClient.release();
        resolve(tasks);
      } catch (pgErr) {
        console.error('❌ PostgreSQL error:', pgErr.message);
        reject(pgErr);
      }
    });
  });
}

async function main() {
  try {
    const email = 'doughenrique93@gmail.com';
    
    // 1. Migra usuário
    console.log(`\n🔄 Step 1: Migrating user ${email}...`);
    const user = await migrateUser(email);
    
    // 2. Migra tarefas
    console.log(`\n🔄 Step 2: Migrating tasks for ${email}...`);
    const tasks = await migrateTasks(user.id);
    
    console.log(`\n🎉 Migration completed successfully!`);
    console.log(`✅ User: ${user.email}`);
    console.log(`✅ Tasks: ${tasks.length} migrated`);
    
    console.log(`\n📋 Migrated tasks:`);
    tasks.forEach(task => {
      console.log(`  • ${task.title} (${task.completed ? '✅' : '⭕'} ${task.priority})`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    db.close();
    await pgPool.end();
  }
}

main().catch(console.error);
