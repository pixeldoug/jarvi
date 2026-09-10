/**
 * Backend interpretation of the user's reply to a SYSTEM question.
 *
 * When the client echoes the question the person is answering (the web sends
 * the choice artifact of the last assistant message as `pendingQuestion`), a
 * short reply can be resolved here — deterministically, with no model call:
 *
 *   "Amanhã" / "Ter, 25" / "8 de setembro de 2026"   → due_date value
 *   "9h" / "às 14:30" / "meio-dia"                    → time value
 *   "1 hora antes" / "Na véspera (9h)"                → a reminder
 *   "Ainda não sei" / "Sem horário" / "Sem lembrete"  → skip that field
 *   "ok" / "sim" / "pode ser"                         → bare acknowledgement
 *
 * Anything longer or richer ("amanhã, e anota que é com a Dra. Ana") returns
 * null and goes to the model as before — the fast path never swallows
 * context the person wanted saved. `runAgent` applies the resolved answer
 * through the same executors the model would use.
 */

import { extractTimeFromText } from '../../../utils/taskTime';
import type { CreateTaskReminderInput } from '../../../types/reminder';
import { detectDateExpressions, type DateExpression } from './dateExpressions';
import { SKIP_LABELS } from './nextQuestion';
import { addDaysToIsoDate } from './tasks';
import { getDateTimeForTimezone } from './time';
import type { AgentPendingQuestionRef, AgentTriadField } from './types';

export type PendingAnswer =
  | { kind: 'due_date'; value: string; expression: DateExpression | null }
  | { kind: 'time'; value: string }
  | { kind: 'reminder'; input: CreateTaskReminderInput; label: string }
  | { kind: 'skip'; field: AgentTriadField }
  | { kind: 'ack' };

// A reply this long is a sentence, not a quick answer — the model reads it.
const MAX_ANSWER_WORDS = 6;

const ACK_RE =
  /^(?:ok(?:ay|ey)?|sim|pode(?:\s+ser)?|isso|t[áa]\s*bom|t[áa]|beleza|blz|claro|vamos|bora|certo|combinado|perfeito|show|fechado|pode\s+ser\s+sim|s|ss|uhum|aham)[.!\s]*$/i;

const FILLER_WORDS = new Set([
  'acho', 'que', 'pode', 'ser', 'talvez', 'vou', 'fazer', 'faço', 'faco', 'deixa', 'pra', 'para',
  'no', 'na', 'em', 'o', 'a', 'de', 'dia', 'então', 'entao', 'melhor', 'fica', 'bom', 'ok', 'sim',
  'às', 'as', 'ao', 'hoje', 'mesmo', 'aí', 'ai', 'só', 'so', 'lá', 'la',
]);

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const SHORT_WEEKDAYS: Record<string, number> = {
  dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, sáb: 6,
};

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Everything in `message` except `matched` must be filler for a bare answer. */
function isBareAnswer(message: string, matched: string): boolean {
  const rest = message.toLowerCase().replace(matched.toLowerCase(), ' ');
  const tokens = rest.replace(/[.,!?;:()]/g, ' ').split(/\s+/).filter(Boolean);
  return tokens.every((t) => FILLER_WORDS.has(t));
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/** "Ter, 25" (a chip from `concreteDayChoices`) → the next such day from today. */
function parseDayChip(message: string, todayIso: string): string | null {
  const m = /^([a-zá]{3}),?\s+(\d{1,2})$/i.exec(message.trim());
  if (!m) return null;
  const weekday = SHORT_WEEKDAYS[m[1].toLowerCase()];
  const day = Number(m[2]);
  if (weekday === undefined || !day) return null;
  // Search the next ~2 months for a matching (weekday, day-of-month).
  for (let i = 0; i < 62; i++) {
    const iso = addDaysToIsoDate(todayIso, i);
    if (Number(iso.slice(8, 10)) === day && weekdayOf(iso) === weekday) return iso;
  }
  return null;
}

/** "8 de setembro de 2026" / "8 de setembro" (web date picker output). */
function parseLongDate(message: string, todayIso: string): string | null {
  const m = /^(\d{1,2})\s+de\s+([a-zç]+)(?:\s+de\s+(\d{4}))?$/i.exec(message.trim());
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  const day = Number(m[1]);
  const year = m[3] ? Number(m[3]) : Number(todayIso.slice(0, 4));
  const iso = isoFromParts(year, month, day);
  if (!iso) return null;
  // No year given and the day already passed → the person means next year.
  return !m[3] && iso < todayIso ? isoFromParts(year + 1, month, day) : iso;
}

/** "YYYY-MM-DD" typed or produced by a client. */
function parseIsoDate(message: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(message.trim());
  return m ? isoFromParts(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

function matchesSkip(message: string, field: AgentTriadField): boolean {
  const text = message.toLowerCase().replace(/[.!]/g, '').trim();
  const label = SKIP_LABELS[field].toLowerCase();
  if (text === label) return true;
  switch (field) {
    case 'due_date':
      return /^(ainda\s+)?n[ãa]o\s+sei(\s+ainda)?$/.test(text) || /^sem\s+(prazo|data)$/.test(text);
    case 'time':
      return /^(sem|n[ãa]o\s+tem|n[ãa]o\s+precisa\s+de)\s+hor[aá]rio$/.test(text) || text === 'sem hora';
    case 'reminders':
      return (
        /^(sem|n[ãa]o\s+(quero|precisa|precisa\s+de)|ainda\s+n[ãa]o\s+quero)\s+lembrete$/.test(text) ||
        /^n[ãa]o\s+precisa$/.test(text) ||
        /^n[ãa]o(\s+quero)?$/.test(text)
      );
    default:
      return false;
  }
}

function dueDateAnswer(message: string, timezone: string): PendingAnswer | null {
  const { isoDate: today } = getDateTimeForTimezone(timezone);
  const direct = parseIsoDate(message) ?? parseLongDate(message, today) ?? parseDayChip(message, today);
  if (direct) return { kind: 'due_date', value: direct, expression: null };

  const expressions = detectDateExpressions(message, timezone).filter((e) => e.kind !== 'yesterday');
  if (expressions.length !== 1) return null;
  const only = expressions[0];
  if (!only.resolved) return null; // a period: the bare-period flow narrows it
  if (!isBareAnswer(message, only.text)) return null;
  return { kind: 'due_date', value: only.resolved, expression: only };
}

function timeAnswer(message: string): PendingAnswer | null {
  const time = extractTimeFromText(message);
  if (!time) return null;
  // The message must be essentially just the time ("9h", "às 14:30", "14h30 então").
  const stripped = message
    .toLowerCase()
    .replace(/\d{1,2}\s*(?::|h)\s*(?:\d{2})?(?:\s*min)?/i, ' ')
    .replace(/meio[\s-]?dia|meia[\s-]?noite/, ' ')
    .replace(/[.,!?;:()]/g, ' ');
  const tokens = stripped.split(/\s+/).filter(Boolean);
  if (!tokens.every((t) => FILLER_WORDS.has(t) || t === 'da' || t === 'manhã' || t === 'tarde' || t === 'noite')) {
    return null;
  }
  return { kind: 'time', value: time };
}

export interface ReminderAnswerContext {
  dueDate: string;
  time: string | null;
}

function reminderAnswer(message: string, ctx: ReminderAnswerContext): PendingAnswer | null {
  const text = message.toLowerCase().replace(/[.!]/g, '').trim();
  const channel = 'whatsapp' as const;
  const relative = (amount: number, unit: 'minutes' | 'hours' | 'days', label: string): PendingAnswer => ({
    kind: 'reminder',
    input: { channel, type: 'relative', offset: { amount, unit, direction: 'before' } },
    label,
  });
  const absoluteAt = (isoDate: string, clock: string, label: string): PendingAnswer => ({
    kind: 'reminder',
    input: { channel, type: 'absolute', scheduledAt: `${isoDate}T${clock}` },
    label,
  });

  // Day-only chips (the task has no time → a relative reminder would fire at midnight).
  if (/^no\s+dia(\s*\(9h\))?$/.test(text) || /^de\s+manh[ãa],?\s+no\s+dia$/.test(text)) {
    return ctx.time ? relative(0, 'minutes', 'no horário') : absoluteAt(ctx.dueDate, '09:00', 'no dia, às 9h');
  }
  if (/^na\s+v[ée]spera(\s*\(9h\))?$/.test(text) || /^(um|1)\s+dia\s+antes$/.test(text)) {
    return ctx.time
      ? relative(1, 'days', '1 dia antes')
      : absoluteAt(addDaysToIsoDate(ctx.dueDate, -1), '09:00', 'na véspera, às 9h');
  }
  if (/^(no\s+hor[aá]rio|na\s+hora)$/.test(text)) {
    return ctx.time ? relative(0, 'minutes', 'no horário') : absoluteAt(ctx.dueDate, '09:00', 'no dia, às 9h');
  }
  // "30 min antes", "2 horas antes", "3 dias antes"
  const m = /^(\d{1,3})\s*(min(?:utos?)?|h(?:oras?)?|dias?)\s+antes$/.exec(text);
  if (m) {
    const amount = Number(m[1]);
    const unit = m[2].startsWith('min') ? 'minutes' : m[2].startsWith('h') ? 'hours' : 'days';
    if (unit !== 'days' && !ctx.time) {
      // No task time to offset from: anchor on 9h of the due day.
      return absoluteAt(ctx.dueDate, '09:00', 'no dia, às 9h');
    }
    if (unit === 'days' && !ctx.time) {
      return absoluteAt(addDaysToIsoDate(ctx.dueDate, -amount), '09:00', `${amount} dia(s) antes, às 9h`);
    }
    return relative(amount, unit, `${amount} ${m[2]} antes`);
  }
  return null;
}

/**
 * Resolve the user's message against the question they are answering.
 * Returns null when the reply needs the model.
 */
export function resolvePendingAnswer(
  message: string | undefined | null,
  pending: AgentPendingQuestionRef | undefined,
  timezone: string,
  reminderCtx?: ReminderAnswerContext,
): PendingAnswer | null {
  if (!pending || !message) return null;
  // The journey nudge is not a tríade question (see runAgent's resume path).
  const field = pending.field;
  if (field === 'journey') return null;
  const text = normalize(message);
  if (!text || wordCount(text) > MAX_ANSWER_WORDS) return null;

  if (ACK_RE.test(text)) return { kind: 'ack' };
  if (matchesSkip(text, field)) return { kind: 'skip', field };

  switch (field) {
    case 'due_date':
      return dueDateAnswer(text, timezone);
    case 'time':
      return timeAnswer(text);
    case 'reminders':
      return reminderCtx ? reminderAnswer(text, reminderCtx) : null;
    default:
      return null;
  }
}
