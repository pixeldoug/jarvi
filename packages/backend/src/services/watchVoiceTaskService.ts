/**
 * Apple Watch "speak a task": the watch records what was said, this turns it
 * into one task. Whisper writes the text, then one small completion splits it
 * into title, day and time. Nothing said is ever lost to the model: when the
 * completion fails or returns nothing usable, the whole text becomes the title
 * and the task goes to today.
 */

import {
  AiTelemetryOptions,
  createWatchVoiceTaskCompletion,
  transcribeAudio,
} from './openaiService';

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TITLE_MAX_LENGTH = 200;

export type VoiceLocale = 'pt-BR' | 'en-US';

export interface VoiceTaskContext {
  /** The watch's local date, YYYY-MM-DD (Gregorian). */
  today: string;
  /** The watch's local time, HH:mm. */
  now: string;
  locale: VoiceLocale;
}

export interface VoiceTask {
  title: string;
  dueDate: string;
  time: string | null;
}

export const isDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const match = value.match(DATE_KEY);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

export const isClockTime = (value: unknown): value is string =>
  typeof value === 'string' && TIME.test(value);

/** Monday… for a YYYY-MM-DD key, in the prompt's language. */
const weekdayOf = (dateKey: string, locale: VoiceLocale): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, {
    weekday: 'long',
    timeZone: 'UTC',
  });
};

export const buildVoiceTaskPrompt = (transcript: string, context: VoiceTaskContext) => ({
  system: `Você transforma o que uma pessoa falou no Apple Watch em UMA tarefa.
Hoje é ${context.today} (${weekdayOf(context.today, 'pt-BR')}) e agora são ${context.now}.

Responda só com JSON: {"title": string, "due_date": "YYYY-MM-DD" | null, "time": "HH:MM" | null}

Regras:
- title: curto, no idioma em que a pessoa falou, começando com letra maiúscula. Tire o dia, a hora e palavras de comando ("lembrar de", "criar tarefa", "adicionar", "remind me to", "add").
- due_date: só se a pessoa disse um dia ("hoje", "amanhã", "sexta", "dia 12", "next Monday"). Dia da semana é o próximo a partir de hoje; se for o dia de hoje, use hoje. Sem dia dito, null.
- time: só se a pessoa disse uma hora ("às 15h", "3 da tarde" = 15:00, "meio-dia" = 12:00, "9pm" = 21:00). Sem hora dita, null.
- Nunca invente dia, hora ou palavras que a pessoa não disse.`,
  user: transcript,
});

const capitalize = (text: string): string =>
  text.length > 0 ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;

const clampTitle = (text: string): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > TITLE_MAX_LENGTH ? `${clean.slice(0, TITLE_MAX_LENGTH - 1)}…` : clean;
};

/**
 * The task the watch gets. The model's day is kept only when it is a real
 * date from today on; a missing or past day means today.
 */
export const parseVoiceTask = (
  raw: Record<string, unknown> | null,
  transcript: string,
  context: VoiceTaskContext,
): VoiceTask => {
  const fallbackTitle = clampTitle(capitalize(transcript.trim().replace(/[.!?…]+$/, '')));
  const rawTitle = typeof raw?.title === 'string' ? clampTitle(raw.title) : '';
  const title = rawTitle ? capitalize(rawTitle) : fallbackTitle;
  const dueDate =
    isDateKey(raw?.due_date) && raw.due_date >= context.today ? raw.due_date : context.today;
  const time = isClockTime(raw?.time) ? raw.time : null;
  return { title, dueDate, time };
};

/**
 * Words that can carry a day or a time ("amanhã", "sexta", "às três",
 * "dia 12", "15h", "tomorrow", "at 9"). Without any of them there is nothing
 * for the model to split, so the title is taken straight from the text and
 * the task goes to today: that skips a completion (about a second) for most
 * spoken tasks. A false match only costs the completion, so when in doubt a
 * word goes in (English "may" and "first" included). Regression cases in
 * watchVoiceTaskService.test.ts.
 */
const PT_HOURS = '(?:\\d|uma|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|meio|meia)';
const EN_HOURS = '(?:\\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon|midnight)';

const DATE_OR_TIME_CUE = new RegExp(
  [
    // Portuguese
    'hoje', 'amanh', 'ontem', 'segunda', 'ter[cç]a', 'quarta', 'quinta', 'sexta', 's[aá]bado',
    'domingo', 'semana', 'm[eê]s', 'pr[oó]xim', 'daqui', 'depois', 'dia\\s+\\S', 'janeiro',
    'fevereiro', 'mar[cç]o', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro',
    'novembro', 'dezembro', 'hora', 'minuto', 'meio[- ]dia', 'meia[- ]noite', 'manh[aã]', 'tarde',
    'noite', `[àa]s\\s+${PT_HOURS}`,
    // English
    'today', 'tonight', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
    'saturday', 'sunday', 'next', 'week', 'month', 'noon', 'midnight', 'morning', 'afternoon',
    'evening', "o'clock", `at\\s+${EN_HOURS}`, 'in\\s+(?:a|an|one|two|three)\\s', 'half\\s+past',
    'quarter\\s+(?:past|to)', 'january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december',
    // Spoken days of the month: "on May first", "the twenty-third"
    'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
    'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth',
    'eighteenth', 'nineteenth', 'twentieth', 'twenty', 'thirtieth', 'thirty',
    // Any number: "dia 12", "15h", "9:30"
    '\\d',
  ]
    // Unicode-aware word start (`\\b` ignores accented letters: "às").
    .map((cue) => `(?<![\\p{L}\\p{N}])${cue}`)
    .join('|'),
  'iu',
);

export const mentionsDateOrTime = (transcript: string): boolean => DATE_OR_TIME_CUE.test(transcript);

/** "Lembrar de comprar pão" → "comprar pão" (what the model would also drop). */
const COMMAND_PREFIX = new RegExp(
  '^(?:' +
    [
      '(?:me\\s+)?lembr(?:ar|e|a)(?:-me)?',
      'anot(?:ar|a|e)',
      'adicion(?:ar|a|e)',
      'cri(?:ar|a|e)(?:\\s+uma)?\\s+tarefa',
      'nova\\s+tarefa',
      'tarefa',
      'remind\\s+me',
      'add(?:\\s+a\\s+task)?',
      'new\\s+task',
      'create\\s+a\\s+task',
    ].join('|') +
    ')\\b[\\s,:]*(?:(?:de|que|para|pra|to)\\b\\s*)?',
  'iu',
);

/** The title when there is no day or time to split out: no command words, no final period. */
export const quickTitle = (transcript: string): string => {
  const trimmed = transcript.trim().replace(/[.!?…]+$/u, '').trim();
  const stripped = trimmed.replace(COMMAND_PREFIX, '').trim();
  return stripped.length > 0 ? stripped : trimmed;
};

export class NoSpeechError extends Error {
  constructor() {
    super('no_speech');
  }
}

/** Whisper, then the split into title, day and time. */
export const transcribeVoiceTask = async (
  audio: Buffer,
  mimeType: string,
  context: VoiceTaskContext,
  telemetry?: AiTelemetryOptions,
): Promise<{ transcript: string; task: VoiceTask }> => {
  const transcript = (
    await transcribeAudio(audio, mimeType, {
      dropNoSpeech: true,
      language: context.locale === 'en-US' ? 'en' : 'pt',
      span: 'watch_voice_task',
      telemetry,
    })
  ).trim();
  if (!/[\p{L}\p{N}]/u.test(transcript)) throw new NoSpeechError();

  if (!mentionsDateOrTime(transcript)) {
    return { transcript, task: parseVoiceTask({ title: quickTitle(transcript) }, transcript, context) };
  }

  let raw: Record<string, unknown> | null = null;
  try {
    raw = await createWatchVoiceTaskCompletion(buildVoiceTaskPrompt(transcript, context), telemetry);
  } catch (error) {
    console.error('Watch voice task: split failed, keeping the whole text', error);
  }
  return { transcript, task: parseVoiceTask(raw, transcript, context) };
};
