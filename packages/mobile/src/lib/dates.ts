/**
 * Calendar-day helpers. Task dates are plain `YYYY-MM-DD` keys in the user's
 * local calendar, so everything here works on local midnight and never goes
 * through UTC (`toISOString`), which shifts the day east of UTC.
 *
 * Labels come out in the current UI language through the `@/i18n` format
 * helpers (pt-BR output is unchanged). `toDateKey` / `toTimeString` /
 * `normalizeTime` produce stored values, never display text.
 */
import { formatDate, formatRelativeDay, formatTime, getWeekStartsOn, i18n, monthNames, weekdayNames } from '@/i18n';

/**
 * Index-addressable list whose items are read when accessed, so a module-level
 * constant still follows the UI language.
 */
function liveList(length: number, resolve: (index: number) => string): string[] {
  const list: string[] = [];
  for (let index = 0; index < length; index++) {
    Object.defineProperty(list, index, { enumerable: true, get: () => resolve(index) });
  }
  return list;
}

/** @deprecated Use `monthNames('short')` from `@/i18n`. Items follow the UI language ("Jan", "Fev" / "Feb"). */
export const MONTHS_SHORT_PT: string[] = liveList(12, (index) => monthNames('short')[index]!);
/** @deprecated Use `monthNames('long')` from `@/i18n`. Items follow the UI language. */
export const MONTHS_LONG_PT: string[] = liveList(12, (index) => monthNames('long')[index]!);
/** @deprecated Use `weekdayNames('short', 0)` from `@/i18n`. Sunday first (`Date#getDay()`), in the UI language. */
export const WEEKDAYS_SHORT_PT: string[] = liveList(7, (index) => weekdayNames('short', 0)[index]!);
/** @deprecated Use `weekdayNames('long', 0)` from `@/i18n`. Sunday first (`Date#getDay()`), in the UI language. */
export const WEEKDAYS_LONG_PT: string[] = liveList(7, (index) => weekdayNames('long', 0)[index]!);

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

/**
 * First day of the week that contains `date`: Monday in pt-BR, Sunday in
 * en-US (`weekStartsOn` defaults to the UI language's, 0 = Sunday).
 */
export function startOfWeek(date: Date, weekStartsOn: number = getWeekStartsOn()): Date {
  const offset = (date.getDay() - weekStartsOn + 7) % 7;
  return addDays(startOfDay(date), -offset);
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

/** "7 Jan" / "Jan 7" (adds the year when it is not the current one). */
export function formatShortDate(date: Date, today: Date = new Date()): string {
  return formatDate(date, 'dayMonthAuto', { now: today });
}

/**
 * Label for a task's due date in lists: "Hoje", "Amanhã", "Ontem", a weekday
 * for the next six days, otherwise "7 Jan" (en "Today", "Wednesday", "Jan 7").
 * Appends the time when timed: "Hoje, 09:00" / "Today, 9:00 AM".
 */
export function formatDueLabel(dueDate?: string | null, time?: string | null, now: Date = new Date()): string | null {
  const date = parseDateKey(dueDate);
  if (!date) return null;
  const label = formatRelativeDay(date, { now, weekdayThisWeek: true });
  const t = normalizeTime(time);
  return t ? i18n.t('common:time.dateWithTime', { date: label, time: formatTime(t) }) : label;
}

/** "Quarta, 28 de outubro" / "Wednesday, October 28" — headers in the calendar day view. */
export function formatLongDate(date: Date): string {
  return formatDate(date, 'weekdayDayMonthLong');
}

/**
 * Days shown in a month grid, including leading/trailing days. Weeks start on
 * the UI language's first day (pt-BR Monday, en-US Sunday) unless given.
 */
export function monthGrid(month: Date, weekStartsOn: number = getWeekStartsOn()): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first, weekStartsOn);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const end = addDays(startOfWeek(last, weekStartsOn), 6);
  const days: Date[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * `HH:mm` (24h) as stored on tasks, reminders and settings. Not display text:
 * show times with `formatTime` from `@/i18n` ("09:00" / "9:00 AM").
 */
export function toTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Date carrying `time` (HH:mm) on today's calendar, for time pickers. */
export function timeToDate(time?: string | null, base: Date = new Date()): Date {
  const t = normalizeTime(time) ?? '09:00';
  const [hours, minutes] = t.split(':').map(Number) as [number, number];
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes);
}
