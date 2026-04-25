import { Queue, Worker } from 'bullmq';
import { extractTextFromPdfBuffer } from '../services/documentService';
import { analyzeImageForChat, transcribeAudio } from '../services/openaiService';
import { downloadMedia, sendTextMessage } from '../services/whatsappService';
import { runWhatsappAgent } from '../services/agent';
import { getDatabase, getPool, isPostgreSQL } from '../database';

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

interface QueueConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  family: number;
  tls?: Record<string, never>;
}

// ---------------------------------------------------------------------------
// Redis connection config
// ---------------------------------------------------------------------------

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
      console.warn('Invalid REDIS_URL. Falling back to REDIS_HOST/REDIS_PORT.', {
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

export const whatsappQueue = new Queue<WhatsappMessageJob>('whatsapp-messages', {
  connection: queueConnection,
});

let whatsappWorker: Worker<WhatsappMessageJob> | null = null;
const AGGREGATION_WINDOW_MS = Number(process.env.WHATSAPP_MESSAGE_AGGREGATION_WINDOW_MS || 2000);
const AGGREGATION_STATE_TTL_MS = Math.max(AGGREGATION_WINDOW_MS * 6, 60_000);

// ---------------------------------------------------------------------------
// Inbox aggregation helpers
// ---------------------------------------------------------------------------

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
              typeof item.index === 'number',
          )
        : [],
      messageSid: typeof parsed.messageSid === 'string' ? parsed.messageSid : null,
    };
  } catch {
    return getInitialInboxState(from);
  }
};

const uniqueMediaItems = (
  mediaItems: Array<{ url: string; contentType: string; index: number }>,
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
    },
  );
};

const consumeAggregatedInbox = async (
  from: string,
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
  input: WhatsappIncomingMessage,
): Promise<{ isFirstInBurst: boolean }> => {
  const from = input.from.trim();
  if (!from) return { isFirstInBurst: false };

  const redis = await whatsappQueue.client;
  const raw = await redis.get(inboxStateKey(from));
  const isFirstInBurst = !raw; // no existing inbox state → first message of this turn
  const state = parseInboxState(raw, from);
  const nextContent = input.content?.trim();

  if (nextContent) state.contents.push(nextContent);

  if (input.mediaItems && input.mediaItems.length > 0) {
    state.mediaItems = uniqueMediaItems([...state.mediaItems, ...input.mediaItems]);
  }

  if (input.messageSid) state.messageSid = input.messageSid;

  await redis.set(
    inboxStateKey(from),
    JSON.stringify(state),
    'PX',
    AGGREGATION_STATE_TTL_MS,
  );

  await scheduleProcessingJob(from);
  return { isFirstInBurst };
};

// ---------------------------------------------------------------------------
// User lookup
// ---------------------------------------------------------------------------

const findUserByWhatsappPhone = async (phone: string): Promise<UserLookupResult | null> => {
  const variants = normalizePhoneLookupVariants(phone);
  if (variants.length === 0) return null;

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id FROM users
         WHERE whatsapp_verified = TRUE AND whatsapp_phone IN ($1, $2)
         LIMIT 1`,
        [variants[0], variants[1] ?? variants[0]],
      );
      return (result.rows[0] as UserLookupResult) ?? null;
    } finally {
      client.release();
    }
  }

  const db = getDatabase();
  const row = await db.get(
    `SELECT id FROM users
     WHERE whatsapp_verified = 1 AND whatsapp_phone IN (?, ?)
     LIMIT 1`,
    [variants[0], variants[1] ?? variants[0]],
  );
  return (row as UserLookupResult) ?? null;
};

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

const isPdfMimeType = (mimeType: string): boolean =>
  mimeType.toLowerCase() === 'application/pdf' || mimeType.toLowerCase().endsWith('/pdf');

// ---------------------------------------------------------------------------
// Core message processor
// ---------------------------------------------------------------------------

const processAggregatedInboxPayload = async (
  from: string,
  aggregatedInbox: AggregatedInboxPayload,
): Promise<void> => {
  const { content, mediaItems, messageSid } = aggregatedInbox;

  try {
    const user = await findUserByWhatsappPhone(from);

    if (!user) {
      await sendTextMessage(
        from,
        '❌ Seu número não está vinculado a uma conta Jarvi. Vá em Configurações para vincular.',
      );
      return;
    }

    const redis = await whatsappQueue.client;
    const textParts: string[] = [];

    // Add text content from the message
    const originalText = content?.trim() || null;
    if (originalText) textParts.push(originalText);

    // Process each media item into a text representation
    for (const mediaItem of mediaItems) {
      const { url, contentType } = mediaItem;
      try {
        if (contentType.startsWith('audio/')) {
          await sendTextMessage(from, 'Processando...');
          const buffer = await downloadMedia(url);
          const transcription = await transcribeAudio(buffer, contentType);
          textParts.push(`[Áudio transcrito]: ${transcription}`);
        } else if (contentType.startsWith('image/')) {
          await sendTextMessage(from, 'Processando...');
          const buffer = await downloadMedia(url);
          const description = await analyzeImageForChat(buffer, contentType);
          textParts.push(`[Imagem recebida]: ${description}`);
        } else if (isPdfMimeType(contentType)) {
          const buffer = await downloadMedia(url);
          const pdfText = await extractTextFromPdfBuffer(buffer);
          if (pdfText) textParts.push(`[Documento PDF]: ${pdfText}`);
        }
      } catch (mediaError) {
        console.error('Failed to process media item:', {
          url,
          contentType,
          error: mediaError instanceof Error ? mediaError.message : String(mediaError),
        });
      }
    }

    if (textParts.length === 0) {
      await sendTextMessage(from, 'Envie uma mensagem ou arquivo e eu te ajudo!');
      return;
    }

    const userMessage = textParts.join('\n\n');
    const agentResponse = await runWhatsappAgent(user.id, userMessage, redis, {
      whatsappPhone: from,
      whatsappMessageSid: messageSid ?? undefined,
    });
    await sendTextMessage(from, agentResponse);
  } catch (error) {
    console.error('Failed to process WhatsApp message:', {
      from,
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      await sendTextMessage(
        from,
        '⚠️ Tive um problema para processar sua mensagem agora. Tente novamente em alguns segundos.',
      );
    } catch (sendError) {
      console.error('Failed to send WhatsApp error notification:', sendError);
    }
  }
};

// ---------------------------------------------------------------------------
// Worker setup
// ---------------------------------------------------------------------------

const processMessageJob = async (jobData: WhatsappMessageJob): Promise<void> => {
  const { from } = jobData;
  const aggregatedInbox = await consumeAggregatedInbox(from);
  if (!aggregatedInbox) return;
  await processAggregatedInboxPayload(from, aggregatedInbox);
};

export const processIncomingWhatsappMessageDirect = async (
  input: WhatsappIncomingMessage,
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
  if (whatsappWorker) return whatsappWorker;

  whatsappWorker = new Worker<WhatsappMessageJob>(
    'whatsapp-messages',
    async (job) => {
      await processMessageJob(job.data);
    },
    { connection: queueConnection },
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
