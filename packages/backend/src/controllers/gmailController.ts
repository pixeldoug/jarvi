import crypto from 'crypto';
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
// OAuth state — HMAC-signed so the callback can't be pointed at another user
// ---------------------------------------------------------------------------

const GMAIL_STATE_TTL_MS = 10 * 60 * 1000;

const gmailStateSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return secret;
};

const signGmailStatePayload = (payload: string): string =>
  crypto.createHmac('sha256', gmailStateSecret()).update(`gmail-oauth:${payload}`).digest('base64url');

export const createGmailState = (userId: string): string => {
  const payload = Buffer.from(
    JSON.stringify({
      uid: userId,
      n: crypto.randomBytes(16).toString('base64url'),
      exp: Date.now() + GMAIL_STATE_TTL_MS,
    }),
  ).toString('base64url');
  return `${payload}.${signGmailStatePayload(payload)}`;
};

/** Returns the user id the state was issued to, or null if forged/expired. */
export const verifyGmailState = (state: unknown): string | null => {
  if (typeof state !== 'string') return null;
  const [payload, signature, extra] = state.split('.');
  if (!payload || !signature || extra !== undefined) return null;

  const expected = Buffer.from(signGmailStatePayload(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      uid?: unknown;
      exp?: unknown;
    };
    if (typeof decoded.uid !== 'string' || typeof decoded.exp !== 'number') return null;
    if (decoded.exp < Date.now()) return null;
    return decoded.uid;
  } catch {
    return null;
  }
};

const frontendGmailAppUrl = (params: Record<string, string>): string => {
  const redirectBase = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  return `${redirectBase}/apps?${new URLSearchParams({ app: 'gmail', ...params }).toString()}`;
};

// ---------------------------------------------------------------------------
// Handoff — the tokens from the callback, AES-256-GCM encrypted, so the web
// app can finish the link with the user's JWT. Only the user the state was
// issued to can redeem it, and nothing in the browser URL is reusable on its
// own (the OAuth code is already spent by then).
// ---------------------------------------------------------------------------

const GMAIL_HANDOFF_TTL_MS = 5 * 60 * 1000;

interface GmailHandoff {
  uid: string;
  at: string;
  rt: string;
  exp: number;
}

const gmailHandoffKey = (): Buffer =>
  crypto.createHash('sha256').update(`gmail-handoff:${gmailStateSecret()}`).digest();

export const sealGmailHandoff = (handoff: GmailHandoff): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', gmailHandoffKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(handoff), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
};

export const openGmailHandoff = (sealed: unknown): GmailHandoff | null => {
  if (typeof sealed !== 'string' || sealed.length > 8192) return null;
  try {
    const raw = Buffer.from(sealed, 'base64url');
    if (raw.length < 29) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', gmailHandoffKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    const handoff = JSON.parse(json) as Partial<GmailHandoff>;
    if (
      typeof handoff.uid !== 'string' ||
      typeof handoff.at !== 'string' ||
      typeof handoff.rt !== 'string' ||
      typeof handoff.exp !== 'number' ||
      handoff.exp < Date.now()
    ) {
      return null;
    }
    return handoff as GmailHandoff;
  } catch {
    return null;
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

    const state = createGmailState(req.user.id);
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
// Gmail OAuth callback — Google redirects here without our bearer token, so
// we can't tell which Jarvi user is in this browser. Spend the code right
// away and hand the web app a sealed handoff; POST /complete then saves it
// only for the user who started the flow (not, e.g., the victim of a connect
// link an attacker sent them).
// ---------------------------------------------------------------------------

export const gmailCallback = async (req: Request, res: Response): Promise<void> => {
  const { code, state, error: oauthError } = req.query as Record<string, string | undefined>;

  if (oauthError) {
    res.redirect(frontendGmailAppUrl({ gmail: 'error', reason: String(oauthError) }));
    return;
  }

  const stateUserId = code && state ? verifyGmailState(state) : null;
  if (!code || !stateUserId) {
    res.redirect(frontendGmailAppUrl({ gmail: 'error', reason: 'invalid_state' }));
    return;
  }

  try {
    const { tokens } = await createOAuth2Client().getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      res.redirect(frontendGmailAppUrl({ gmail: 'error', reason: 'no_refresh_token' }));
      return;
    }

    const handoff = sealGmailHandoff({
      uid: stateUserId,
      at: tokens.access_token,
      rt: tokens.refresh_token,
      exp: Date.now() + GMAIL_HANDOFF_TTL_MS,
    });
    res.redirect(frontendGmailAppUrl({ gmail: 'confirm', handoff }));
  } catch (error) {
    console.error('[gmailController] callback error:', error);
    res.redirect(frontendGmailAppUrl({ gmail: 'error', reason: 'token_exchange_failed' }));
  }
};

// ---------------------------------------------------------------------------
// Gmail OAuth complete — saves the handoff's tokens for the signed-in user
// ---------------------------------------------------------------------------

export const gmailComplete = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const handoff = openGmailHandoff((req.body ?? {}).handoff);
    if (!handoff) {
      res.status(400).json({ error: 'invalid_handoff' });
      return;
    }

    if (handoff.uid !== req.user.id) {
      // Someone else's connect link: this user granted Gmail access to an
      // account that isn't theirs. Kill the grant rather than leave it usable.
      createOAuth2Client()
        .revokeToken(handoff.rt)
        .catch((error) => console.error('[gmailController] revoke after mismatch failed:', error));
      res.status(403).json({ error: 'account_mismatch' });
      return;
    }

    await saveGmailTokens(req.user.id, {
      access_token: handoff.at,
      refresh_token: handoff.rt,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[gmailController] complete error:', error);
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
