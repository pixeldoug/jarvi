import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GmailEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  body: string;
  snippet: string;
}

export interface GmailTokens {
  access_token: string;
  refresh_token: string;
}

interface UserGmailRow {
  id: string;
  google_access_token: string;
  google_refresh_token: string;
}

// ---------------------------------------------------------------------------
// OAuth2 client factory
// ---------------------------------------------------------------------------

export const createOAuth2Client = (): OAuth2Client => {
  const clientId = process.env.GOOGLE_CLIENT_ID_OAUTH;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing Gmail OAuth env vars: GOOGLE_CLIENT_ID_OAUTH, GOOGLE_CLIENT_SECRET, GMAIL_REDIRECT_URI',
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

export const generateAuthUrl = (): string => {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });
};

// ---------------------------------------------------------------------------
// Token persistence
// ---------------------------------------------------------------------------

export const saveGmailTokens = async (
  userId: string,
  tokens: GmailTokens,
): Promise<void> => {
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE users
         SET google_access_token = $1,
             google_refresh_token = $2,
             gmail_connected_at = $3,
             updated_at = $4
         WHERE id = $5`,
        [tokens.access_token, tokens.refresh_token, now, now, userId],
      );
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    await db.run(
      `UPDATE users
       SET google_access_token = ?,
           google_refresh_token = ?,
           gmail_connected_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [tokens.access_token, tokens.refresh_token, now, now, userId],
    );
  }
};

export const clearGmailTokens = async (userId: string): Promise<void> => {
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE users
         SET google_access_token = NULL,
             google_refresh_token = NULL,
             gmail_connected_at = NULL,
             updated_at = $1
         WHERE id = $2`,
        [now, userId],
      );
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    await db.run(
      `UPDATE users
       SET google_access_token = NULL,
           google_refresh_token = NULL,
           gmail_connected_at = NULL,
           updated_at = ?
       WHERE id = ?`,
      [now, userId],
    );
  }
};

export const getGmailTokens = async (userId: string): Promise<GmailTokens | null> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT google_access_token, google_refresh_token FROM users WHERE id = $1',
        [userId],
      );
      const row = result.rows[0] as UserGmailRow | undefined;
      if (!row?.google_access_token || !row?.google_refresh_token) return null;
      return { access_token: row.google_access_token, refresh_token: row.google_refresh_token };
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    const row = (await db.get(
      'SELECT google_access_token, google_refresh_token FROM users WHERE id = ?',
      [userId],
    )) as UserGmailRow | undefined;
    if (!row?.google_access_token || !row?.google_refresh_token) return null;
    return { access_token: row.google_access_token, refresh_token: row.google_refresh_token };
  }
};

// ---------------------------------------------------------------------------
// Fetch all gmail-connected users
// ---------------------------------------------------------------------------

export const getGmailConnectedUsers = async (): Promise<Array<{ id: string }>> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id FROM users WHERE google_refresh_token IS NOT NULL AND gmail_connected_at IS NOT NULL',
      );
      return result.rows as Array<{ id: string }>;
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    const rows = (await db.all(
      'SELECT id FROM users WHERE google_refresh_token IS NOT NULL AND gmail_connected_at IS NOT NULL',
    )) as Array<{ id: string }>;
    return rows;
  }
};

// ---------------------------------------------------------------------------
// Authenticated Gmail API client for a user
// ---------------------------------------------------------------------------

const getAuthenticatedClient = async (userId: string): Promise<OAuth2Client> => {
  const tokens = await getGmailTokens(userId);
  if (!tokens) throw new Error(`No Gmail tokens for user ${userId}`);

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });

  // Persist refreshed tokens automatically
  oauth2Client.on('tokens', async (newTokens) => {
    if (newTokens.access_token) {
      await saveGmailTokens(userId, {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      });
    }
  });

  return oauth2Client;
};

// ---------------------------------------------------------------------------
// Email helpers
// ---------------------------------------------------------------------------

const decodeBase64Url = (data: string): string => {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
};

const extractBody = (payload: {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: Array<{ mimeType?: string | null; body?: { data?: string | null } | null }> | null;
} | null | undefined): string => {
  if (!payload) return '';

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = decodeBase64Url(payload.body.data);
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  if (payload.parts && payload.parts.length > 0) {
    const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);

    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      const html = decodeBase64Url(htmlPart.body.data);
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  return '';
};

const getHeader = (
  headers: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  name: string,
): string => {
  const header = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? '';
};

// ---------------------------------------------------------------------------
// Processed email tracking
// ---------------------------------------------------------------------------

export const filterUnprocessedEmails = async (
  userId: string,
  emailIds: string[],
): Promise<string[]> => {
  if (emailIds.length === 0) return [];

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const placeholders = emailIds.map((_, i) => `$${i + 2}`).join(', ');

      // Emails already analyzed (from gmail_processed_emails)
      const processedResult = await client.query(
        `SELECT gmail_message_id FROM gmail_processed_emails
         WHERE user_id = $1 AND gmail_message_id IN (${placeholders})`,
        [userId, ...emailIds],
      );
      const alreadyScanned = new Set<string>(
        (processedResult.rows as Array<{ gmail_message_id: string }>).map((r) => r.gmail_message_id),
      );

      // Emails that already have a pending task (any status: awaiting, confirmed, rejected)
      const pendingResult = await client.query(
        `SELECT gmail_message_id FROM pending_tasks
         WHERE user_id = $1 AND source = 'gmail' AND gmail_message_id IN (${placeholders})`,
        [userId, ...emailIds],
      );
      const alreadyTasked = new Set<string>(
        (pendingResult.rows as Array<{ gmail_message_id: string }>)
          .map((r) => r.gmail_message_id)
          .filter(Boolean),
      );

      return emailIds.filter((id) => !alreadyScanned.has(id) && !alreadyTasked.has(id));
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    const placeholders = emailIds.map(() => '?').join(', ');

    // Emails already analyzed (from gmail_processed_emails)
    const scannedRows = (await db.all(
      `SELECT gmail_message_id FROM gmail_processed_emails
       WHERE user_id = ? AND gmail_message_id IN (${placeholders})`,
      [userId, ...emailIds],
    )) as Array<{ gmail_message_id: string }>;
    const alreadyScanned = new Set<string>(scannedRows.map((r) => r.gmail_message_id));

    // Emails that already have a pending task (any status: awaiting, confirmed, rejected)
    const pendingRows = (await db.all(
      `SELECT gmail_message_id FROM pending_tasks
       WHERE user_id = ? AND source = 'gmail' AND gmail_message_id IN (${placeholders})`,
      [userId, ...emailIds],
    )) as Array<{ gmail_message_id: string }>;
    const alreadyTasked = new Set<string>(
      pendingRows.map((r) => r.gmail_message_id).filter(Boolean),
    );

    return emailIds.filter((id) => !alreadyScanned.has(id) && !alreadyTasked.has(id));
  }
};

export const clearProcessedEmails = async (userId: string): Promise<void> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM gmail_processed_emails WHERE user_id = $1', [userId]);
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    await db.run('DELETE FROM gmail_processed_emails WHERE user_id = ?', [userId]);
  }
};

export const markEmailsAsProcessed = async (
  userId: string,
  emailIds: string[],
): Promise<void> => {
  if (emailIds.length === 0) return;

  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      for (const emailId of emailIds) {
        await client.query(
          `INSERT INTO gmail_processed_emails (id, user_id, gmail_message_id, processed_at)
           VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, gmail_message_id) DO NOTHING`,
          [uuidv4(), userId, emailId, now],
        );
      }
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    for (const emailId of emailIds) {
      await db.run(
        `INSERT OR IGNORE INTO gmail_processed_emails (id, user_id, gmail_message_id, processed_at)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), userId, emailId, now],
      );
    }
  }
};

// ---------------------------------------------------------------------------
// Public API: fetch recent unread emails
// ---------------------------------------------------------------------------

const MAX_EMAILS = Number(process.env.GMAIL_MAX_EMAILS_PER_SCAN ?? 20);

export const fetchRecentEmails = async (
  userId: string,
): Promise<GmailEmail[]> => {
  const auth = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  // Fetch all inbox emails from the last 3 days — let the AI decide what's actionable
  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    q: 'in:inbox newer_than:3d -label:spam',
    maxResults: MAX_EMAILS,
  });

  const allMessages = listResponse.data.messages ?? [];
  if (allMessages.length === 0) return [];

  // Filter out emails already analyzed or already linked to a pending task (any status)
  const allIds = allMessages.map((m) => m.id!).filter(Boolean);
  const unprocessedIds = new Set(await filterUnprocessedEmails(userId, allIds));
  const messages = allMessages.filter((m) => m.id && unprocessedIds.has(m.id));

  if (messages.length === 0) return [];

  const emails: GmailEmail[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = detail.data.payload?.headers ?? [];
      const subject = getHeader(headers, 'subject') || '(sem assunto)';
      const from = getHeader(headers, 'from');
      const date = getHeader(headers, 'date');
      const body = extractBody(detail.data.payload);
      const snippet = detail.data.snippet ?? '';

      emails.push({
        id: msg.id,
        threadId: detail.data.threadId ?? msg.id,
        subject,
        from,
        date,
        body: body.slice(0, 3000),
        snippet,
      });
    } catch (err) {
      console.error(`[gmailService] Failed to fetch email ${msg.id}:`, err);
    }
  }

  return emails;
};
