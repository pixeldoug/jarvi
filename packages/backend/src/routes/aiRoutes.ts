import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/requireSubscription';
import { handleChat } from '../controllers/aiController';

// Bypass subscription check in development (same pattern as authLimiter in index.ts)
const subscriptionGuard = process.env.NODE_ENV === 'production'
  ? requireActiveSubscription
  : (_req: Request, _res: Response, next: NextFunction) => next();

const router = Router();

router.post('/chat', authenticateToken, subscriptionGuard, handleChat);

export default router;
