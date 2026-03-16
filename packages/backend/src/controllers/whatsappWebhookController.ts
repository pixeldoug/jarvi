import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import twilio from 'twilio';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { ExtractedTask, updateTaskFromFollowUp } from '../services/openaiService';
import { formatTaskConfirmation, sendTextMessage } from '../services/whatsappService';
import { enqueueIncomingWhatsappMessage } from '../queues/whatsappQueue';
import { getIO, hasIO } from '../utils/ioManager';

type PendingTaskStatus = 'awaiting_confirmation' | 'confirmed' | 'rejected' | 'expired';

interface PendingTaskRecord {
  id: string;
  user_id: string;
  raw_content: string | null;
  suggested_title: string;
  suggested_description: string | null;
  suggested_priority: string | null;
  suggested_category: string | null;
  suggested_due_date: string | null;
  suggested_time: string | null;
  original_whatsapp_content: string | null;
  media_attachments: string | null;
}

interface IncomingMediaItem {
  url: string;
  contentType: string;
  index: number;
  sizeBytes: number | null;
}

interface PendingTaskMediaAttachment {
  id: string;
  attachmentType: 'image' | 'audio' | 'video' | 'document';
  mimeType: string;
  fileName: string;
  sizeBytes: number | null;
  sourceUrl: string;
}

const isConfirmationText = (value: string): boolean =>
  ['sim', 's', 'yes', 'confirmar', 'ok'].includes(value);

const isRejectionText = (value: string): boolean =>
  ['não', 'nao', 'n', 'no', 'cancelar'].includes(value);

const isExplicitNewTaskInstruction = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  const patterns = [
    /\bnova tarefa\b/,
    /\boutra tarefa\b/,
    /\bcriar outra tarefa\b/,
    /\bcriar nova tarefa\b/,
    /\bnovo lembrete\b/,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
};

const detectAttachmentType = (
  mimeType: string
): PendingTaskMediaAttachment['attachmentType'] => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
};

const guessFileName = (body: string, mimeType: string, index: number): string => {
  const trimmedBody = body.trim();
  if (/\.[a-z0-9]{2,8}$/i.test(trimmedBody)) {
    return trimmedBody;
  }

  const extension = mimeType.split('/')[1] || 'bin';
  const type = detectAttachmentType(mimeType);
  return `${type}-${index + 1}.${extension}`;
};

const isLikelyAutoMediaCaption = (body: string): boolean => {
  const trimmed = body.trim();
  if (!trimmed) return true;
  if (trimmed.length <= 80 && /\.[a-z0-9]{2,8}$/i.test(trimmed)) return true;
  return /^forwarded$/i.test(trimmed);
};

const normalizeWhatsappPhone = (value: string): string => {
  const cleaned = value.replace('whatsapp:', '').trim();
  const digits = cleaned.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
};

const getPhoneLookupVariants = (phone: string): string[] => {
  const normalized = normalizeWhatsappPhone(phone);
  const digitsOnly = normalized.replace(/\D/g, '');
  return [normalized, digitsOnly].filter(Boolean);
};

const findLatestPendingTaskByPhone = async (phone: string): Promise<PendingTaskRecord | null> => {
  const variants = getPhoneLookupVariants(phone);

  if (variants.length === 0) {
    return null;
  }

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id, user_id, raw_content, suggested_title, suggested_description, suggested_priority,
                suggested_category, suggested_due_date, suggested_time, original_whatsapp_content,
                media_attachments
         FROM pending_tasks
         WHERE status = 'awaiting_confirmation'
           AND whatsapp_phone IN ($1, $2)
         ORDER BY created_at DESC
         LIMIT 1`,
        [variants[0], variants[1] ?? variants[0]]
      );

      return (result.rows[0] as PendingTaskRecord) ?? null;
    } finally {
      client.release();
    }
  }

  const db = getDatabase();
  const row = await db.get(
    `SELECT id, user_id, raw_content, suggested_title, suggested_description, suggested_priority,
            suggested_category, suggested_due_date, suggested_time, original_whatsapp_content,
            media_attachments
     FROM pending_tasks
     WHERE status = 'awaiting_confirmation'
       AND whatsapp_phone IN (?, ?)
     ORDER BY created_at DESC
     LIMIT 1`,
    [variants[0], variants[1] ?? variants[0]]
  );

  return (row as PendingTaskRecord) ?? null;
};

const updatePendingTaskStatus = async (taskId: string, status: PendingTaskStatus): Promise<void> => {
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    const pool = getPool();
    await pool.query(
      'UPDATE pending_tasks SET status = $1, updated_at = $2 WHERE id = $3',
      [status, now, taskId]
    );
    return;
  }

  const db = getDatabase();
  await db.run(
    'UPDATE pending_tasks SET status = ?, updated_at = ? WHERE id = ?',
    [status, now, taskId]
  );
};

const mergeContext = (base: string | null, followUp: string): string => {
  const current = base?.trim() || '';
  const next = followUp.trim();
  return [current, next].filter(Boolean).join('\n\n').trim();
};

const parseMediaAttachments = (raw: string | null): PendingTaskMediaAttachment[] => {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PendingTaskMediaAttachment[];
  } catch {
    return [];
  }
};

const appendMediaToPendingTask = async (
  pendingTask: PendingTaskRecord,
  body: string,
  mediaItems: IncomingMediaItem[]
): Promise<number> => {
  const current = parseMediaAttachments(pendingTask.media_attachments);
  const existingUrls = new Set(
    current
      .map((attachment) => (typeof attachment.sourceUrl === 'string' ? attachment.sourceUrl : null))
      .filter(Boolean) as string[]
  );

  const nextAttachments = [...current];
  for (const mediaItem of mediaItems) {
    if (existingUrls.has(mediaItem.url)) continue;
    existingUrls.add(mediaItem.url);
    nextAttachments.push({
      id: `ref-${Date.now()}-${mediaItem.index}`,
      attachmentType: detectAttachmentType(mediaItem.contentType),
      mimeType: mediaItem.contentType,
      fileName: guessFileName(body, mediaItem.contentType, mediaItem.index),
      sizeBytes: mediaItem.sizeBytes,
      sourceUrl: mediaItem.url,
    });
  }

  const now = new Date().toISOString();
  const mergedContext = body.trim()
    ? mergeContext(pendingTask.original_whatsapp_content, body)
    : pendingTask.original_whatsapp_content;

  if (isPostgreSQL()) {
    const pool = getPool();
    await pool.query(
      `UPDATE pending_tasks
       SET media_attachments = $1,
           original_whatsapp_content = $2,
           raw_content = $3,
           updated_at = $4
       WHERE id = $5`,
      [
        JSON.stringify(nextAttachments),
        mergedContext,
        mergeContext(pendingTask.raw_content, body),
        now,
        pendingTask.id,
      ]
    );
  } else {
    const db = getDatabase();
    await db.run(
      `UPDATE pending_tasks
       SET media_attachments = ?,
           original_whatsapp_content = ?,
           raw_content = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        JSON.stringify(nextAttachments),
        mergedContext,
        mergeContext(pendingTask.raw_content, body),
        now,
        pendingTask.id,
      ]
    );
  }

  return nextAttachments.length;
};

const updatePendingTaskFromFollowUp = async (
  pendingTask: PendingTaskRecord,
  followUpMessage: string
): Promise<ExtractedTask> => {
  const updatedTask = await updateTaskFromFollowUp(
    {
      title: pendingTask.suggested_title,
      description: pendingTask.suggested_description,
      priority:
        pendingTask.suggested_priority === 'low' ||
        pendingTask.suggested_priority === 'medium' ||
        pendingTask.suggested_priority === 'high'
          ? pendingTask.suggested_priority
          : null,
      due_date: pendingTask.suggested_due_date,
      time: pendingTask.suggested_time,
      category: pendingTask.suggested_category,
    },
    followUpMessage,
    pendingTask.raw_content
  );

  const now = new Date().toISOString();
  const mergedOriginalContext = mergeContext(pendingTask.original_whatsapp_content, followUpMessage);
  const mergedRawContent = mergeContext(pendingTask.raw_content, followUpMessage);

  if (isPostgreSQL()) {
    const pool = getPool();
    await pool.query(
      `UPDATE pending_tasks
       SET suggested_title = $1,
           suggested_description = $2,
           suggested_priority = $3,
           suggested_due_date = $4,
           suggested_time = $5,
           suggested_category = $6,
           original_whatsapp_content = $7,
           raw_content = $8,
           updated_at = $9
       WHERE id = $10`,
      [
        updatedTask.title,
        updatedTask.description,
        updatedTask.priority,
        updatedTask.due_date,
        updatedTask.time,
        updatedTask.category,
        mergedOriginalContext,
        mergedRawContent,
        now,
        pendingTask.id,
      ]
    );
  } else {
    const db = getDatabase();
    await db.run(
      `UPDATE pending_tasks
       SET suggested_title = ?,
           suggested_description = ?,
           suggested_priority = ?,
           suggested_due_date = ?,
           suggested_time = ?,
           suggested_category = ?,
           original_whatsapp_content = ?,
           raw_content = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        updatedTask.title,
        updatedTask.description,
        updatedTask.priority,
        updatedTask.due_date,
        updatedTask.time,
        updatedTask.category,
        mergedOriginalContext,
        mergedRawContent,
        now,
        pendingTask.id,
      ]
    );
  }

  return updatedTask;
};

const createTaskFromPendingTask = async (pendingTask: PendingTaskRecord): Promise<void> => {
  const taskId = uuidv4();
  const now = new Date().toISOString();
  const context = pendingTask.original_whatsapp_content?.trim() || 'Sem texto original.';
  const aiSummary = pendingTask.suggested_description?.trim() || 'Resumo não informado pela IA.';
  const finalDescription = `${aiSummary}\n\n---\nContexto original (WhatsApp):\n${context}`;

  if (isPostgreSQL()) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO tasks (
         id, user_id, title, description, completed, priority, category, important,
         time, due_date, recurrence_type, recurrence_config, original_whatsapp_content,
         media_attachments, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15, $16
       )`,
      [
        taskId,
        pendingTask.user_id,
        pendingTask.suggested_title,
        finalDescription,
        false,
        pendingTask.suggested_priority,
        pendingTask.suggested_category,
        false,
        pendingTask.suggested_time,
        pendingTask.suggested_due_date,
        'none',
        null,
        pendingTask.original_whatsapp_content,
        pendingTask.media_attachments,
        now,
        now,
      ]
    );
    return;
  }

  const db = getDatabase();
  await db.run(
    `INSERT INTO tasks (
       id, user_id, title, description, completed, priority, category, important,
       time, due_date, recurrence_type, recurrence_config, original_whatsapp_content,
       media_attachments, created_at, updated_at
     )
     VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?, ?, ?
     )`,
    [
      taskId,
      pendingTask.user_id,
      pendingTask.suggested_title,
      finalDescription,
      false,
      pendingTask.suggested_priority,
      pendingTask.suggested_category,
      false,
      pendingTask.suggested_time,
      pendingTask.suggested_due_date,
      'none',
      null,
      pendingTask.original_whatsapp_content,
      pendingTask.media_attachments,
      now,
      now,
    ]
  );
};

const emitPendingTaskUpdate = (userId: string, pendingTaskId: string, status: PendingTaskStatus): void => {
  if (!hasIO()) return;

  getIO().to(`user:${userId}`).emit('pending-task:updated', {
    id: pendingTaskId,
    status,
  });
};

export const handleConfirmation = async (from: string): Promise<void> => {
  const pendingTask = await findLatestPendingTaskByPhone(from);

  if (!pendingTask) {
    await sendTextMessage(
      from,
      'Não encontrei tarefa pendente para confirmação. Envie uma nova mensagem com a tarefa.'
    );
    return;
  }

  await createTaskFromPendingTask(pendingTask);
  await updatePendingTaskStatus(pendingTask.id, 'confirmed');
  emitPendingTaskUpdate(pendingTask.user_id, pendingTask.id, 'confirmed');

  await sendTextMessage(
    from,
    `✅ Tarefa criada com sucesso: "${pendingTask.suggested_title}".`
  );
};

export const handleRejection = async (from: string): Promise<void> => {
  const pendingTask = await findLatestPendingTaskByPhone(from);

  if (!pendingTask) {
    await sendTextMessage(
      from,
      'Não encontrei tarefa pendente para cancelar. Envie uma nova mensagem com a tarefa.'
    );
    return;
  }

  await updatePendingTaskStatus(pendingTask.id, 'rejected');
  emitPendingTaskUpdate(pendingTask.user_id, pendingTask.id, 'rejected');

  await sendTextMessage(from, '❌ Ok! Não vou criar essa tarefa.');
};

const getValidationUrls = (req: Request): string[] => {
  const urls = new Set<string>();
  const configuredWebhookUrl = process.env.TWILIO_WEBHOOK_URL?.trim();
  const host = req.get('host');
  const path = req.originalUrl;

  if (configuredWebhookUrl) {
    urls.add(configuredWebhookUrl);
  }

  if (host) {
    // Keep protocol from proxy headers and include explicit variants as fallback.
    urls.add(`${req.protocol}://${host}${path}`);
    urls.add(`https://${host}${path}`);
    urls.add(`http://${host}${path}`);
  }

  return Array.from(urls);
};

const hasValidTwilioSignature = (
  req: Request,
  signature: string,
  authToken: string
): boolean => {
  const candidateUrls = getValidationUrls(req);

  for (const url of candidateUrls) {
    if (twilio.validateRequest(authToken, signature, url, req.body)) {
      return true;
    }
  }

  console.warn('Twilio signature validation failed', {
    host: req.get('host') || null,
    originalUrl: req.originalUrl,
    attemptedUrls: candidateUrls,
    hasConfiguredWebhookUrl: Boolean(process.env.TWILIO_WEBHOOK_URL),
  });

  return false;
};

export const receiveMessage = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-twilio-signature'];

  if (!signature || typeof signature !== 'string') {
    res.sendStatus(401);
    return;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    res.sendStatus(500);
    return;
  }

  if (!hasValidTwilioSignature(req, signature, authToken)) {
    res.sendStatus(401);
    return;
  }

  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');

  void (async () => {
    try {
      const from = normalizeWhatsappPhone(String(req.body.From || ''));
      const body = String(req.body.Body || '').trim();
      const numMedia = Number.parseInt(String(req.body.NumMedia || '0'), 10);
      const mediaItems: Array<{ url: string; contentType: string; index: number }> = [];
      const detailedMediaItems: IncomingMediaItem[] = [];
      for (let index = 0; index < numMedia; index += 1) {
        const mediaUrl = req.body[`MediaUrl${index}`];
        const mediaContentType = req.body[`MediaContentType${index}`];
        const mediaSizeRaw = req.body[`MediaSize${index}`];
        const mediaSize =
          mediaSizeRaw !== undefined && mediaSizeRaw !== null
            ? Number.parseInt(String(mediaSizeRaw), 10)
            : Number.NaN;
        if (typeof mediaUrl === 'string' && typeof mediaContentType === 'string') {
          mediaItems.push({ url: mediaUrl, contentType: mediaContentType, index });
          detailedMediaItems.push({
            url: mediaUrl,
            contentType: mediaContentType,
            index,
            sizeBytes: Number.isNaN(mediaSize) ? null : mediaSize,
          });
        }
      }

      if (!from) {
        return;
      }

      const normalizedBody = body.toLowerCase();
      const pendingTask = await findLatestPendingTaskByPhone(from);
      if (numMedia === 0 && normalizedBody) {
        if (isConfirmationText(normalizedBody)) {
          await handleConfirmation(from);
          return;
        }

        if (isRejectionText(normalizedBody)) {
          await handleRejection(from);
          return;
        }

        if (pendingTask && !isExplicitNewTaskInstruction(normalizedBody)) {
          const updatedSuggestion = await updatePendingTaskFromFollowUp(pendingTask, body);
          await sendTextMessage(
            from,
            `✍️ Atualizei a sugestão com base na sua mensagem.\n\n${formatTaskConfirmation(
              updatedSuggestion
            )}`
          );
          return;
        }
      }

      if (
        numMedia > 0 &&
        pendingTask &&
        !isExplicitNewTaskInstruction(normalizedBody) &&
        isLikelyAutoMediaCaption(body)
      ) {
        const attachmentCount = await appendMediaToPendingTask(pendingTask, body, detailedMediaItems);
        await sendTextMessage(
          from,
          '📎 Anexo recebido e adicionado à sugestão atual. Se quiser ajustar algo, me diga em texto.'
        );
        return;
      }

      await enqueueIncomingWhatsappMessage({
        from,
        content: body,
        mediaItems,
        messageSid: typeof req.body.MessageSid === 'string' ? req.body.MessageSid : null,
      });
    } catch (error) {
      console.error('Failed to process WhatsApp webhook payload:', error);
    }
  })();
};
