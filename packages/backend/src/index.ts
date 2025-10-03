import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { initializeDatabase } from './database';
import taskRoutes from './routes/taskRoutes';
import noteRoutes from './routes/noteRoutes';
import authRoutes from './routes/authRoutes';

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth rate limiting (disabled in development, restrictive in production)
const authLimiter = process.env.NODE_ENV === 'production' 
  ? rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // limit each IP to 5 auth requests per windowMs
      message: 'Too many authentication attempts, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    })
  : (req: any, res: any, next: any) => next(); // No rate limiting in development

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', // Em desenvolvimento permite tudo, produção será restrito
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
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
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);

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