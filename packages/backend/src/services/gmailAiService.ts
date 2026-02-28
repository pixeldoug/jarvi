import OpenAI from 'openai';

export interface GmailTaskExtractionInput {
  subject: string;
  sender: string;
  date: string;
  body: string;
}

export interface ExtractedTask {
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | null;
  due_date: string | null;
  time: string | null;
  category: string | null;
  important: boolean;
  is_task: boolean;
}

const TASK_SYSTEM_PROMPT = `You extract actionable tasks from Gmail emails.
Return ONLY valid JSON with this schema:
{
  "title": "string",
  "description": "string | null",
  "priority": "low | medium | high | null",
  "due_date": "YYYY-MM-DD | null",
  "time": "HH:MM | null",
  "category": "string | null",
  "important": "boolean",
  "is_task": "boolean"
}

Rules:
- title must be short and action-oriented when is_task = true.
- description should keep useful context (sender, ask, constraints), concise.
- only set due_date/time when explicit evidence exists in email.
- if email is informational and has no clear action, set is_task = false.
- never return markdown or text outside JSON.`;

let openaiClient: OpenAI | null = null;

const getOpenAIClient = (): OpenAI => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }

  return openaiClient;
};

const safeJsonParse = (rawValue: string | null | undefined): Record<string, unknown> => {
  if (!rawValue) return {};

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const toDateOnly = (date: Date): string => date.toISOString().split('T')[0];

const normalizeDueDate = (rawValue: unknown): string | null => {
  if (typeof rawValue !== 'string') return null;
  const value = rawValue.trim();
  if (!value) return null;

  const strictMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (strictMatch) {
    const parsed = new Date(`${strictMatch[1]}-${strictMatch[2]}-${strictMatch[3]}T12:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return toDateOnly(parsed);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateOnly(parsed);
};

const normalizeTime = (rawValue: unknown): string | null => {
  if (typeof rawValue !== 'string') return null;
  const value = rawValue.trim();
  if (!value) return null;

  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const normalizePriority = (rawValue: unknown): ExtractedTask['priority'] => {
  if (typeof rawValue !== 'string') return null;
  const value = rawValue.trim().toLowerCase();
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return null;
};

const normalizeBoolean = (rawValue: unknown): boolean => {
  if (typeof rawValue === 'boolean') return rawValue;
  return false;
};

const normalizeExtractedTask = (rawValue: Record<string, unknown>): ExtractedTask => {
  const title = typeof rawValue.title === 'string' ? rawValue.title.trim() : '';
  const description =
    typeof rawValue.description === 'string' && rawValue.description.trim().length > 0
      ? rawValue.description.trim()
      : null;
  const category =
    typeof rawValue.category === 'string' && rawValue.category.trim().length > 0
      ? rawValue.category.trim()
      : null;
  const priority = normalizePriority(rawValue.priority);
  const due_date = normalizeDueDate(rawValue.due_date);
  const time = normalizeTime(rawValue.time);
  const important = normalizeBoolean(rawValue.important);
  const is_task = rawValue.is_task === true && title.length > 0;

  return {
    title,
    description,
    priority,
    due_date,
    time,
    category,
    important,
    is_task,
  };
};

const toEmailPrompt = (input: GmailTaskExtractionInput): string =>
  [
    `Subject: ${input.subject || '(no subject)'}`,
    `Sender: ${input.sender || '(unknown sender)'}`,
    `Date: ${input.date || '(unknown date)'}`,
    '',
    'Body:',
    input.body || '(empty body)',
  ].join('\n');

export const extractTaskFromEmail = async (
  input: GmailTaskExtractionInput
): Promise<ExtractedTask> => {
  const openai = getOpenAIClient();
  const now = new Date().toISOString();
  const model = process.env.OPENAI_TASK_MODEL || 'gpt-4o-mini';

  const response = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `${TASK_SYSTEM_PROMPT}\nCurrent datetime: ${now}`,
      },
      {
        role: 'user',
        content: toEmailPrompt(input),
      },
    ],
  });

  return normalizeExtractedTask(safeJsonParse(response.choices[0]?.message?.content));
};
