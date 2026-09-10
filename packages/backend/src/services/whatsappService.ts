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

// Approved Utility template ("task_reminder") — works both inside and outside
// the 24h customer-service window, unlike sendTextMessage's freeform body.
const TASK_REMINDER_TEMPLATE_SID = 'HX76262ae33884f71f46e7dd767ea26188';

export const sendReminderTemplateMessage = async (
  to: string,
  taskTitle: string,
  scheduleLabel: string,
): Promise<void> => {
  const client = getTwilioClient();

  await client.messages.create({
    from: getTwilioWhatsappNumber(),
    to: toWhatsappAddress(to),
    contentSid: TASK_REMINDER_TEMPLATE_SID,
    contentVariables: JSON.stringify({ '1': taskTitle, '2': scheduleLabel }),
  });
};

/**
 * Approved Utility templates for the proactive "Resumo do Dia". One per
 * section combination, because Meta allows neither empty variables nor
 * conditionals — so "only tasks today" and "only reminders" need their own
 * body instead of a dead "Lembretes: nenhum" line.
 *
 *   daily_summary            Bom dia, {{1}}! ☀️ / Você tem {{2}} para ficar de olho hoje: / Hoje: {{3}} / Lembretes: {{4}} / Tenha um bom dia! 💜
 *   daily_summary_today      Bom dia, {{1}}! ☀️ / Você tem {{2}} para ficar de olho hoje: / Hoje: {{3}} / Tenha um bom dia! 💜
 *   daily_summary_reminders  Bom dia, {{1}}! ☀️ / Hoje você tem {{2}} para se lembrar: / {{3}} / Tenha um bom dia! 💜
 *
 * {{1}} first name · {{2}} "N coisas" · {{3}}/{{4}} items joined with " · ".
 *
 * All three are Utility (deliverable outside the 24h window, not subject to
 * Meta's marketing caps). Setting `reminders` to null makes
 * `dailySummaryService` fall back to the `full` template with a
 * "nada com vencimento hoje" Hoje line.
 */
export type DailySummaryTemplateVariant = 'full' | 'today' | 'reminders';

export const DAILY_SUMMARY_TEMPLATE_SIDS: Record<DailySummaryTemplateVariant, string | null> = {
  full: 'HX950bb9e0e1e2f0c1f236855d888e5808',
  today: 'HX6c2b7ef61f7dabde19771f1107bc7c22',
  reminders: 'HXcc2f4d5590eedc0971fe38d608a7c291',
};

/**
 * Proactive "Resumo do Dia" message. Which template and what goes in each
 * variable is decided by the backend (`dailySummaryService`); this function
 * only transports it. Being a Utility template it is delivered outside the
 * 24h customer-service window, like task reminders.
 */
export const sendDailySummaryMessage = async (
  to: string,
  message: { variant: DailySummaryTemplateVariant; variables: Record<string, string> },
): Promise<void> => {
  const contentSid = DAILY_SUMMARY_TEMPLATE_SIDS[message.variant];
  if (!contentSid) {
    throw new Error(`Daily summary template "${message.variant}" is not available`);
  }

  const client = getTwilioClient();
  await client.messages.create({
    from: getTwilioWhatsappNumber(),
    to: toWhatsappAddress(to),
    contentSid,
    contentVariables: JSON.stringify(message.variables),
  });
};

export const sendOnboardingWelcomeTemplate = async (
  to: string,
  name: string,
): Promise<void> => {
  const contentSid = process.env.TWILIO_ONBOARDING_WELCOME_CONTENT_SID?.trim();
  const safeName = name.slice(0, 40) || 'oi';
  if (!contentSid) {
    console.warn(
      'TWILIO_ONBOARDING_WELCOME_CONTENT_SID is not set; skipping onboarding welcome WhatsApp.'
    );
    return;
  }

  const client = getTwilioClient();
  await client.messages.create({
    from: getTwilioWhatsappNumber(),
    to: toWhatsappAddress(to),
    contentSid,
    contentVariables: JSON.stringify({ '1': safeName }),
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
