import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ingestGmailEmail } from '../controllers/gmailController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const gmailIngestLimiter = process.env.NODE_ENV === 'production'
  ? rateLimit({
      windowMs: 60 * 1000,
      max: Number(process.env.GMAIL_INGEST_RATE_LIMIT_MAX || 12),
      message: { error: 'Too many Gmail ingestion requests, please try again in a minute.' },
      standardHeaders: true,
      legacyHeaders: false,
    })
  : (req: any, res: any, next: any) => next();

router.post('/ingest', gmailIngestLimiter, authenticateToken, ingestGmailEmail);

export default router;
