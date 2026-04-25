import twilio from 'twilio';

interface TaskConfirmationData {
  title: string;
  due_date?: string | null;
  time?: string | null;
  priority?: string | null;
}

let twilioClient: ReturnType<typeof twilio> | null = null;

const getTwilioCredentials = (): { accountSid: string; authToken: string } => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables are required');
  }

  return { accountSid, authToken };
};

const getTwilioClient = (): ReturnType<typeof twilio> => {
  const { accountSid, authToken } = getTwilioCredentials();

  if (!twilioClient) {
    twilioClient = twilio(accountSid, authToken);
  }

  return twilioClient;
};

const toWhatsappAddress = (value: string): string =>
  value.startsWith('whatsapp:') ? value : `whatsapp:${value}`;

const getTwilioWhatsappNumber = (): string => {
  const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!twilioNumber) {
    throw new Error('TWILIO_WHATSAPP_NUMBER environment variable is required');
  }

  return toWhatsappAddress(twilioNumber);
};

const formatDueDateForPtBr = (rawDueDate: unknown): string | null => {
  if (rawDueDate == null) return null;

  // PostgreSQL driver returns DATE columns as Date objects; normalize to ISO date string.
  if (rawDueDate instanceof Date) {
    if (Number.isNaN(rawDueDate.getTime())) return null;
    const year = rawDueDate.getFullYear();
    const month = String(rawDueDate.getMonth() + 1).padStart(2, '0');
    const day = String(rawDueDate.getDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
  }

  const trimmed = String(rawDueDate).trim();
  if (!trimmed) return null;

  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('pt-BR');
};

const formatTimeForDisplay = (rawTime: unknown): string | null => {
  if (rawTime == null) return null;
  const str = String(rawTime).trim();
  if (!str) return null;
  // PG TIME columns may come back as 'HH:MM:SS' — keep just HH:MM.
  return str.length >= 5 ? str.substring(0, 5) : str;
};

export const sendTextMessage = async (to: string, text: string): Promise<void> => {
  const client = getTwilioClient();

  await client.messages.create({
    from: getTwilioWhatsappNumber(),
    to: toWhatsappAddress(to),
    body: text,
  });
};

export const sendVerificationCode = async (to: string, code: string): Promise<void> => {
  const client = getTwilioClient();

  await client.messages.create({
    from: getTwilioWhatsappNumber(),
    to: toWhatsappAddress(to),
    contentSid: 'HX8830c6449781229c647abbc819285165',
    contentVariables: JSON.stringify({ '1': code }),
  });
};

export const downloadMedia = async (mediaUrl: string): Promise<Buffer> => {
  const { accountSid, authToken } = getTwilioCredentials();
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download Twilio media. Status: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

export const formatTaskConfirmation = (task: TaskConfirmationData): string => {
  const priorityEmoji: Record<string, string> = {
    low: '🟢',
    medium: '🟡',
    high: '🔴',
  };

  const priorityLabel: Record<string, string> = {
    low: 'Baixa prioridade',
    medium: 'Média prioridade',
    high: 'Alta prioridade',
  };

  const lines = ['🤖 *Entendi! Quer criar essa tarefa?*', '', `📌 *${task.title}*`];

  if (task.due_date) {
    const formattedDueDate = formatDueDateForPtBr(task.due_date);
    if (formattedDueDate) {
      lines.push(`📅 ${formattedDueDate}`);
    }
  }

  if (task.time) {
    const formattedTime = formatTimeForDisplay(task.time);
    if (formattedTime) {
      lines.push(`⏰ ${formattedTime}`);
    }
  }

  if (task.priority && priorityEmoji[task.priority]) {
    lines.push(`${priorityEmoji[task.priority]} ${priorityLabel[task.priority]}`);
  }

  lines.push('', 'Responda *sim* para confirmar ou *não* para cancelar.');
  return lines.join('\n');
};
