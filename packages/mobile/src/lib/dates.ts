/**
 * Calendar-day helpers. Task dates are plain `YYYY-MM-DD` keys in the user's
 * local calendar, so everything here works on local midnight and never goes
 * through UTC (`toISOString`), which shifts the day east of UTC.
 */

export const MONTHS_SHORT_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MONTHS_LONG_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
export const WEEKDAYS_SHORT_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WEEKDAYS_LONG_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `2026-10-28` or `2026-10-28T10:00:00Z` → `2026-10-28`; null for empty values. */
export function dateKeyOf(value?: string | null): string | null {
  if (!value) return null;
  const key = value.split('T')[0] ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export function parseDateKey(value?: string | null): Date | null {
  const key = dateKeyOf(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Monday of the week that contains `date`. */
export function startOfWeek(date: Date): Date {
  const day = date.getDay();
  return addDays(startOfDay(date), day === 0 ? -6 : 1 - day);
}

/** Monday after `date` (a Monday itself maps to the following one). */
export function nextMonday(date: Date): Date {
  const day = date.getDay();
  return addDays(startOfDay(date), day === 0 ? 1 : 8 - day);
}

/** Drops empty and "null"/"undefined" strings some older rows carry. */
export function normalizeTime(time?: string | null): string | null {
  const trimmed = time?.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(trimmed);
  return match ? `${match[1]!.padStart(2, '0')}:${match[2]}` : null;
}

/** "7 Jan" (adds the year when it is not the current one). */
export function formatShortDate(date: Date, today: Date = new Date()): string {
  const base = `${date.getDate()} ${MONTHS_SHORT_PT[date.getMonth()]}`;
  return date.getFullYear() === today.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/**
 * Label for a task's due date in lists: "Hoje", "Amanhã", "Ontem", a weekday
 * for the next six days, otherwise "7 Jan". Appends ", 09:00" when timed.
 */
export function formatDueLabel(dueDate?: string | null, time?: string | null, now: Date = new Date()): string | null {
  const date = parseDateKey(dueDate);
  if (!date) return null;
  const today = startOfDay(now);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  let label: string;
  if (diffDays === 0) label = 'Hoje';
  else if (diffDays === 1) label = 'Amanhã';
  else if (diffDays === -1) label = 'Ontem';
  else if (diffDays > 1 && diffDays < 7) label = WEEKDAYS_LONG_PT[date.getDay()]!;
  else label = formatShortDate(date, today);

  const t = normalizeTime(time);
  return t ? `${label}, ${t}` : label;
}

/** "Quarta, 28 de outubro" — headers in the calendar day view. */
export function formatLongDate(date: Date): string {
  return `${WEEKDAYS_LONG_PT[date.getDay()]}, ${date.getDate()} de ${MONTHS_LONG_PT[date.getMonth()]!.toLowerCase()}`;
}

/** Days shown in a month grid (Monday first), including leading/trailing days. */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const end = addDays(startOfWeek(last), 6);
  const days: Date[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

export function toTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Date carrying `time` (HH:mm) on today's calendar, for time pickers. */
export function timeToDate(time?: string | null, base: Date = new Date()): Date {
  const t = normalizeTime(time) ?? '09:00';
  const [hours, minutes] = t.split(':').map(Number) as [number, number];
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes);
}
