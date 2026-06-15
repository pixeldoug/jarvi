/**
 * Timezone-aware date/time utilities used by the prompt builder and task
 * formatters. All functions accept an IANA timezone (e.g. America/Sao_Paulo)
 * and fall back to that zone if the input is invalid.
 *
 * Centralizing this here was a major source of paridade bugs before — web's
 * version was a thin wrapper around `toLocaleString` that didn't expose the
 * weekday or ISO date, so the LLM would miscompute "amanhã" / "sexta".
 */

const FALLBACK_TIMEZONE = 'America/Sao_Paulo';

const PT_WEEKDAYS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

const PT_DAY_LABELS: Record<number, string> = {
  0: 'Hoje',
  1: 'Amanhã',
  2: 'Depois de amanhã',
};

const isValidTimezone = (timezone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

const resolveTimezone = (timezone: string): string =>
  isValidTimezone(timezone) ? timezone : FALLBACK_TIMEZONE;

export interface DateTimeForTimezone {
  /** Long form: "sexta-feira, 24/04/2026, 20:15" */
  formatted: string;
  /** YYYY-MM-DD in the target timezone (no off-by-one bugs near midnight). */
  isoDate: string;
  /** Day of week in Portuguese (e.g. "sexta-feira"). */
  weekday: string;
  /** HH:MM in the target timezone (24h). */
  hourMinute: string;
  /** DD/MM convenience for prompts. */
  ddmm: string;
}

export function getDateTimeForTimezone(timezone: string): DateTimeForTimezone {
  const tz = resolveTimezone(timezone);
  const now = new Date();

  const formatted = now.toLocaleString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  });

  const dateParts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).formatToParts(now);
  const year = dateParts.find((p) => p.type === 'year')?.value ?? '';
  const month = dateParts.find((p) => p.type === 'month')?.value ?? '';
  const day = dateParts.find((p) => p.type === 'day')?.value ?? '';
  const isoDate = `${year}-${month}-${day}`;

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).formatToParts(now);
  const hour = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = timeParts.find((p) => p.type === 'minute')?.value ?? '00';
  const hourMinute = `${hour}:${minute}`;

  const weekday = formatted.split(',')[0].trim();
  const ddmm = `${day}/${month}`;

  return { formatted, isoDate, weekday, hourMinute, ddmm };
}

export function getCurrentHour(timezone: string): number {
  try {
    const hourStr = new Date().toLocaleString('pt-BR', {
      timeZone: resolveTimezone(timezone),
      hour: '2-digit',
      hour12: false,
    });
    return parseInt(hourStr, 10);
  } catch {
    return new Date().getHours();
  }
}

export function getDynamicGreeting(timezone: string): string {
  const hour = getCurrentHour(timezone);
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * Format a task's due date (and optional time) into a human label in
 * Portuguese, e.g. "Terça-feira, 16/05 às 17h00". Used to give the WhatsApp
 * confirmation message a deterministic, trustworthy date string instead of
 * letting the model format it on its own.
 *
 * `dueDate` is a plain calendar date (YYYY-MM-DD) and `time` a plain HH:MM —
 * neither carries a timezone, so we parse them directly (via Date.UTC for the
 * weekday) to avoid any off-by-one shift.
 */
export function formatDueDateLabel(
  dueDate: string | null | undefined,
  time?: string | null,
): string | null {
  if (!dueDate) return null;

  const dateMatch = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (!year || !month || !day) return null;

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(date.getTime())) return null;

  const weekday = PT_WEEKDAYS[date.getUTCDay()] ?? '';
  const weekdayCapitalized = weekday
    ? weekday.charAt(0).toUpperCase() + weekday.slice(1)
    : '';
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');

  let label = weekdayCapitalized
    ? `${weekdayCapitalized}, ${dd}/${mm}`
    : `${dd}/${mm}`;

  const timeMatch = time?.match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hh = timeMatch[1].padStart(2, '0');
    const min = timeMatch[2];
    label += ` às ${hh}h${min}`;
  }

  return label;
}

/**
 * Build a 7-day calendar lookup so the model never has to do calendar
 * arithmetic (which small models get wrong consistently).
 */
export function buildWeekCalendar(todayIso: string): string {
  const [y, m, d] = todayIso.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(base.getTime() + i * 86400000);
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const weekday = PT_WEEKDAYS[date.getUTCDay()];
    const label = PT_DAY_LABELS[i] ?? weekday;
    return `${label} (${weekday}): ${dd}/${mm}`;
  }).join('\n');
}
