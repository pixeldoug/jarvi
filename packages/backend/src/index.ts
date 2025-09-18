import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { initializeDatabase } from './database';
import taskRoutes from './routes/taskRoutes';
import authRoutes from './routes/authRoutes';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', // Em desenvolvimento permite tudo, produção será restrito
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Migration endpoint (temporary - will be removed after migration)
app.get('/migrate/add-columns', async (req, res) => {
  try {
    const { getPool, isPostgreSQL } = await import('./database');
    
    if (!isPostgreSQL()) {
      return res.json({ error: 'Migration only needed for PostgreSQL' });
    }

    const pool = getPool();
    const client = await pool.connect();
    
    try {
      // Check if important column exists
      const importantColumnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'important'
      `);

      // Check if time column exists
      const timeColumnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'time'
      `);

      const migrations = [];

      // Add important column if it doesn't exist
      if (importantColumnCheck.rows.length === 0) {
        await client.query(`ALTER TABLE tasks ADD COLUMN important BOOLEAN DEFAULT FALSE`);
        migrations.push('Added important column');
      }

      // Add time column if it doesn't exist
      if (timeColumnCheck.rows.length === 0) {
        await client.query(`ALTER TABLE tasks ADD COLUMN time TEXT`);
        migrations.push('Added time column');
      }

      res.json({
        success: true,
        migrations: migrations.length > 0 ? migrations : ['No migrations needed'],
        timestamp: new Date().toISOString()
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Migration error:', error);
    res.status(500).json({ 
      error: 'Migration failed', 
      message: error?.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint for database status (can be removed in production)
// app.get('/debug/database', async (req, res) => {
//   try {
//     const { getPool, isPostgreSQL } = await import('./database');
//     
//     if (isPostgreSQL()) {
//       const pool = getPool();
//       const client = await pool.connect();
//       
//       try {
//         const tablesResult = await client.query(
//           `SELECT table_name FROM information_schema.tables 
//            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
//         );
//         
//         const tables = tablesResult.rows.map(row => row.table_name);
//         const tableCounts: Record<string, any> = {};
//         
//         for (const tableName of tables) {
//           try {
//             const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
//             tableCounts[tableName] = countResult.rows[0].count;
//           } catch (err: any) {
//             tableCounts[tableName] = `Error: ${err?.message || 'Unknown error'}`;
//           }
//         }
//         
//         res.json({
//           database: 'PostgreSQL',
//           tables_exist: tables,
//           table_counts: tableCounts,
//           total_tables: tables.length,
//           timestamp: new Date().toISOString()
//         });
//       } finally {
//         client.release();
//       }
//     } else {
//       res.json({
//         database: 'SQLite',
//         message: 'SQLite debugging not implemented for this endpoint',
//         timestamp: new Date().toISOString()
//       });
//     }
//   } catch (error: any) {
//     console.error('Database debug error:', error);
//     res.status(500).json({ 
//       error: 'Database debug failed', 
//       message: error?.message || 'Unknown error',
//       timestamp: new Date().toISOString()
//     });
//   }
// });

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);

// Initialize database and start server
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }); 