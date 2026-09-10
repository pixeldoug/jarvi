/**
 * Deterministic interpretation of the date expressions Jarvi supports, in the
 * user's timezone. One implementation for every surface (general chat, tarefa
 * aberta, WhatsApp) so the rules can't drift between prompts.
 *
 * Two jobs:
 *
 * 1. `detectDateExpressions` — find the expressions the user actually wrote
 *    ("amanhã", "sexta", "em 7 dias", "dia 24", "semana que vem", ...) and
 *    resolve the ones that denote a single day.
 *
 * 2. `reconcileDueDate` — given the model's proposed `due_date` and the user's
 *    message, decide what the backend will persist:
 *      - a PERIOD without a concrete day ("semana que vem") never becomes a
 *        date: the value is held back and the user is asked which day;
 *      - an unambiguous single expression that the model resolved to an
 *        impossible day (wrong weekday, wrong calendar math, timezone slip) is
 *        corrected to the deterministic resolution;
 *      - everything else is left to the model (it has context we don't).
 *
 * The model still does the interpretation; this file only guarantees the
 * result can't contradict what the user said.
 */

import { addDaysToIsoDate } from './tasks';
import { getDateTimeForTimezone } from './time';

export type DateExpressionKind =
  | 'today'
  | 'yesterday'
  | 'tomorrow'
  | 'day_after_tomorrow'
  | 'weekday'
  | 'in_days'
  | 'explicit_day'
  | 'explicit_date'
  | 'period_next_week'
  | 'period_this_week'
  | 'period_this_month'
  | 'period_coming_days';

const PERIOD_KINDS: ReadonlySet<DateExpressionKind> = new Set<DateExpressionKind>([
  'period_next_week',
  'period_this_week',
  'period_this_month',
  'period_coming_days',
]);

export function isPeriodKind(kind: DateExpressionKind): boolean {
  return PERIOD_KINDS.has(kind);
}

export interface DateExpression {
  kind: DateExpressionKind;
  /** The text exactly as the user wrote it. */
  text: string;
  index: number;
  /** YYYY-MM-DD when the expression denotes one day. Undefined for periods. */
  resolved?: string;
  /** 0=domingo … 6=sábado (weekday expressions only). */
  weekday?: number;
  /** "que vem" / "próxima" qualifier on a weekday. */
  nextWeekQualifier?: boolean;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const WEEKDAY_INDEX: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  terça: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
  sábado: 6,
};

const WEEKDAY_WORDS = 'domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado';

// Web attachments are appended to the user's turn under this header; their
// contents (PDF text, image descriptions) are not the user's own words and
// must not drive the date guard.
const WEB_ATTACHMENT_BLOCK = '[Arquivos enviados pelo usuário]';

function userAuthoredPortion(message: string): string {
  const idx = message.indexOf(WEB_ATTACHMENT_BLOCK);
  return idx === -1 ? message : message.slice(0, idx);
}

function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/** Next date >= `fromIso` whose weekday is `target` (0..6). Same-day counts. */
export function nextOccurrenceOfWeekday(fromIso: string, target: number): string {
  const offset = (target - weekdayOf(fromIso) + 7) % 7;
  return addDaysToIsoDate(fromIso, offset);
}

/** Next date >= `fromIso` whose day-of-month is `day` (clamped to month length). */
function nextOccurrenceOfMonthDay(fromIso: string, day: number): string {
  const [y, m, d] = fromIso.split('-').map(Number);
  const candidate = (year: number, month0: number): string => {
    const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
    const dd = Math.min(day, daysInMonth);
    const date = new Date(Date.UTC(year, month0, dd));
    return date.toISOString().slice(0, 10);
  };
  if (day >= d) return candidate(y, m - 1);
  return candidate(m === 12 ? y + 1 : y, m === 12 ? 0 : m);
}

function resolveExplicitDate(
  dd: number,
  mm: number,
  yyyy: number | undefined,
  todayIso: string,
): string | null {
  const year = yyyy === undefined ? Number(todayIso.slice(0, 4)) : yyyy < 100 ? 2000 + yyyy : yyyy;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const date = new Date(Date.UTC(year, mm - 1, dd, 12));
  if (date.getUTCMonth() !== mm - 1) return null;
  let iso = date.toISOString().slice(0, 10);
  // "DD/MM" with no year that already passed this year → the user means next year.
  if (yyyy === undefined && iso < todayIso) {
    iso = new Date(Date.UTC(year + 1, mm - 1, dd, 12)).toISOString().slice(0, 10);
  }
  return iso;
}

interface Matcher {
  kind: DateExpressionKind;
  regex: RegExp;
  build: (m: RegExpExecArray, todayIso: string) => Partial<DateExpression> | null;
}

const MATCHERS: Matcher[] = [
  // JS `\b` is ASCII-only: `amanh[ãa]\b` never matched the accented spelling
  // ("ã" is not a word char, so there is no boundary before the end of the
  // string). These two use a Unicode-aware lookahead instead.
  {
    kind: 'day_after_tomorrow',
    regex: /\bdepois\s+de\s+amanh[ãa](?![\p{L}\p{N}])/giu,
    build: (_m, today) => ({ resolved: addDaysToIsoDate(today, 2) }),
  },
  {
    kind: 'tomorrow',
    // "amanhã" not preceded by "depois de" (handled above).
    regex: /(?<!depois\s+de\s)\bamanh[ãa](?![\p{L}\p{N}])/giu,
    build: (_m, today) => ({ resolved: addDaysToIsoDate(today, 1) }),
  },
  {
    kind: 'today',
    regex: /\bhoje\b/gi,
    build: (_m, today) => ({ resolved: today }),
  },
  {
    // Past days the user names on purpose ("esqueci de pagar ontem"). Never
    // used to override the model; their presence only means a past due_date
    // is the user's choice, not a copied-in official date.
    kind: 'yesterday',
    regex: /\b(ante)?ontem\b/gi,
    build: (m, today) => ({ resolved: addDaysToIsoDate(today, m[1] ? -2 : -1) }),
  },
  {
    kind: 'period_next_week',
    // Standalone period. A weekday right before it ("sexta da semana que vem")
    // is captured by the weekday matcher, which makes the period concrete.
    // "antes da semana que vem" is a deadline BEFORE the period, not the
    // period itself — the model's earlier date is legitimate there.
    regex:
      /(?<!antes\s+d[ae]\s)\b(?:semana\s+que\s+vem|pr[óo]xima\s+semana|semana\s+pr[óo]xima|semana\s+seguinte)\b/gi,
    build: () => ({}),
  },
  {
    // "essa semana", "nessa semana", "ainda esta semana". A weekday next to
    // it ("sexta dessa semana") is caught by the weekday matcher and makes
    // the period concrete. "essa semana foi puxada" is narrative, but it only
    // matters when the model also proposed a date — holding is the safe side.
    kind: 'period_this_week',
    regex:
      /(?<!antes\s+d[ae]\s)\b(?:ess[ae]|est[ae]|ness[ae]|nest[ae])\s+semana\b(?!\s+(?:passad|retrasad))/gi,
    build: () => ({}),
  },
  {
    // "esse mês", "até o fim do mês", "final do mês", "no fim do mês".
    kind: 'period_this_month',
    regex:
      /(?<!antes\s+d[ae]\s)\b(?:(?:ess[ae]|est[ae]|ness[ae]|nest[ae])\s+m[êe]s|(?:at[ée]\s+o\s+|no\s+|pro\s+|para\s+o\s+)?(?:fim|final)\s+d[oe]\s+m[êe]s)\b(?!\s+(?:passad|retrasad))/gi,
    build: () => ({}),
  },
  {
    // "nos próximos dias", "nesses próximos dias", "nos próximos dias úteis".
    kind: 'period_coming_days',
    regex: /\b(?:nos|nesses|nestes|nas)\s+pr[óo]xim[oa]s\s+dias\b/gi,
    build: () => ({}),
  },
  {
    kind: 'weekday',
    // "sexta passada" / "sexta retrasada" is narrative about the past, not a date.
    regex: new RegExp(
      `(?:\\b(pr[óo]xim[ao])\\s+)?\\b(${WEEKDAY_WORDS})(?:-feira)?\\b(?!\\s+(?:passad|retrasad))(\\s+(?:que\\s+vem|da\\s+semana\\s+que\\s+vem|da\\s+pr[óo]xima\\s+semana|pr[óo]xim[ao]))?`,
      'gi',
    ),
    build: (m, today) => {
      const key = m[2].toLowerCase().replace('ç', 'c').replace('á', 'a');
      const weekday = WEEKDAY_INDEX[key];
      if (weekday === undefined) return null;
      const qualifier = Boolean(m[1] || m[3]);
      let resolved = nextOccurrenceOfWeekday(today, weekday);
      // "sexta que vem" said ON a Friday means next week's Friday, not today.
      if (qualifier && resolved === today) resolved = addDaysToIsoDate(resolved, 7);
      return { resolved, weekday, nextWeekQualifier: qualifier };
    },
  },
  {
    kind: 'in_days',
    regex:
      /\b(?:em\s+at[ée]|em|daqui\s+(?:a\s+)?|dentro\s+de|antes\s+de|at[ée])\s+(\d{1,3})\s+dias?\b/gi,
    build: (m, today) => {
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n < 0 || n > 366) return null;
      return { resolved: addDaysToIsoDate(today, n) };
    },
  },
  {
    kind: 'explicit_date',
    regex: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g,
    build: (m, today) => {
      const resolved = resolveExplicitDate(
        Number(m[1]),
        Number(m[2]),
        m[3] !== undefined ? Number(m[3]) : undefined,
        today,
      );
      return resolved ? { resolved } : null;
    },
  },
  {
    kind: 'explicit_day',
    // "dia 24" — but not "dia 24/07" (explicit_date) nor "24 dias" (in_days).
    regex: /\bdia\s+(\d{1,2})\b(?!\s*\/)/gi,
    build: (m, today) => {
      const day = Number(m[1]);
      if (day < 1 || day > 31) return null;
      return { resolved: nextOccurrenceOfMonthDay(today, day) };
    },
  },
];

/**
 * Find every supported date expression in `message`, in order of appearance.
 * Overlapping matches keep the earliest, longest one.
 */
export function detectDateExpressions(
  message: string | undefined | null,
  timezone: string,
): DateExpression[] {
  if (!message) return [];
  const text = userAuthoredPortion(message);
  const { isoDate: today } = getDateTimeForTimezone(timezone);

  const found: DateExpression[] = [];
  for (const matcher of MATCHERS) {
    matcher.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = matcher.regex.exec(text)) !== null) {
      const extra = matcher.build(m, today);
      if (!extra) continue;
      found.push({ kind: matcher.kind, text: m[0], index: m.index, ...extra });
      if (m[0].length === 0) matcher.regex.lastIndex++;
    }
  }

  // Drop expressions fully contained in an earlier/longer one (e.g. the bare
  // "semana que vem" inside "sexta da semana que vem").
  found.sort((a, b) => a.index - b.index || b.text.length - a.text.length);
  const kept: DateExpression[] = [];
  for (const expr of found) {
    const end = expr.index + expr.text.length;
    const covered = kept.some(
      (k) => expr.index >= k.index && end <= k.index + k.text.length,
    );
    if (!covered) kept.push(expr);
  }
  return kept;
}

export function hasConcreteDay(expressions: DateExpression[]): boolean {
  // "ontem" is narrative ("ontem o médico pediu, marco semana que vem"), never
  // the day the user is picking — it must not silence a period question.
  return expressions.some((e) => !isPeriodKind(e.kind) && e.kind !== 'yesterday');
}

/** The period expression that still needs a day, if any. */
export function periodNeedingDay(expressions: DateExpression[]): DateExpression | null {
  if (hasConcreteDay(expressions)) return null;
  return expressions.find((e) => isPeriodKind(e.kind)) ?? null;
}

// ---------------------------------------------------------------------------
// Reconciliation of the model's due_date with what the user wrote
// ---------------------------------------------------------------------------

export interface DueDateDecision {
  /**
   * - keep_model_value: persist whatever the model proposed (or nothing);
   * - correct: persist `value` instead of the model's proposal;
   * - hold: do NOT persist the model's proposal (create → no due_date;
   *   update → previous due_date stays).
   */
  action: 'keep_model_value' | 'correct' | 'hold';
  value?: string;
  reason?: string;
  expression?: DateExpression;
  /** hold because the proposal is a past day the user never named. */
  pastDate?: boolean;
  /**
   * Present whenever the user named a period that still needs a day, whether
   * or not the model guessed one — the backend asks, the model must not.
   */
  pendingQuestion?: { expression: DateExpression; text: string };
}

export function questionForPeriod(expression: DateExpression): string {
  const lowered = expression.text.toLowerCase();
  switch (expression.kind) {
    case 'period_this_week':
      return 'Qual dia dessa semana?';
    case 'period_this_month':
      return 'Qual dia do mês?';
    case 'period_coming_days':
      return 'Qual dia fica melhor?';
    default:
      if (/pr[óo]xima\s+semana|semana\s+pr[óo]xima|seguinte/.test(lowered)) {
        return 'Qual dia da próxima semana?';
      }
      return 'Qual dia da semana que vem?';
  }
}

/**
 * Days the model may legitimately pick for a single unambiguous expression.
 * The set deliberately includes "the day before" for future events, because
 * Jarvi's convention is that a task's due_date is when it must be DONE, which
 * for appointments and trips is often the eve.
 */
function allowedDatesFor(expr: DateExpression, todayIso: string): Set<string> | null {
  if (!expr.resolved) return null;
  const allowed = new Set<string>();
  switch (expr.kind) {
    case 'today':
      allowed.add(todayIso);
      return allowed;
    case 'tomorrow':
      allowed.add(todayIso);
      allowed.add(expr.resolved);
      return allowed;
    case 'day_after_tomorrow':
      allowed.add(addDaysToIsoDate(expr.resolved, -1));
      allowed.add(expr.resolved);
      return allowed;
    case 'weekday': {
      // Any matching weekday in the next two weeks (the model may know from
      // history whether "sexta" is this week or next), plus its eve.
      if (expr.weekday === undefined) return null;
      for (let i = 0; i <= 14; i++) {
        const iso = addDaysToIsoDate(todayIso, i);
        if (weekdayOf(iso) === expr.weekday) {
          allowed.add(iso);
          allowed.add(addDaysToIsoDate(iso, -1));
        }
      }
      return allowed;
    }
    case 'in_days':
    case 'explicit_day':
    case 'explicit_date': {
      // Deadline semantics: anything from today up to the day itself.
      let cursor = todayIso;
      let guard = 0;
      while (cursor <= expr.resolved && guard < 400) {
        allowed.add(cursor);
        cursor = addDaysToIsoDate(cursor, 1);
        guard++;
      }
      return allowed;
    }
    default:
      return null;
  }
}

/**
 * Decide what to do with the model's proposed `due_date` for a create/update.
 *
 * `proposed` is the model's value (already validated as YYYY-MM-DD) or
 * undefined when the model sent none. The user's message is the ONLY signal
 * used here — task descriptions, memory and history are not consulted.
 */
export function reconcileDueDate(
  proposed: string | undefined,
  userMessage: string | undefined | null,
  timezone: string,
): DueDateDecision {
  const expressions = detectDateExpressions(userMessage, timezone);
  if (expressions.length === 0) {
    // 0. A day in the past the user never mentioned is not a deadline — it is
    //    the model copying an official date it just looked up ("prazo do IRPF
    //    era 29/05") into due_date, which would make the task born overdue.
    //    "ontem", "dia 30/05" etc. in the message are expressions and skip this.
    if (proposed && /^\d{4}-\d{2}-\d{2}$/.test(proposed)) {
      const { isoDate: today } = getDateTimeForTimezone(timezone);
      if (proposed < today) {
        return {
          action: 'hold',
          reason: `${proposed} já passou e o usuário não mencionou essa data`,
          pastDate: true,
        };
      }
    }
    return { action: 'keep_model_value' };
  }

  // 1. Period without a concrete day → never guess. The question is pending
  //    even when the model (correctly) left due_date empty.
  const period = periodNeedingDay(expressions);
  if (period) {
    const pendingQuestion = { expression: period, text: questionForPeriod(period) };
    if (proposed === undefined) return { action: 'keep_model_value', pendingQuestion };
    return {
      action: 'hold',
      reason: `"${period.text}" não define um dia; o usuário precisa escolher`,
      expression: period,
      pendingQuestion,
    };
  }

  if (proposed === undefined) return { action: 'keep_model_value' };

  // 2. Exactly ONE expression in the whole message, and an unambiguous one →
  //    the model's date must be consistent with it; otherwise snap to the
  //    deterministic resolution. Multi-clause messages ("amanhã ele responde,
  //    cobro sexta") are left to the model — it has the context.
  if (expressions.length !== 1) return { action: 'keep_model_value' };
  const only = expressions[0];
  // Narrative "hoje" ("hoje falei com o João") is far more common than
  // "hoje" as a deadline, so it is never used to override the model.
  if (only.kind === 'today' || !only.resolved) return { action: 'keep_model_value' };

  const { isoDate: today } = getDateTimeForTimezone(timezone);
  const allowed = allowedDatesFor(only, today);
  if (!allowed || allowed.has(proposed)) return { action: 'keep_model_value' };

  return {
    action: 'correct',
    value: only.resolved,
    reason: `"${only.text}" resolve para ${only.resolved} no fuso ${timezone}; o modelo propôs ${proposed}`,
    expression: only,
  };
}
