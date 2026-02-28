import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { ExtractedTask, extractTaskFromEmail } from '../services/gmailAiService';

interface GmailIngestRequestBody {
  subject?: string;
  sender?: string;
  date?: string;
  body?: string;
  source?: string;
  gmailMessageId?: string;
  messageId?: string;
  gmailThreadId?: string;
  threadId?: string;
}

interface PendingTaskInsertInput {
  userId: string;
  source: 'gmail';
  rawContent: string;
  extracted: ExtractedTask;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
}

interface PendingTaskRecord {
  id: string;
  user_id: string;
  source: string;
  raw_content: string | null;
  transcription: string | null;
  suggested_title: string;
  suggested_description: string | null;
  suggested_priority: 'low' | 'medium' | 'high' | null;
  suggested_due_date: string | null;
  suggested_time: string | null;
  suggested_category: string | null;
  suggested_important: boolean;
  status: string;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const textOrEmpty = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const configuredMaxBodyChars = Number(process.env.GMAIL_INGEST_MAX_BODY_CHARS || 12000);
const maxBodyChars = Number.isFinite(configuredMaxBodyChars) && configuredMaxBodyChars > 0
  ? configuredMaxBodyChars
  : 12000;
const truncateText = (value: string, maxChars: number): string =>
  value.length > maxChars ? `${value.slice(0, maxChars)}\n\n[truncated]` : value;
const isDuplicatePendingTaskError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === '23505') return true;
  return typeof candidate.message === 'string' && candidate.message.includes('UNIQUE constraint failed');
};

const buildRawEmailContext = (input: {
  subject: string;
  sender: string;
  date: string;
  body: string;
}): string =>
  [`Subject: ${input.subject}`, `Sender: ${input.sender}`, `Date: ${input.date}`, '', input.body].join(
    '\n'
  );

const findPendingByMessageId = async (
  userId: string,
  gmailMessageId: string
): Promise<PendingTaskRecord | null> => {
  if (isPostgreSQL()) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT *
       FROM pending_tasks
       WHERE user_id = $1
         AND source = 'gmail'
         AND gmail_message_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, gmailMessageId]
    );
    return (result.rows[0] as PendingTaskRecord) ?? null;
  }

  const db = getDatabase();
  const row = await db.get(
    `SELECT *
     FROM pending_tasks
     WHERE user_id = ?
       AND source = 'gmail'
       AND gmail_message_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, gmailMessageId]
  );
  return (row as PendingTaskRecord) ?? null;
};

const createPendingTaskFromExtraction = async (
  input: PendingTaskInsertInput
): Promise<PendingTaskRecord> => {
  const pendingTaskId = uuidv4();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO pending_tasks (
           id, user_id, source, raw_content, transcription,
           suggested_title, suggested_description, suggested_priority, suggested_due_date, suggested_time,
           suggested_category, suggested_important, status, gmail_message_id, gmail_thread_id,
           expires_at, created_at, updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15,
           $16, $17, $18
         )`,
        [
          pendingTaskId,
          input.userId,
          input.source,
          input.rawContent,
          null,
          input.extracted.title,
          input.extracted.description,
          input.extracted.priority,
          input.extracted.due_date,
          input.extracted.time,
          input.extracted.category,
          input.extracted.important,
          'awaiting_confirmation',
          input.gmailMessageId,
          input.gmailThreadId,
          expiresAt,
          now,
          now,
        ]
      );

      const result = await client.query('SELECT * FROM pending_tasks WHERE id = $1', [pendingTaskId]);
      return result.rows[0] as PendingTaskRecord;
    } finally {
      client.release();
    }
  }

  const db = getDatabase();
  await db.run(
    `INSERT INTO pending_tasks (
       id, user_id, source, raw_content, transcription,
       suggested_title, suggested_description, suggested_priority, suggested_due_date, suggested_time,
       suggested_category, suggested_important, status, gmail_message_id, gmail_thread_id,
       expires_at, created_at, updated_at
     )
     VALUES (
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       ?, ?, ?
     )`,
    [
      pendingTaskId,
      input.userId,
      input.source,
      input.rawContent,
      null,
      input.extracted.title,
      input.extracted.description,
      input.extracted.priority,
      input.extracted.due_date,
      input.extracted.time,
      input.extracted.category,
      input.extracted.important,
      'awaiting_confirmation',
      input.gmailMessageId,
      input.gmailThreadId,
      expiresAt,
      now,
      now,
    ]
  );

  const pendingTask = await db.get('SELECT * FROM pending_tasks WHERE id = ?', [pendingTaskId]);
  return pendingTask as PendingTaskRecord;
};

export const ingestGmailEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const payload = (req.body || {}) as GmailIngestRequestBody;
    const source = textOrEmpty(payload.source).toLowerCase() || 'gmail';
    if (source !== 'gmail') {
      res.status(400).json({ error: 'Invalid source. Expected source="gmail".' });
      return;
    }

    const subject = textOrEmpty(payload.subject);
    const sender = textOrEmpty(payload.sender);
    const date = textOrEmpty(payload.date) || new Date().toISOString();
    const body = truncateText(textOrEmpty(payload.body), maxBodyChars);
    const gmailMessageId = textOrEmpty(payload.gmailMessageId || payload.messageId) || null;
    const gmailThreadId = textOrEmpty(payload.gmailThreadId || payload.threadId) || null;

    if (!subject && !body) {
      res.status(400).json({ error: 'Email subject or body is required.' });
      return;
    }

    if (gmailMessageId) {
      const existing = await findPendingByMessageId(userId, gmailMessageId);
      if (existing) {
        res.status(200).json({
          ok: true,
          is_task: existing.status === 'awaiting_confirmation',
          duplicate: true,
          message: 'This Gmail message has already been processed.',
          pendingTask: existing,
        });
        return;
      }
    }

    const normalizedSubject = subject || '(Sem assunto)';
    const normalizedSender = sender || 'Remetente nao identificado';
    const normalizedBody = body || '(Corpo vazio)';
    const rawContent = buildRawEmailContext({
      subject: normalizedSubject,
      sender: normalizedSender,
      date,
      body: normalizedBody,
    });

    const extracted = await extractTaskFromEmail({
      subject: normalizedSubject,
      sender: normalizedSender,
      date,
      body: normalizedBody,
    });

    if (!extracted.is_task || !extracted.title) {
      res.status(200).json({
        ok: true,
        is_task: false,
        message: 'No actionable task detected in this email.',
      });
      return;
    }

    let pendingTask: PendingTaskRecord;
    try {
      pendingTask = await createPendingTaskFromExtraction({
        userId,
        source: 'gmail',
        rawContent,
        extracted,
        gmailMessageId,
        gmailThreadId,
      });
    } catch (error) {
      if (gmailMessageId && isDuplicatePendingTaskError(error)) {
        const existing = await findPendingByMessageId(userId, gmailMessageId);
        if (existing) {
          res.status(200).json({
            ok: true,
            is_task: existing.status === 'awaiting_confirmation',
            duplicate: true,
            message: 'This Gmail message has already been processed.',
            pendingTask: existing,
          });
          return;
        }
      }
      throw error;
    }

    res.status(201).json({
      ok: true,
      is_task: true,
      pendingTask,
    });
  } catch (error) {
    console.error('Error ingesting Gmail email:', error);
    res.status(500).json({
      error: 'Failed to process Gmail email',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
