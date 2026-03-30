import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

export interface ExtractedTask {
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | null;
  due_date: string | null;
  time: string | null;
  category: string | null;
  is_task: boolean;
}

export interface PendingTaskContext {
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | null;
  due_date: string | null;
  time: string | null;
  category: string | null;
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

let openaiClient: OpenAI | null = null;

const getOpenAIClient = (): OpenAI => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openaiClient;
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
    model: 'gpt-4o',
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
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Descreva o conteúdo desta imagem em português, de forma concisa (máximo 3 linhas), focando em qualquer tarefa, compromisso, lembrete ou ação que o usuário possa querer registrar.',
          },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64Image}` },
          },
        ],
      },
    ],
    max_tokens: 200,
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
  });

  const parsed = safeJsonParse(response.choices[0]?.message?.content);
  if (parsed.has_new_info === true && typeof parsed.updated_memory === 'string' && parsed.updated_memory.trim()) {
    return parsed.updated_memory.trim();
  }

  return null;
};

export const updateTaskFromFollowUp = async (
  currentTask: PendingTaskContext,
  followUpMessage: string,
  extraContext?: string | null
): Promise<ExtractedTask> => {
  const openai = getOpenAIClient();
  const now = new Date().toISOString();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Você atualiza uma tarefa pendente com base em mensagens de continuação do usuário.
Retorne APENAS JSON no mesmo schema solicitado anteriormente.
Regras:
- Considere que o usuário está falando da MESMA tarefa por padrão.
- Mantenha os campos atuais quando a nova mensagem não trouxer mudança explícita.
- Use due_date em ISO 8601 (ou null) e time em HH:MM (ou null).
- Retorne is_task=true quando houver título válido.
Data/hora atual: ${now}`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          current_task: currentTask,
          follow_up_message: followUpMessage,
          extra_context: extraContext || null,
        }),
      },
    ],
  });

  const parsed = normalizeExtractedTask(safeJsonParse(response.choices[0]?.message?.content));
  const explicitDueDate = extractExplicitDueDateFromText(followUpMessage);

  return {
    title: parsed.title || currentTask.title,
    description: parsed.description ?? currentTask.description,
    priority: parsed.priority ?? currentTask.priority,
    due_date: explicitDueDate || parsed.due_date || currentTask.due_date,
    time: parsed.time ?? currentTask.time,
    category: parsed.category ?? currentTask.category,
    is_task: true,
  };
};
