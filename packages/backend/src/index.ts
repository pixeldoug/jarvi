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
import categoryRoutes from './routes/categoryRoutes';
import listRoutes from './routes/listRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import webhookRoutes from './routes/webhookRoutes';
import userRoutes from './routes/userRoutes';
import earlyAccessRoutes from './routes/earlyAccessRoutes';
import whatsappRoutes from './routes/whatsappRoutes';
import pendingTaskRoutes from './routes/pendingTaskRoutes';
import { CollaborationService } from './services/collaborationService';
import { initializeWhatsappWorker } from './queues/whatsappQueue';

const app = express();
const PORT = process.env.PORT || 3001;

// Keep original protocol/host when running behind reverse proxies (Railway, etc.).
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth rate limiting (disabled in development, restrictive in production)
const authLimiter = process.env.NODE_ENV === 'production' 
  ? rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20, // limit each IP to 20 auth requests per windowMs
      message: { error: 'Too many authentication attempts, please try again later.' },
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
  const productionOrigins = process.env.FRONTEND_ORIGINS
    ? process.env.FRONTEND_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)
    : ['https://app.jarvi.life'];
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? productionOrigins
    : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4173'];
  
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

// Webhooks need raw body (Stripe JSON + Slack form payload) - must be before express.json()
app.use(
  '/webhooks',
  express.raw({
    type: (req) => {
      const contentType = req.headers['content-type'] || '';
      return (
        contentType.includes('application/json') ||
        contentType.includes('application/x-www-form-urlencoded')
      );
    },
  }),
  webhookRoutes
);
app.use('/api/webhooks/whatsapp', express.urlencoded({ extended: false }), whatsappRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Temporary endpoint to check notes table structure
app.get('/debug/notes-table', async (req, res) => {
  try {
    const { getPool, isPostgreSQL } = await import('./database');
    
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      
      try {
        // Check table structure
        const structureResult = await client.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_name = 'notes' 
          ORDER BY ordinal_position
        `);
        
        // Check if table exists and has data
        const countResult = await client.query('SELECT COUNT(*) as count FROM notes');
        
        res.json({
          table_exists: true,
          structure: structureResult.rows,
          count: countResult.rows[0].count,
          timestamp: new Date().toISOString()
        });
      } finally {
        client.release();
      }
    } else {
      res.json({
        database: 'SQLite',
        message: 'SQLite debugging not implemented',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to check notes table',
      message: error?.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/early-access', earlyAccessRoutes);
app.use('/api/pending-tasks', pendingTaskRoutes);
app.use('/api', noteShareRoutes);

// Initialize database and start server
initializeDatabase()
  .then(() => {
    const server = createServer(app);
    
    // Initialize collaboration service
    const collaborationService = new CollaborationService(server);
    initializeWhatsappWorker();
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🤝 Collaboration service initialized`);
      console.log('📱 WhatsApp worker initialized');
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }); 