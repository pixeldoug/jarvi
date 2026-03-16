import { Queue, Worker } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { extractTextFromPdfBuffer } from '../services/documentService';
import {
  ExtractedTask,
  extractExplicitDueDateFromText,
  extractTaskFromImage,
  extractTaskFromText,
  transcribeAudio,
} from '../services/openaiService';
import {
  downloadMedia,
  formatTaskConfirmation,
  sendTextMessage,
} from '../services/whatsappService';
import { getIO, hasIO } from '../utils/ioManager';

interface WhatsappMessageJob {
  from: string;
}

export interface WhatsappIncomingMessage {
  from: string;
  content?: string;
  mediaItems?: Array<{
    url: string;
    contentType: string;
    index: number;
  }>;
  messageSid?: string | null;
}

interface AggregatedInboxState {
  from: string;
  contents: string[];
  mediaItems: Array<{
    url: string;
    contentType: string;
    index: number;
  }>;
  messageSid: string | null;
}

interface AggregatedInboxPayload {
  content: string | null;
  latestContent: string | null;
  mediaItems: Array<{ url: string; contentType: string; index: number }>;
  messageSid: string | null;
}

interface UserLookupResult {
  id: string;
}

interface PendingTaskInsertInput {
  userId: string;
  from: string;
  rawContent: string | null;
  transcription: string | null;
  originalWhatsappContent: string | null;
  mediaAttachmentsJson: string | null;
  extracted: ExtractedTask;
  messageSid?: string | null;
}

interface MediaAttachment {
  id: string;
  attachmentType: 'image' | 'audio' | 'video' | 'document';
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  dataUrl: string;
}

const queueConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
};

export const whatsappQueue = new Queue<WhatsappMessageJob>('whatsapp-messages', {
  connection: queueConnection,
});

let whatsappWorker: Worker<WhatsappMessageJob> | null = null;
const AGGREGATION_WINDOW_MS = Number(process.env.WHATSAPP_MESSAGE_AGGREGATION_WINDOW_MS || 8000);
const AGGREGATION_STATE_TTL_MS = Math.max(AGGREGATION_WINDOW_MS * 6, 60_000);

const normalizePhoneLookupVariants = (phone: string): string[] => {
  const digitsOnly = phone.replace(/\D/g, '');
  const withPlus = digitsOnly ? `+${digitsOnly}` : '';
  return [withPlus, digitsOnly].filter(Boolean);
};

const inboxStateKey = (from: string): string => `whatsapp:inbox:${from}`;
const processJobId = (from: string): string => `whatsapp:process:${from}`;

const getInitialInboxState = (from: string): AggregatedInboxState => ({
  from,
  contents: [],
  mediaItems: [],
  messageSid: null,
});

const parseInboxState = (raw: string | null, from: string): AggregatedInboxState => {
  if (!raw) return getInitialInboxState(from);

  try {
    const parsed = JSON.parse(raw) as Partial<AggregatedInboxState>;
    return {
      from,
      contents: Array.isArray(parsed.contents)
        ? parsed.contents.filter((item): item is string => typeof item === 'string')
        : [],
      mediaItems: Array.isArray(parsed.mediaItems)
        ? parsed.mediaItems.filter(
            (item): item is { url: string; contentType: string; index: number } =>
              !!item &&
              typeof item.url === 'string' &&
              typeof item.contentType === 'string' &&
              typeof item.index === 'number'
          )
        : [],
      messageSid: typeof parsed.messageSid === 'string' ? parsed.messageSid : null,
    };
  } catch {
    return getInitialInboxState(from);
  }
};

const uniqueMediaItems = (
  mediaItems: Array<{ url: string; contentType: string; index: number }>
): Array<{ url: string; contentType: string; index: number }> => {
  const seen = new Set<string>();
  const unique: Array<{ url: string; contentType: string; index: number }> = [];

  for (const item of mediaItems) {
    const key = `${item.url}|${item.contentType}|${item.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
};

const scheduleProcessingJob = async (from: string): Promise<void> => {
  const existingJob = await whatsappQueue.getJob(processJobId(from));
  if (existingJob) {
    try {
      await existingJob.remove();
    } catch (error) {
      console.warn('Unable to remove existing WhatsApp aggregation job:', {
        from,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await whatsappQueue.add(
    'process-message',
    { from },
    {
      jobId: processJobId(from),
      delay: AGGREGATION_WINDOW_MS,
      removeOnComplete: true,
      removeOnFail: 100,
    }
  );
};

const consumeAggregatedInbox = async (
  from: string
): Promise<{
  content: string | null;
  latestContent: string | null;
  mediaItems: Array<{ url: string; contentType: string; index: number }>;
  messageSid: string | null;
} | null> => {
  const redis = await whatsappQueue.client;
  const raw = await redis.get(inboxStateKey(from));
  if (!raw) return null;

  await redis.del(inboxStateKey(from));
  const state = parseInboxState(raw, from);
  const content = state.contents
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  const latestContent =
    state.contents.length > 0 ? state.contents[state.contents.length - 1].trim() : '';

  return {
    content: content || null,
    latestContent: latestContent || null,
    mediaItems: state.mediaItems,
    messageSid: state.messageSid,
  };
};

export const enqueueIncomingWhatsappMessage = async (
  input: WhatsappIncomingMessage
): Promise<void> => {
  const from = input.from.trim();
  if (!from) return;

  const redis = await whatsappQueue.client;
  const raw = await redis.get(inboxStateKey(from));
  const state = parseInboxState(raw, from);
  const nextContent = input.content?.trim();

  if (nextContent) {
    state.contents.push(nextContent);
  }

  if (input.mediaItems && input.mediaItems.length > 0) {
    state.mediaItems = uniqueMediaItems([...state.mediaItems, ...input.mediaItems]);
  }

  if (input.messageSid) {
    state.messageSid = input.messageSid;
  }

  await redis.set(
    inboxStateKey(from),
    JSON.stringify(state),
    'PX',
    AGGREGATION_STATE_TTL_MS
  );

  await scheduleProcessingJob(from);
};

const findUserByWhatsappPhone = async (phone: string): Promise<UserLookupResult | null> => {
  const variants = normalizePhoneLookupVariants(phone);
  if (variants.length === 0) {
    return null;
  }

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id
         FROM users
         WHERE whatsapp_verified = TRUE
           AND whatsapp_phone IN ($1, $2)
         LIMIT 1`,
        [variants[0], variants[1] ?? variants[0]]
      );
      return (result.rows[0] as UserLookupResult) ?? null;
    } finally {
      client.release();
    }
  }

  const db = getDatabase();
  const row = await db.get(
    `SELECT id
     FROM users
     WHERE whatsapp_verified = 1
       AND whatsapp_phone IN (?, ?)
     LIMIT 1`,
    [variants[0], variants[1] ?? variants[0]]
  );

  return (row as UserLookupResult) ?? null;
};

const createPendingTask = async (input: PendingTaskInsertInput): Promise<Record<string, unknown>> => {
  const pendingTaskId = uuidv4();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO pending_tasks (
           id, user_id, source, raw_content, transcription, original_whatsapp_content, media_attachments,
           suggested_title, suggested_description,
           suggested_priority, suggested_due_date, suggested_time, suggested_category, status,
           whatsapp_message_sid, whatsapp_phone, expires_at, created_at, updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18, $19
         )`,
        [
          pendingTaskId,
          input.userId,
          'whatsapp',
          input.rawContent,
          input.transcription,
          input.originalWhatsappContent,
          input.mediaAttachmentsJson,
          input.extracted.title,
          input.extracted.description,
          input.extracted.priority,
          input.extracted.due_date,
          input.extracted.time,
          input.extracted.category,
          'awaiting_confirmation',
          input.messageSid ?? null,
          input.from,
          expiresAt,
          now,
          now,
        ]
      );

      const result = await client.query('SELECT * FROM pending_tasks WHERE id = $1', [pendingTaskId]);
      return result.rows[0] as Record<string, unknown>;
    } finally {
      client.release();
    }
  }

  const db = getDatabase();
  await db.run(
    `INSERT INTO pending_tasks (
       id, user_id, source, raw_content, transcription, original_whatsapp_content, media_attachments,
       suggested_title, suggested_description,
       suggested_priority, suggested_due_date, suggested_time, suggested_category, status,
       whatsapp_message_sid, whatsapp_phone, expires_at, created_at, updated_at
     )
     VALUES (
       ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?, ?
     )`,
    [
      pendingTaskId,
      input.userId,
      'whatsapp',
      input.rawContent,
      input.transcription,
      input.originalWhatsappContent,
      input.mediaAttachmentsJson,
      input.extracted.title,
      input.extracted.description,
      input.extracted.priority,
      input.extracted.due_date,
      input.extracted.time,
      input.extracted.category,
      'awaiting_confirmation',
      input.messageSid ?? null,
      input.from,
      expiresAt,
      now,
      now,
    ]
  );

  const pendingTask = await db.get('SELECT * FROM pending_tasks WHERE id = ?', [pendingTaskId]);
  return (pendingTask || {}) as Record<string, unknown>;
};

const processText = async (content: string): Promise<ExtractedTask> => extractTaskFromText(content);

const processAudio = async (
  from: string,
  mediaUrl: string,
  mediaContentType: string,
  originalText: string | null,
  documentContext: string | null
) => {
  await sendTextMessage(from, '⏳ Processando seu áudio...');
  const audioBuffer = await downloadMedia(mediaUrl);
  const transcription = await transcribeAudio(audioBuffer, mediaContentType);
  const promptForExtraction = [
    originalText ? `Texto original do WhatsApp:\n${originalText}` : null,
    `Transcrição do áudio:\n${transcription}`,
    documentContext ? `Contexto extraído de documentos:\n${documentContext}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
  const extracted = await extractTaskFromText(promptForExtraction);

  return {
    extracted,
    transcription,
  };
};

const processImage = async (from: string, mediaUrl: string, mediaContentType: string) => {
  await sendTextMessage(from, '⏳ Analisando sua imagem...');
  const imageBuffer = await downloadMedia(mediaUrl);
  const extracted = await extractTaskFromImage(imageBuffer, mediaContentType);

  return {
    extracted,
    transcription: null,
  };
};

const detectAttachmentType = (
  mimeType: string
): MediaAttachment['attachmentType'] => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
};

const extensionByMimeType = (mimeType: string): string => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
  };

  if (map[mimeType]) return map[mimeType];
  const fallback = mimeType.split('/')[1];
  return fallback || 'bin';
};

const buildMediaAttachment = (
  mimeType: string,
  index: number,
  buffer: Buffer
): MediaAttachment => {
  const attachmentType = detectAttachmentType(mimeType);
  const extension = extensionByMimeType(mimeType);

  return {
    id: `${index}-${Date.now()}`,
    attachmentType,
    mimeType,
    fileName: `${attachmentType}-${index + 1}.${extension}`,
    sizeBytes: buffer.length,
    dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
  };
};

const isPdfMimeType = (mimeType: string): boolean =>
  mimeType.toLowerCase() === 'application/pdf' || mimeType.toLowerCase().endsWith('/pdf');

const appendContext = (base: string | null, extra: string | null): string | null => {
  const normalizedBase = base?.trim() || '';
  const normalizedExtra = extra?.trim() || '';
  const combined = [normalizedBase, normalizedExtra].filter(Boolean).join('\n\n').trim();
  return combined || null;
};

const emitPendingTaskCreated = (userId: string, payload: Record<string, unknown>): void => {
  if (!hasIO()) return;

  getIO().to(`user:${userId}`).emit('pending-task:created', payload);
};

const processAggregatedInboxPayload = async (
  from: string,
  aggregatedInbox: AggregatedInboxPayload
): Promise<void> => {
  const { content, latestContent, mediaItems, messageSid } = aggregatedInbox;

  try {
    const user = await findUserByWhatsappPhone(from);

    if (!user) {
      await sendTextMessage(
        from,
        '❌ Seu número não está vinculado a uma conta Jarvi. Vá em Configurações para vincular.'
      );
      return;
    }

    let extracted: ExtractedTask;
    let transcription: string | null = null;
    const originalWhatsappContent: string | null = content?.trim() || null;
    let rawContent: string | null = originalWhatsappContent;
    const hasMedia = mediaItems.length > 0;
    const hasAudio = mediaItems.some((item) => item.contentType.startsWith('audio/'));
    const hasImage = mediaItems.some((item) => item.contentType.startsWith('image/'));
    const hasText = !!originalWhatsappContent;
    const mediaAttachments: MediaAttachment[] = [];
    const extractedPdfTexts: string[] = [];

    for (const mediaItem of mediaItems) {
      try {
        const mediaBuffer = await downloadMedia(mediaItem.url);
        mediaAttachments.push(
          buildMediaAttachment(mediaItem.contentType, mediaItem.index, mediaBuffer)
        );

        if (isPdfMimeType(mediaItem.contentType)) {
          const parsedPdfText = await extractTextFromPdfBuffer(mediaBuffer);
          if (parsedPdfText) {
            extractedPdfTexts.push(`Documento PDF ${mediaItem.index + 1}:\n${parsedPdfText}`);
          }
        }
      } catch (error) {
        console.error('Failed to download media attachment:', error);
      }
    }

    const documentContext =
      extractedPdfTexts.length > 0
        ? `Trechos extraídos dos PDFs anexados:\n${extractedPdfTexts.join('\n\n')}`
        : null;

    const firstAudioMedia = mediaItems.find((item) => item.contentType.startsWith('audio/'));
    const firstImageMedia = mediaItems.find((item) => item.contentType.startsWith('image/'));

    if (hasAudio) {
      if (!firstAudioMedia) {
        await sendTextMessage(from, 'Não consegui baixar o áudio. Tente enviar novamente.');
        return;
      }

      const audioResult = await processAudio(
        from,
        firstAudioMedia.url,
        firstAudioMedia.contentType || 'audio/ogg',
        originalWhatsappContent,
        documentContext
      );
      extracted = audioResult.extracted;
      transcription = audioResult.transcription;
      rawContent = transcription;
    } else if (hasImage && !hasText) {
      if (!firstImageMedia) {
        await sendTextMessage(from, 'Não consegui baixar a imagem. Tente enviar novamente.');
        return;
      }

      const imageResult = await processImage(
        from,
        firstImageMedia.url,
        firstImageMedia.contentType || 'image/jpeg'
      );
      extracted = imageResult.extracted;
      transcription = imageResult.transcription;
    } else if (hasImage && hasText) {
      if (!firstImageMedia) {
        await sendTextMessage(from, 'Não consegui baixar a imagem. Tente enviar novamente.');
        return;
      }

      const imageResult = await processImage(
        from,
        firstImageMedia.url,
        firstImageMedia.contentType || 'image/jpeg'
      );
      extracted = imageResult.extracted;
      transcription = imageResult.transcription;

      if (!extracted.is_task || !extracted.title) {
        extracted = await processText(
          `${originalWhatsappContent}\n\n[Anexos recebidos: ${
            mediaAttachments.length || mediaItems.length
          }]${documentContext ? `\n\n${documentContext}` : ''}`
        );
      }
    } else if (hasMedia && !hasText) {
      const fallbackText = appendContext(
        originalWhatsappContent
          ? `Mensagem do usuário: ${originalWhatsappContent}`
          : `Usuário enviou ${mediaAttachments.length || mediaItems.length} anexo(s) no WhatsApp.`,
        documentContext
      ) || `Usuário enviou ${mediaAttachments.length || mediaItems.length} anexo(s) no WhatsApp.`;
      extracted = await processText(fallbackText);
      rawContent = fallbackText;
    } else {
      if (!rawContent) {
        await sendTextMessage(from, 'Envie uma mensagem com a tarefa que você quer criar.');
        return;
      }
      const textForExtraction = hasMedia
        ? `${rawContent}\n\n[Anexos recebidos: ${mediaItems.length}]${
            documentContext ? `\n\n${documentContext}` : ''
          }`
        : rawContent;
      extracted = await processText(textForExtraction);
    }

    const dueDateSourceText = originalWhatsappContent || latestContent || '';
    const explicitDueDate = extractExplicitDueDateFromText(dueDateSourceText);
    if (explicitDueDate) {
      extracted = {
        ...extracted,
        due_date: explicitDueDate,
      };
    }

    if (!extracted.is_task || !extracted.title) {
      if (hasMedia && !hasText && !transcription) {
        await sendTextMessage(
          from,
          '📎 Recebi seus anexos. Agora me diga em texto o que você quer que eu transforme em tarefa.'
        );
      } else {
        await sendTextMessage(
          from,
          '🤔 Não entendi como tarefa. Tente descrever claramente o que precisa fazer e quando.'
        );
      }
      return;
    }

    const sourceTypeHint = hasAudio ? 'audio' : hasImage ? 'image' : hasMedia ? 'media' : 'text';
    const rawContentWithDocuments = appendContext(rawContent, documentContext);

    const pendingTask = await createPendingTask({
      userId: user.id,
      from,
      rawContent: rawContentWithDocuments,
      transcription,
      extracted,
      originalWhatsappContent:
        originalWhatsappContent || transcription || `Mensagem sem texto (${sourceTypeHint})`,
      mediaAttachmentsJson: mediaAttachments.length > 0 ? JSON.stringify(mediaAttachments) : null,
      messageSid,
    });

    await sendTextMessage(from, formatTaskConfirmation(extracted));
    emitPendingTaskCreated(user.id, pendingTask);
  } catch (error) {
    console.error('Failed to process WhatsApp message payload:', {
      from,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      await sendTextMessage(
        from,
        '⚠️ Tive um problema para processar sua mensagem agora. Tente novamente em alguns segundos.'
      );
    } catch (sendError) {
      console.error('Failed to send WhatsApp processing error notification:', sendError);
    }
  }
};

const processMessageJob = async (jobData: WhatsappMessageJob): Promise<void> => {
  const { from } = jobData;
  const aggregatedInbox = await consumeAggregatedInbox(from);
  if (!aggregatedInbox) {
    return;
  }

  await processAggregatedInboxPayload(from, aggregatedInbox);
};

export const processIncomingWhatsappMessageDirect = async (
  input: WhatsappIncomingMessage
): Promise<void> => {
  const from = input.from.trim();
  if (!from) return;

  const content = input.content?.trim() || null;
  const mediaItems = uniqueMediaItems(input.mediaItems || []);
  await processAggregatedInboxPayload(from, {
    content,
    latestContent: content,
    mediaItems,
    messageSid: input.messageSid || null,
  });
};

export const initializeWhatsappWorker = (): Worker<WhatsappMessageJob> => {
  if (whatsappWorker) {
    return whatsappWorker;
  }

  whatsappWorker = new Worker<WhatsappMessageJob>(
    'whatsapp-messages',
    async (job) => {
      await processMessageJob(job.data);
    },
    { connection: queueConnection }
  );

  whatsappWorker.on('failed', (job, error) => {
    console.error('WhatsApp worker job failed:', {
      jobId: job?.id,
      error: error.message,
    });
  });

  return whatsappWorker;
};

export const getWhatsappWorker = (): Worker<WhatsappMessageJob> | null => whatsappWorker;
