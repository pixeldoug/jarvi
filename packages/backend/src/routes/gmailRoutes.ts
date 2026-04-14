import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  gmailConnect,
  gmailCallback,
  gmailDisconnect,
  gmailStatus,
  gmailSyncNow,
  gmailResetProcessed,
} from '../controllers/gmailController';

const router = Router();

// GET /api/gmail/connect — returns Google OAuth URL (requires auth)
router.get('/connect', authenticateToken, gmailConnect);

// GET /api/gmail/callback — Google redirects here after consent (no auth middleware; uses state param)
router.get('/callback', gmailCallback);

// DELETE /api/gmail/disconnect — removes stored tokens
router.delete('/disconnect', authenticateToken, gmailDisconnect);

// GET /api/gmail/status — returns { connected: boolean }
router.get('/status', authenticateToken, gmailStatus);

// POST /api/gmail/sync — manually trigger email scan for current user
router.post('/sync', authenticateToken, gmailSyncNow);

// DELETE /api/gmail/processed — clear processed email history (re-enables re-scanning)
router.delete('/processed', authenticateToken, gmailResetProcessed);

export default router;
