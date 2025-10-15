import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { initializeDatabase } from './database';
import taskRoutes from './routes/taskRoutes';
import noteRoutes from './routes/noteRoutes';
import noteShareRoutes from './routes/noteShareRoutes';
import authRoutes from './routes/authRoutes';
import { CollaborationService } from './services/collaborationService';

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
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// CORS - configuração para desenvolvimento e produção
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://jarvi.life', 'https://www.jarvi.life']
    : ['http://localhost:3000', 'http://localhost:5173'];
  
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

console.log('🔧 CORS: Permitindo origens:', process.env.NODE_ENV === 'production' ? 'produção' : 'desenvolvimento');
app.use(morgan('combined'));
app.use(express.json());
app.use(limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Debug endpoint for database status (can be removed in production)
app.get('/debug/database', async (req, res) => {
  try {
    const { getPool, isPostgreSQL } = await import('./database');
    
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      
      try {
        const tablesResult = await client.query(
          `SELECT table_name FROM information_schema.tables 
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
        );
        
        const tables = tablesResult.rows.map(row => row.table_name);
        const tableCounts: Record<string, any> = {};
        
        for (const tableName of tables) {
          try {
            const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
            tableCounts[tableName] = countResult.rows[0].count;
          } catch (err: any) {
            tableCounts[tableName] = `Error: ${err?.message || 'Unknown error'}`;
          }
        }
        
        res.json({
          database: 'PostgreSQL',
          tables_exist: tables,
          table_counts: tableCounts,
          total_tables: tables.length,
          timestamp: new Date().toISOString()
        });
      } finally {
        client.release();
      }
    } else {
      res.json({
        database: 'SQLite',
        message: 'SQLite debugging not implemented for this endpoint',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    console.error('Database debug error:', error);
    res.status(500).json({ 
      error: 'Database debug failed', 
      message: error?.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api', noteShareRoutes);

// Initialize database and start server
initializeDatabase()
  .then(() => {
    const server = createServer(app);
    
    // Initialize collaboration service
    const collaborationService = new CollaborationService(server);
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🤝 Collaboration service initialized`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }); 