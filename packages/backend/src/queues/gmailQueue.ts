import { Queue, Worker } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { fetchRecentEmails, markEmailsAsProcessed } from '../services/gmailService';
import { analyzeEmails } from '../services/gmailAnalysisService';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { getIO, hasIO } from '../utils/ioManager';

// ---------------------------------------------------------------------------
// Redis connection config (mirrors whatsappQueue.ts)
// ---------------------------------------------------------------------------

interface QueueConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  family: number;
  tls?: Record<string, never>;
}

const getFirstEnvValue = (keys: string[]): string | null => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const parsePort = (rawPort: string | null, fallback: number): number => {
  if (!rawPort) return fallback;
  const parsed = Number.parseInt(rawPort, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const buildQueueConnection = (): QueueConnectionConfig => {
  const envHost = getFirstEnvValue(['REDIS_HOST', 'REDISHOST']) || '127.0.0.1';
  const envPort = parsePort(getFirstEnvValue(['REDIS_PORT', 'REDISPORT']), 6379);
  const envUsername = getFirstEnvValue(['REDIS_USER', 'REDISUSER']);
  const envPassword = getFirstEnvValue(['REDIS_PASSWORD', 'REDISPASSWORD']);
  const redisUrl = getFirstEnvValue(['REDIS_URL', 'REDIS_PUBLIC_URL']);

  if (redisUrl) {
    try {
      const parsedUrl = new URL(redisUrl);
      const connection: QueueConnectionConfig = {
        host: parsedUrl.hostname || envHost,
        port: parsePort(parsedUrl.port || null, envPort),
        family: 0,
      };
      const urlUsername = parsedUrl.username ? decodeURIComponent(parsedUrl.username) : null;
      const urlPassword = parsedUrl.password ? decodeURIComponent(parsedUrl.password) : null;
      const username = urlUsername || envUsername;
      const password = urlPassword || envPassword;
      if (username) connection.username = username;
      if (password) connection.password = password;
      if (parsedUrl.protocol === 'rediss:') connection.tls = {};
      return connection;
    } catch (error) {
      console.warn('[gmailQueue] Invalid REDIS_URL, falling back to REDIS_HOST/REDIS_PORT.', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const connection: QueueConnectionConfig = { host: envHost, port: envPort, family: 0 };
  if (envUsername) connection.username = envUsername;
  if (envPassword) connection.password = envPassword;
  return connection;
};

const queueConnection = buildQueueConnection();

// ---------------------------------------------------------------------------
// Queue definition
// ---------------------------------------------------------------------------

export const gmailQueue = new Queue('gmail-scan', { connection: queueConnection });

let gmailWorker: Worker | null = null;

// ---------------------------------------------------------------------------
// Pending task insertion
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
// Core scan logic — runs for a single user
// ---------------------------------------------------------------------------

const scanUserEmails = async (userId: string): Promise<void> => {
  try {
    const emails = await fetchRecentEmails(userId);
    if (emails.length === 0) return;

    const results = await analyzeEmails(emails);
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
    }

    // Only mark emails that were successfully analyzed — failed ones remain eligible for retry
    await markEmailsAsProcessed(userId, successfullyAnalyzedIds);

    const actionable = results.filter((r) => r.suggestion.isActionable).length;
    console.log(
      `[gmailQueue] user=${userId} scanned=${emails.length} actionable=${actionable}`,
    );
  } catch (error) {
    console.error(`[gmailQueue] Failed to scan emails for user ${userId}:`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// ---------------------------------------------------------------------------
// Worker initialization — on-demand only, no periodic scan
// ---------------------------------------------------------------------------

export const initializeGmailWorker = (): Worker => {
  if (gmailWorker) return gmailWorker;

  gmailWorker = new Worker(
    'gmail-scan',
    async (job) => {
      if (job.name === 'scan-single-user') {
        const { userId } = job.data as { userId: string };
        if (userId) await scanUserEmails(userId);
      }
    },
    { connection: queueConnection },
  );

  gmailWorker.on('failed', (job, error) => {
    console.error('[gmailQueue] Job failed:', {
      jobId: job?.id,
      error: error.message,
    });
  });

  return gmailWorker;
};

// Trigger an immediate scan for a specific user (called from controller syncNow)
export const enqueueSingleUserScan = async (userId: string): Promise<void> => {
  await gmailQueue.add(
    'scan-single-user',
    { userId },
    {
      removeOnComplete: true,
      removeOnFail: 5,
    },
  );
};

export const getGmailWorker = (): Worker | null => gmailWorker;
