import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { PostHogOpenAI } from '@posthog/ai/openai';
import { toFile } from 'openai/uploads';
import { getPostHogClient, isEvalAnalyticsDistinctId } from './posthogService';
import { capitalizeTaskTitle } from '../utils/taskTitle';

export interface ExtractedTask {
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | null;
  due_date: string | null;
  time: string | null;
  category: string | null;
  is_task: boolean;
}

const TASK_SYSTEM_PROMPT = `Você é um assistente que extrai tarefas em português.
Retorne sempre JSON válido com os campos:
{
  "title": "string",
  "description": "string | null",
  "priority": "low | medium | high | null",
  "due_date": "ISO 8601 string | null",
  "time": "HH:MM | null",
  "category": "string | null",
  "is_task": boolean
}

Regras:
- title curto e objetivo (obrigatório quando is_task = true)
- Se não parecer tarefa, retorne is_task = false
- Nunca inclua markdown nem texto fora do JSON`;

const MEMORY_UPDATE_SYSTEM_PROMPT = `Você mantém o perfil de memória de um usuário.
Analise a mensagem e verifique se contém informação pessoal nova:
nomes de pessoas ou animais, relacionamentos, localização, preferências, hábitos, eventos, datas importantes, contexto profissional ou pessoal.

Retorne sempre JSON válido:
{ "has_new_info": boolean, "updated_memory": "string | null" }

Se has_new_info = true: updated_memory deve conter a memória completa atualizada, mesclando a anterior com as novas informações. Escreva em terceira pessoa, em português brasileiro.
Se has_new_info = false: updated_memory = null.
Nunca inclua markdown nem texto fora do JSON.`;

/**
 * Manually-versioned identifier for the onboarding prompts in this file,
 * attached to their AI traces so a copy change can be segmented in PostHog.
 * Bump it whenever an onboarding prompt or the deterministic follow-up copy
 * below changes.
 */
export const ONBOARDING_PROMPT_VERSION = '2026-08-22.1';

// Same wrapper-with-fallback pattern as runAgent.ts and core/memory.ts: when
// PostHog is configured these calls emit $ai_generation events (tagged with
// `span`) so their cost and output are visible; otherwise the pure SDK is used.
let openaiClient: OpenAI | null = null;

const getOpenAIClient = (): OpenAI => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  if (!openaiClient) {
    const posthog = getPostHogClient();
    openaiClient = posthog
      ? new PostHogOpenAI({ apiKey: process.env.OPENAI_API_KEY, posthog })
      : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openaiClient;
};

/** Identity and trace attribution for the PostHog AI observability events. */
export interface AiTelemetryOptions {
  /** PostHog distinct_id convention across the backend. */
  email?: string;
  userId?: string;
  /** Groups several calls of the same flow into a single trace. */
  traceId?: string;
}

type OpenAiSpan =
  | 'task_extraction_text'
  | 'task_extraction_image'
  | 'image_description'
  | 'memory_whatsapp'
  | 'onboarding_task_extraction'
  | 'onboarding_follow_up_order';

interface PosthogCallParams {
  posthogDistinctId?: string;
  posthogTraceId?: string;
  posthogProperties?: Record<string, unknown>;
}

const buildPosthogParams = (
  span: OpenAiSpan,
  identity?: AiTelemetryOptions,
  extraProperties?: Record<string, unknown>,
): PosthogCallParams => {
  if (!getPostHogClient()) return {};
  if (identity?.email && isEvalAnalyticsDistinctId(identity.email)) return {};

  const params: PosthogCallParams = {
    posthogTraceId: identity?.traceId ?? randomUUID(),
    posthogProperties: {
      span,
      environment: process.env.NODE_ENV ?? 'development',
      ...(identity?.userId ? { user_id: identity.userId } : {}),
      ...extraProperties,
    },
  };

  if (identity?.email) params.posthogDistinctId = identity.email;
  return params;
};

const safeJsonParse = (value: string | null | undefined): Record<string, unknown> => {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const toTwoDigits = (value: number): string => value.toString().padStart(2, '0');

const isValidDateParts = (year: number, month: number, day: number): boolean => {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const candidate = new Date(year, month - 1, day);
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  );
};

const toDateOnlyString = (year: number, month: number, day: number): string =>
  `${year}-${toTwoDigits(month)}-${toTwoDigits(day)}`;

const normalizeDueDate = (rawDueDate: string | null): string | null => {
  if (!rawDueDate) return null;

  const normalized = rawDueDate.trim();
  if (!normalized) return null;

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    if (isValidDateParts(yearNumber, monthNumber, dayNumber)) {
      return toDateOnlyString(yearNumber, monthNumber, dayNumber);
    }
  }

  const brDateMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (brDateMatch) {
    const dayNumber = Number(brDateMatch[1]);
    const monthNumber = Number(brDateMatch[2]);
    const rawYear = Number(brDateMatch[3]);
    const yearNumber = brDateMatch[3].length === 2 ? 2000 + rawYear : rawYear;
    if (isValidDateParts(yearNumber, monthNumber, dayNumber)) {
      return toDateOnlyString(yearNumber, monthNumber, dayNumber);
    }
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  return toDateOnlyString(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
};

const normalizeToken = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const plusDaysAsDateOnly = (days: number): string => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return toDateOnlyString(date.getFullYear(), date.getMonth() + 1, date.getDate());
};

const monthNameMap: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const extractDueDateFromNormalizedText = (normalizedText: string): string | null => {
  const trimmed = normalizedText.trim();
  if (!trimmed) return null;

  if (/\bdepois de amanha\b/.test(trimmed)) {
    return plusDaysAsDateOnly(2);
  }
  if (/\bamanha\b/.test(trimmed)) {
    return plusDaysAsDateOnly(1);
  }
  if (/\bhoje\b/.test(trimmed)) {
    return plusDaysAsDateOnly(0);
  }

  const fullDateMatch = trimmed.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (fullDateMatch) {
    const day = Number(fullDateMatch[1]);
    const month = Number(fullDateMatch[2]);
    const yearRaw = Number(fullDateMatch[3]);
    const year = fullDateMatch[3].length === 2 ? 2000 + yearRaw : yearRaw;
    if (isValidDateParts(year, month, day)) {
      return toDateOnlyString(year, month, day);
    }
  }

  const textualDateMatch = trimmed.match(
    /\bdia\s+(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b/
  );
  if (textualDateMatch) {
    const day = Number(textualDateMatch[1]);
    const monthName = textualDateMatch[2];
    const month = monthNameMap[monthName];
    const year = textualDateMatch[3] ? Number(textualDateMatch[3]) : new Date().getFullYear();

    if (month && isValidDateParts(year, month, day)) {
      return toDateOnlyString(year, month, day);
    }
  }

  return null;
};

const isDateOnlyInstruction = (normalizedText: string): boolean =>
  /^(hoje|amanha|depois de amanha)$/.test(normalizedText) ||
  /^dia\s+\d{1,2}(?:\s+de\s+[a-z]+(?:\s+de\s+\d{4})?)?$/.test(normalizedText) ||
  /^\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?$/.test(normalizedText);

const hasDirectDateInstructionPattern = (normalizedText: string): boolean =>
  /\b(pra|para)\s+(hoje|amanha|depois de amanha)\b/.test(normalizedText) ||
  /\b(pra|para)\s+dia\s+\d{1,2}(?:\s+de\s+[a-z]+(?:\s+de\s+\d{4})?)?\b/.test(normalizedText) ||
  /\b(pra|para)\s+\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/.test(normalizedText);

const isInstructionLikeText = (normalizedText: string): boolean => {
  if (isDateOnlyInstruction(normalizedText) || hasDirectDateInstructionPattern(normalizedText)) {
    return true;
  }

  return /\b(crie|criar|cria|coloque|coloca|ajuste|ajusta|mude|muda|altere|altera|lembre|lembra|agende|agenda|pagar|pague|faca|fazer|deixe|deixa|vencimento|vencer)\b/.test(
    normalizedText
  );
};

export const extractExplicitDueDateFromText = (text: string): string | null => {
  const normalizedText = normalizeToken(text);
  if (!normalizedText.trim()) return null;

  const segments = normalizedText
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (!isInstructionLikeText(segment)) continue;

    const dueDate = extractDueDateFromNormalizedText(segment);
    if (dueDate) return dueDate;
  }

  return null;
};

const normalizeExtractedTask = (input: Record<string, unknown>): ExtractedTask => {
  const rawTitle = typeof input.title === 'string' ? input.title.trim() : '';
  const rawDescription = typeof input.description === 'string' ? input.description.trim() : null;
  const rawCategory = typeof input.category === 'string' ? input.category.trim() : null;
  const rawDueDate = typeof input.due_date === 'string' ? input.due_date.trim() : null;
  const rawTime = typeof input.time === 'string' ? input.time.trim() : null;
  const rawPriority = typeof input.priority === 'string' ? input.priority.trim().toLowerCase() : null;
  const rawIsTask = input.is_task === true;

  const priority: ExtractedTask['priority'] =
    rawPriority === 'low' || rawPriority === 'medium' || rawPriority === 'high'
      ? rawPriority
      : null;

  const due_date = normalizeDueDate(rawDueDate);
  const time = rawTime && /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : null;
  const title = rawTitle || '';
  const is_task = rawIsTask && title.length > 0;

  return {
    title,
    description: rawDescription && rawDescription.length > 0 ? rawDescription : null,
    priority,
    due_date,
    time,
    category: rawCategory && rawCategory.length > 0 ? rawCategory : null,
    is_task,
  };
};

export const transcribeAudio = async (audioBuffer: Buffer, mimeType: string): Promise<string> => {
  const openai = getOpenAIClient();
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') ? 'mp3' : 'ogg';
  const file = await toFile(audioBuffer, `audio.${ext}`, { type: mimeType });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'pt',
  });

  return transcription.text;
};

export interface ExtractionOptions {
  memoryContext?: string;
  timezone?: string;
}

const buildDateTimeString = (timezone?: string): string => {
  const tz = timezone || 'America/Sao_Paulo';
  try {
    return new Date().toLocaleString('pt-BR', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return new Date().toISOString();
  }
};

export const extractTaskFromText = async (
  text: string,
  options?: ExtractionOptions,
): Promise<ExtractedTask> => {
  const openai = getOpenAIClient();
  const now = buildDateTimeString(options?.timezone);
  const memorySection = options?.memoryContext
    ? `\nContexto sobre o usuário (use para enriquecer título e descrição):\n${options.memoryContext}`
    : '';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${TASK_SYSTEM_PROMPT}${memorySection}\nData/hora atual: ${now}` },
      { role: 'user', content: text },
    ],
    ...buildPosthogParams('task_extraction_text'),
  });

  return normalizeExtractedTask(safeJsonParse(response.choices[0]?.message?.content));
};

export const extractTaskFromImage = async (
  imageBuffer: Buffer,
  mimeType: string,
  options?: ExtractionOptions,
): Promise<ExtractedTask> => {
  const openai = getOpenAIClient();
  const now = buildDateTimeString(options?.timezone);
  const base64Image = imageBuffer.toString('base64');
  const memorySection = options?.memoryContext
    ? `\nContexto sobre o usuário (use para enriquecer título e descrição):\n${options.memoryContext}`
    : '';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${TASK_SYSTEM_PROMPT}${memorySection}\nData/hora atual: ${now}` },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extraia uma tarefa a partir desta imagem.' },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    ...buildPosthogParams('task_extraction_image'),
  });

  return normalizeExtractedTask(safeJsonParse(response.choices[0]?.message?.content));
};

export const analyzeImageForChat = async (
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string> => {
  const openai = getOpenAIClient();
  const base64Image = imageBuffer.toString('base64');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Descreva o conteúdo desta imagem em português, de forma concisa (máximo 4 linhas). Transcreva TEXTUALMENTE qualquer texto identificável visível (nomes de música/produto/empresa, títulos, datas, valores, nomes de pessoas) — esses identificadores são essenciais para nomear a tarefa. Em seguida, aponte qualquer tarefa, compromisso, lembrete ou ação que o usuário possa querer registrar.',
          },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64Image}` },
          },
        ],
      },
    ],
    max_tokens: 200,
    ...buildPosthogParams('image_description'),
  });

  return (
    response.choices[0]?.message?.content?.trim() ||
    'Imagem recebida (conteúdo não identificado).'
  );
};

export const updateMemoryFromWhatsappText = async (
  messageText: string,
  existingMemory: string,
): Promise<string | null> => {
  if (!messageText.trim()) return null;

  const openai = getOpenAIClient();

  const userContent = JSON.stringify({
    existing_memory: existingMemory || '(sem memória ainda)',
    whatsapp_message: messageText,
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: MEMORY_UPDATE_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    ...buildPosthogParams('memory_whatsapp'),
  });

  const parsed = safeJsonParse(response.choices[0]?.message?.content);
  if (parsed.has_new_info === true && typeof parsed.updated_memory === 'string' && parsed.updated_memory.trim()) {
    return parsed.updated_memory.trim();
  }

  return null;
};

export interface OnboardingExtractedTask {
  title: string;
  due_date: string | null;
  time: string | null;
}

const ONBOARDING_TASKS_PROMPT = `Você extrai as primeiras tarefas de um usuário novo, em português.
Retorne JSON válido:
{ "tasks": [ { "title": "string", "due_date": "YYYY-MM-DD | null", "time": "HH:MM | null" } ] }

Regras:
- Extraia no máximo 16 tarefas concretas (ações que a pessoa precisa fazer)
- title curto e objetivo, com a primeira letra maiúscula
- due_date SOMENTE se a pessoa escreveu um prazo explícito (hoje, amanhã, sexta, dia 23, 23/08). Senão null.
- time SOMENTE se mencionou horário. Senão null.
- NUNCA invente data, horário, "amanhã" ou 08:00. Agendar/marcar consulta sem prazo dito = due_date e time null.
- Ignore saudações e texto que não for tarefa
- Nunca inclua markdown nem texto fora do JSON`;

const HAS_EXPLICIT_WHEN =
  /\b(hoje|amanh[ãa]|depois de amanh[ãa]|segunda|ter[cç]a|quarta|quinta|sexta|s[áa]bado|domingo|semana que vem|pr[óo]xima semana|essa semana|este m[eê]s|fim do m[eê]s|dia\s+\d{1,2}|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|às\s*\d|\d{1,2}h|\d{1,2}:\d{2})\b/i;

const withoutInventedSchedule = (
  tasks: OnboardingExtractedTask[],
  sourceText: string,
): OnboardingExtractedTask[] => {
  if (HAS_EXPLICIT_WHEN.test(sourceText)) return tasks;
  return tasks.map((task) => ({ ...task, due_date: null, time: null }));
};

const fallbackTasksFromText = (text: string): OnboardingExtractedTask[] => {
  const lines = text
    .split(/[\n;•\-\u2013]+/)
    .map((line) => line.replace(/^\d+[\.)]\s*/, '').trim())
    .filter((line) => line.length >= 2)
    .slice(0, 16);

  return lines.map((title) => ({
    title: capitalizeTaskTitle(title.slice(0, 200)),
    due_date: null,
    time: null,
  }));
};

export const extractOnboardingTasks = async (
  text: string,
  options?: ExtractionOptions & AiTelemetryOptions,
): Promise<OnboardingExtractedTask[]> => {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const openai = getOpenAIClient();
    const now = buildDateTimeString(options?.timezone);
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${ONBOARDING_TASKS_PROMPT}\nData/hora atual: ${now}` },
        { role: 'user', content: trimmed },
      ],
      ...buildPosthogParams('onboarding_task_extraction', options, {
        onboarding_prompt_version: ONBOARDING_PROMPT_VERSION,
      }),
    });

    const parsed = safeJsonParse(response.choices[0]?.message?.content);
    const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const tasks: OnboardingExtractedTask[] = [];

    for (const item of rawTasks) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === 'string' ? capitalizeTaskTitle(row.title.trim()) : '';
      if (!title) continue;
      const dueRaw = typeof row.due_date === 'string' ? row.due_date : null;
      const timeRaw = typeof row.time === 'string' ? row.time.trim() : '';
      tasks.push({
        title: title.slice(0, 200),
        due_date: normalizeDueDate(dueRaw),
        time: timeRaw.length >= 4 ? timeRaw.slice(0, 5) : null,
      });
      if (tasks.length >= 16) break;
    }

    const resolved = tasks.length > 0 ? tasks : fallbackTasksFromText(trimmed);
    return withoutInventedSchedule(resolved, trimmed);
  } catch (error) {
    console.error('extractOnboardingTasks failed, using line fallback:', error);
    return fallbackTasksFromText(trimmed);
  }
};

export type OnboardingFollowUp = {
  ack: string;
  question: string;
  choices: string[];
  taskTitle?: string;
};

const READY_ACK = 'Tudo pronto, criei suas primeiras tarefas.';
const DEADLINE_CHOICES = ['Hoje', 'Amanhã', 'Essa semana', 'Até o fim do mês', 'Ainda não sei'];
const REMINDER_LEAD_CHOICES = [
  'No dia',
  '1 dia antes',
  '2 dias antes',
  '1 semana antes',
  'Ainda não quero lembrete',
];

type OnboardingTask = { title: string; dueDate?: string | null; time?: string | null };

function formatOnboardingWhen(dueDate: string, time?: string | null): string {
  const [year, month, day] = dueDate.split('-').map(Number);
  if (!year || !month || !day) return dueDate;
  const label = new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
  });
  if (time && time.length >= 4) {
    return `${label}, às ${time.slice(0, 5)}`;
  }
  return label;
}

const ONBOARDING_ORDER_PROMPT = `Você é a Jarvi. As primeiras tarefas de um usuário novo JÁ foram criadas.
Sua única decisão é: por qual delas começar a conversa.

Responda SOMENTE JSON: { "start_with": número }

- start_with é o número da tarefa na lista (a primeira é 1).
- Comece pela mais urgente: prazo mais próximo, risco de multa ou de perder a data, saúde, ou algo que destrava as outras.
- Entre tarefas equivalentes, comece pela que a pessoa citou primeiro.
- Não escreva texto fora do JSON.`;

/**
 * Only the *order* is delegated to the model — the copy itself is composed
 * deterministically below, so a bad completion can never produce off-brand
 * wording. Any failure just starts with the first task.
 */
const pickStartingTaskIndex = async (
  tasks: OnboardingTask[],
  rawText: string,
  options?: AiTelemetryOptions,
): Promise<number> => {
  try {
    const openai = getOpenAIClient();
    const taskLines = tasks
      .map(
        (task, index) =>
          `${index + 1}. ${task.title}${task.dueDate ? ` (prazo: ${task.dueDate})` : ' (sem prazo)'}`,
      )
      .join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: ONBOARDING_ORDER_PROMPT },
        {
          role: 'user',
          content: `Tarefas:\n${taskLines}\n\nTexto original da pessoa:\n${rawText.slice(0, 1500)}`,
        },
      ],
      ...buildPosthogParams('onboarding_follow_up_order', options, {
        onboarding_prompt_version: ONBOARDING_PROMPT_VERSION,
        task_count: tasks.length,
      }),
    });

    const parsed = safeJsonParse(response.choices[0]?.message?.content);
    const position = Number(parsed.start_with);
    if (!Number.isFinite(position)) return 0;

    const index = Math.trunc(position) - 1;
    return index >= 0 && index < tasks.length ? index : 0;
  } catch (error) {
    console.error('pickStartingTaskIndex failed, starting with the first task:', error);
    return 0;
  }
};

const buildFollowUpForTask = (tasks: OnboardingTask[], startIndex: number): OnboardingFollowUp => {
  const task = tasks[startIndex];
  const missingDate = !task.dueDate;

  return {
    ack: READY_ACK,
    question: missingDate
      ? 'Quando você quer que eu te lembre disso?'
      : `Essa tarefa está marcada para ${formatOnboardingWhen(task.dueDate as string, task.time)}. Com quanta antecedência você quer o lembrete?`,
    choices: missingDate ? DEADLINE_CHOICES : REMINDER_LEAD_CHOICES,
    taskTitle: task.title,
  };
};

/**
 * Builds the first assistant message after onboarding. The wording, the
 * question and the choices are fixed copy; the model is only consulted to
 * decide which task the conversation opens with (see `pickStartingTaskIndex`).
 */
export const composeOnboardingFollowUp = async (
  tasks: OnboardingTask[],
  rawText: string,
  options?: AiTelemetryOptions,
): Promise<OnboardingFollowUp> => {
  if (tasks.length === 0) {
    return {
      ack: READY_ACK,
      question: 'Quando você quer que eu te lembre disso?',
      choices: DEADLINE_CHOICES,
    };
  }

  const startIndex = tasks.length === 1 ? 0 : await pickStartingTaskIndex(tasks, rawText, options);
  return buildFollowUpForTask(tasks, startIndex);
};

// `updateTaskFromFollowUp` was removed as part of the unified agent
// migration. Pending-task confirm/reject/update now goes exclusively through
// the REST endpoints in pendingTaskController — the AI agent chat no longer
// has a pending-task tool surface (it was dead: no channel ever populated
// `ctx.pendingTasks`, so the tools/prompt section could never be reached).
