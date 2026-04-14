import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import {
  createOAuth2Client,
  saveGmailTokens,
  clearGmailTokens,
  getGmailTokens,
  fetchRecentEmails,
  markEmailsAsProcessed,
  clearProcessedEmails,
} from '../services/gmailService';
import { analyzeEmails } from '../services/gmailAnalysisService';
import { getIO, hasIO } from '../utils/ioManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const insertPendingTask = async (
  userId: string,
  gmailMessageId: string,
  title: string,
  description: string,
  priority: string,
  dueDate: string | null,
  category: string | null,
  rawContent: string,
): Promise<string> => {
  const id = uuidv4();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO pending_tasks (
          id, user_id, source, gmail_message_id, raw_content,
          suggested_title, suggested_description, suggested_priority,
          suggested_due_date, suggested_category,
          status, expires_at, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO NOTHING`,
        [
          id, userId, 'gmail', gmailMessageId, rawContent,
          title, description, priority,
          dueDate, category,
          'awaiting_confirmation', expiresAt, now, now,
        ],
      );
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    await db.run(
      `INSERT OR IGNORE INTO pending_tasks (
        id, user_id, source, gmail_message_id, raw_content,
        suggested_title, suggested_description, suggested_priority,
        suggested_due_date, suggested_category,
        status, expires_at, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, userId, 'gmail', gmailMessageId, rawContent,
        title, description, priority,
        dueDate, category,
        'awaiting_confirmation', expiresAt, now, now,
      ],
    );
  }

  return id;
};

const emitPendingTaskCreated = (userId: string, pendingTaskId: string): void => {
  if (!hasIO()) return;
  getIO().to(`user:${userId}`).emit('pending-task:created', { id: pendingTaskId, source: 'gmail' });
};

// ---------------------------------------------------------------------------
// Reset processed emails — allows re-scanning already-seen emails
// ---------------------------------------------------------------------------

export const gmailResetProcessed = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    await clearProcessedEmails(req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[gmailController] resetProcessed error:', error);
    res.status(500).json({ error: 'Failed to reset processed emails' });
  }
};

// ---------------------------------------------------------------------------
// Gmail OAuth connect — redirects user to Google consent screen
// ---------------------------------------------------------------------------

export const gmailConnect = (req: Request, res: Response): void => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Encode userId in state so we can recover it on callback
    const state = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64url');
    const oauth2Client = createOAuth2Client();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state,
    });

    res.json({ url: authUrl });
  } catch (error) {
    console.error('[gmailController] connect error:', error);
    res.status(500).json({ error: 'Failed to generate Gmail auth URL' });
  }
};

// ---------------------------------------------------------------------------
// Gmail OAuth callback — exchanges code for tokens and stores them
// ---------------------------------------------------------------------------

export const gmailCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error: oauthError } = req.query as Record<string, string>;

    if (oauthError) {
      const redirectBase = process.env.FRONTEND_URL ?? 'http://localhost:3000';
      res.redirect(`${redirectBase}/settings?gmail=error&reason=${oauthError}`);
      return;
    }

    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state' });
      return;
    }

    let userId: string;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as {
        userId: string;
      };
      userId = decoded.userId;
    } catch {
      res.status(400).json({ error: 'Invalid state parameter' });
      return;
    }

    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      const redirectBase = process.env.FRONTEND_URL ?? 'http://localhost:3000';
      res.redirect(`${redirectBase}/settings?gmail=error&reason=no_refresh_token`);
      return;
    }

    await saveGmailTokens(userId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    const redirectBase = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    res.redirect(`${redirectBase}/settings?gmail=connected`);
  } catch (error) {
    console.error('[gmailController] callback error:', error);
    res.status(500).json({ error: 'Failed to complete Gmail OAuth' });
  }
};

// ---------------------------------------------------------------------------
// Disconnect Gmail
// ---------------------------------------------------------------------------

export const gmailDisconnect = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await clearGmailTokens(req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[gmailController] disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Gmail' });
  }
};

// ---------------------------------------------------------------------------
// Get Gmail connection status
// ---------------------------------------------------------------------------

export const gmailStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const tokens = await getGmailTokens(req.user.id);
    res.json({ connected: tokens !== null });
  } catch (error) {
    console.error('[gmailController] status error:', error);
    res.status(500).json({ error: 'Failed to get Gmail status' });
  }
};

// ---------------------------------------------------------------------------
// Sync now — manually trigger email scan for current user
// ---------------------------------------------------------------------------

export const gmailSyncNow = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const userId = req.user.id;
    const tokens = await getGmailTokens(userId);
    if (!tokens) {
      res.status(400).json({ error: 'Gmail not connected' });
      return;
    }

    const emails = await fetchRecentEmails(userId);
    if (emails.length === 0) {
      res.json({ created: 0, analyzed: 0 });
      return;
    }

    const results = await analyzeEmails(emails);
    let created = 0;
    const successfullyAnalyzedIds: string[] = [];

    for (const { email, suggestion, analyzed } of results) {
      if (analyzed) successfullyAnalyzedIds.push(email.id);
      if (!suggestion.isActionable || !suggestion.title) continue;

      const rawContent = `De: ${email.from}\nAssunto: ${email.subject}\nData: ${email.date}\n\n${email.snippet}`;
      const pendingId = await insertPendingTask(
        userId,
        email.id,
        suggestion.title,
        suggestion.description,
        suggestion.priority,
        suggestion.due_date,
        suggestion.category,
        rawContent,
      );

      emitPendingTaskCreated(userId, pendingId);
      created++;
    }

    // Only mark emails that were successfully analyzed — failed ones remain eligible for retry
    await markEmailsAsProcessed(userId, successfullyAnalyzedIds);

    res.json({ created, analyzed: emails.length });
  } catch (error) {
    console.error('[gmailController] syncNow error:', error);
    res.status(500).json({ error: 'Failed to sync Gmail emails' });
  }
};
