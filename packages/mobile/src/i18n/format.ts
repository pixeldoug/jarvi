/**
 * Dates, times, numbers, money and lists in the active language.
 *
 * Never write month or weekday names, "às", "há 5 minutos" or `R$` in a
 * screen: use these helpers. In components prefer `useFormat()` (./hooks.ts),
 * which re-renders when the language changes. Outside React call them at the
 * moment the text is shown (never at module load).
 *
 * Every helper takes an optional last `options` argument:
 *   `locale` — defaults to the current UI language;
 *   `now`    — "today" for relative words and "is it this year?". Screens
 *              pass `useToday()` (compliance.md: never `new Date()` in render).
 *
 * Why the names come from the catalogs instead of Intl.DateTimeFormat:
 * Hermes (React Native's engine) ships Intl.DateTimeFormat / NumberFormat /
 * Collator, but not Intl.RelativeTimeFormat, Intl.ListFormat or (in some
 * builds) Intl.PluralRules, and its DateTimeFormat output differs between
 * iOS (Foundation) and Android (ICU) — "nov." vs "nov", "2:00 PM" with a
 * narrow no-break space in newer ICU, etc. Words and patterns therefore live
 * in `common:calendar` / `common:time` / `common:list`, so the output is the
 * same on iOS, Android and in Jest, and pt-BR is byte-for-byte what the app
 * showed before i18n. Only numbers and money use Intl.NumberFormat (present
 * in Hermes), with a hand-written fallback.
 *
 * Examples (Wed 28 Oct 2026, now = same day):
 *
 * | preset                | pt-BR                      | en-US                    |
 * |-----------------------|----------------------------|--------------------------|
 * | `dayMonth`            | `28 Out`                   | `Oct 28`                 |
 * | `dayMonthAuto`        | `28 Out` / `28 Out 2025`   | `Oct 28` / `Oct 28, 2025`|
 * | `dayMonthYear`        | `28 Out 2026`              | `Oct 28, 2026`           |
 * | `dayMonthLong`        | `28 de Outubro`            | `October 28`             |
 * | `weekdayDayMonthLong` | `Quarta, 28 de outubro`    | `Wednesday, October 28`  |
 * | `monthYear`           | `Outubro 2026`             | `October 2026`           |
 * | `weekday`             | `Quarta`                   | `Wednesday`              |
 * | `weekdayFull`         | `quarta-feira`             | `Wednesday`              |
 * | `weekdayShort`        | `Qua`                      | `Wed`                    |
 * | `numeric`             | `28/10/2026`               | `10/28/2026`             |
 *
 * | time style     | pt-BR             | en-US                 |
 * |----------------|-------------------|-----------------------|
 * | `clock`        | `09:00`, `14:05`  | `9:00 AM`, `2:05 PM`  |
 * | `hours`        | `14h00`, `14h05`  | `2:00 PM`, `2:05 PM`  |
 * | `hoursCompact` | `14h`, `14h05`    | `2 PM`, `2:05 PM`     |
 */
import i18n, { getCurrentLocale } from './instance';
import type { Locale } from './locale';

export type DateInput = Date | string | number;

export type DatePreset =
  | 'dayMonth'
  | 'dayMonthAuto'
  | 'dayMonthYear'
  | 'dayMonthLong'
  | 'weekdayDayMonthLong'
  | 'monthYear'
  | 'weekday'
  | 'weekdayFull'
  | 'weekdayShort'
  | 'numeric';

export type TimeStyle = 'clock' | 'hours' | 'hoursCompact';

/** 0 = Sunday, 1 = Monday (same convention as `Date#getDay()`). */
export type WeekStartsOn = 0 | 1;

export type WeekdayStyle = 'short' | 'long' | 'full';
export type MonthStyle = 'short' | 'long' | 'inline';

export interface FormatOptions {
  /** Defaults to the current UI language. */
  locale?: Locale;
  /** "Today"; defaults to the current time. Screens pass `useToday()`. */
  now?: Date;
}

// ── Locale data that is not text ────────────────────────────────────────────

/** pt-BR shows 24h clocks ("14:00"), en-US 12h ("2:00 PM"). */
const CLOCK_24H: Record<Locale, boolean> = { 'pt-BR': true, 'en-US': false };

/** pt-BR weeks start on Monday (as the app always did), en-US on Sunday. */
const WEEK_STARTS_ON: Record<Locale, WeekStartsOn> = { 'pt-BR': 1, 'en-US': 0 };

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// ── Internals ───────────────────────────────────────────────────────────────

function resolveLocale(options?: FormatOptions): Locale {
  return options?.locale ?? getCurrentLocale();
}

/**
 * `Date` from a Date, a timestamp or a string. A bare `YYYY-MM-DD` (how task
 * and note dates are stored) is a local day, not UTC midnight. Null when the
 * value is not a valid date.
 */
export function toDate(value: DateInput): Date | null {
  let date: Date;
  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else if (typeof value === 'string') {
    const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    date = dayOnly
      ? new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]))
      : new Date(value);
  } else {
    date = new Date(value);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthName(monthIndex: number, style: MonthStyle, lng: Locale): string {
  const key = MONTH_KEYS[monthIndex] ?? 'jan';
  if (style === 'short') return i18n.t(`calendar.monthsShort.${key}`, { lng });
  if (style === 'inline') return i18n.t(`calendar.monthsInline.${key}`, { lng });
  return i18n.t(`calendar.monthsLong.${key}`, { lng });
}

function weekdayName(dayIndex: number, style: WeekdayStyle, lng: Locale): string {
  const key = WEEKDAY_KEYS[dayIndex] ?? 'sun';
  if (style === 'short') return i18n.t(`calendar.weekdaysShort.${key}`, { lng });
  if (style === 'full') return i18n.t(`calendar.weekdaysFull.${key}`, { lng });
  return i18n.t(`calendar.weekdaysLong.${key}`, { lng });
}

const pad2 = (value: number) => String(value).padStart(2, '0');

function startOfDayTime(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Calendar days from `now` to `date` (tomorrow = 1, yesterday = -1). DST-safe. */
function dayDiff(date: Date, now: Date): number {
  return Math.round((startOfDayTime(date) - startOfDayTime(now)) / 86_400_000);
}

const PRESETS: Record<DatePreset, (date: Date, lng: Locale, now: Date) => string> = {
  dayMonth: (date, lng) =>
    i18n.t('calendar.formats.dayMonth', { lng, day: date.getDate(), month: monthName(date.getMonth(), 'short', lng) }),
  dayMonthAuto: (date, lng, now) =>
    date.getFullYear() === now.getFullYear() ? PRESETS.dayMonth(date, lng, now) : PRESETS.dayMonthYear(date, lng, now),
  dayMonthYear: (date, lng) =>
    i18n.t('calendar.formats.dayMonthYear', {
      lng,
      day: date.getDate(),
      month: monthName(date.getMonth(), 'short', lng),
      year: date.getFullYear(),
    }),
  dayMonthLong: (date, lng) =>
    i18n.t('calendar.formats.dayMonthLong', { lng, day: date.getDate(), month: monthName(date.getMonth(), 'long', lng) }),
  weekdayDayMonthLong: (date, lng) =>
    i18n.t('calendar.formats.weekdayDayMonthLong', {
      lng,
      weekday: weekdayName(date.getDay(), 'long', lng),
      day: date.getDate(),
      month: monthName(date.getMonth(), 'inline', lng),
    }),
  monthYear: (date, lng) =>
    i18n.t('calendar.formats.monthYear', { lng, month: monthName(date.getMonth(), 'long', lng), year: date.getFullYear() }),
  weekday: (date, lng) => weekdayName(date.getDay(), 'long', lng),
  weekdayFull: (date, lng) => weekdayName(date.getDay(), 'full', lng),
  weekdayShort: (date, lng) => weekdayName(date.getDay(), 'short', lng),
  numeric: (date, lng) =>
    lng === 'en-US'
      ? `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
      : `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`,
};

// ── Dates ───────────────────────────────────────────────────────────────────

/**
 * A date as a named preset (table above). Invalid input returns ''.
 *
 *   formatDate('2026-10-28')                          // pt "28 Out"   en "Oct 28"
 *   formatDate(date, 'dayMonthAuto', { now: today })  // pt "28 Out 2025" when not this year
 *   formatDate(date, 'weekdayDayMonthLong')           // pt "Quarta, 28 de outubro"
 */
export function formatDate(value: DateInput, preset: DatePreset = 'dayMonth', options?: FormatOptions): string {
  const date = toDate(value);
  if (!date) return '';
  return PRESETS[preset](date, resolveLocale(options), options?.now ?? new Date());
}

function parseClock(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * A time of day. Accepts a Date, a timestamp, an ISO string, or a bare
 * `HH:mm` / `HH:mm:ss` as stored on tasks and reminders. Invalid input ''.
 *
 *   formatTime('09:00')                  // pt "09:00"   en "9:00 AM"
 *   formatTime('14:00', 'hoursCompact')  // pt "14h"     en "2 PM"
 *   formatTime(new Date())               // the Date's local time
 */
export function formatTime(value: DateInput, style: TimeStyle = 'clock', options?: FormatOptions): string {
  const lng = resolveLocale(options);
  let hours: number;
  let minutes: number;
  const clock = typeof value === 'string' && !/\d{4}-\d{2}-\d{2}/.test(value) ? parseClock(value) : null;
  if (clock) {
    ({ hours, minutes } = clock);
  } else {
    const date = toDate(value);
    if (!date) return '';
    hours = date.getHours();
    minutes = date.getMinutes();
  }

  if (CLOCK_24H[lng]) {
    if (style === 'clock') return `${pad2(hours)}:${pad2(minutes)}`;
    if (style === 'hoursCompact' && minutes === 0) return `${hours}h`;
    return `${hours}h${pad2(minutes)}`;
  }

  const period = i18n.t(hours < 12 ? 'calendar.am' : 'calendar.pm', { lng });
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  if (style === 'hoursCompact' && minutes === 0) return `${hour12} ${period}`;
  return `${hour12}:${pad2(minutes)} ${period}`;
}

/**
 * Date and time together: "28 Out, 09:00" / "Oct 28, 9:00 AM" (`comma`, the
 * default) or "28 Out às 09:00" / "Oct 28 at 9:00 AM" (`at`).
 */
export function formatDateTime(
  value: DateInput,
  preset: DatePreset = 'dayMonth',
  options?: FormatOptions & { timeStyle?: TimeStyle; joiner?: 'comma' | 'at' },
): string {
  const date = formatDate(value, preset, options);
  if (!date) return '';
  const time = formatTime(value, options?.timeStyle ?? 'clock', options);
  const lng = resolveLocale(options);
  return options?.joiner === 'at'
    ? i18n.t('time.dateAtTime', { lng, date, time })
    : i18n.t('time.dateWithTime', { lng, date, time });
}

export interface RelativeDayOptions extends FormatOptions {
  /** Which words to use. Default: yesterday, today and tomorrow. */
  words?: readonly ('yesterday' | 'today' | 'tomorrow')[];
  /** 2–6 days ahead show the weekday ("Quarta" / "Wednesday"). Default false. */
  weekdayThisWeek?: boolean;
  /** Preset when no word applies. Default `dayMonthAuto`. */
  fallback?: DatePreset;
  /** Lowercase the word ("hoje", "amanhã") for use mid-sentence. */
  lowercase?: boolean;
}

/**
 * "Hoje" / "Amanhã" / "Ontem", optionally the weekday for the next days,
 * else the fallback preset. Invalid input returns ''.
 *
 *   // What task rows show (lib/dates formatDueLabel, without the time):
 *   formatRelativeDay(task.due_date, { now: today, weekdayThisWeek: true })
 *   // pt "Hoje", "Amanhã", "Ontem", "Quarta", "7 Jan", "7 Jan 2025"
 *   // en "Today", "Tomorrow", "Yesterday", "Wednesday", "Jan 7", "Jan 7, 2025"
 */
export function formatRelativeDay(value: DateInput, options: RelativeDayOptions = {}): string {
  const date = toDate(value);
  if (!date) return '';
  const lng = resolveLocale(options);
  const now = options.now ?? new Date();
  const { words = ['yesterday', 'today', 'tomorrow'], weekdayThisWeek = false, fallback = 'dayMonthAuto' } = options;
  const diff = dayDiff(date, now);
  const word =
    diff === 0 && words.includes('today')
      ? i18n.t('time.today', { lng })
      : diff === 1 && words.includes('tomorrow')
        ? i18n.t('time.tomorrow', { lng })
        : diff === -1 && words.includes('yesterday')
          ? i18n.t('time.yesterday', { lng })
          : null;
  if (word) return options.lowercase ? word.toLocaleLowerCase() : word;
  if (weekdayThisWeek && diff > 1 && diff < 7) return weekdayName(date.getDay(), 'long', lng);
  return PRESETS[fallback](date, lng, now);
}

/**
 * How long ago, for "edited …" labels. Future times read as "just now".
 *
 *   pt "agora mesmo", "há 1 minuto", "há 5 minutos", "há 2 horas", "ontem",
 *      "há 3 dias", then "em 7 Out" (`dayMonthAuto`)
 *   en "just now", "1 minute ago", "5 minutes ago", "2 hours ago",
 *      "yesterday", "3 days ago", then "on Oct 7"
 */
export function formatRelativeTime(value: DateInput, options?: FormatOptions): string {
  const date = toDate(value);
  if (!date) return '';
  const lng = resolveLocale(options);
  const now = options?.now ?? new Date();
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 45) return i18n.t('time.justNow', { lng });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return i18n.t('time.minutesAgo', { lng, count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return i18n.t('time.hoursAgo', { lng, count: hours });
  const days = -dayDiff(date, now);
  if (days <= 1) return i18n.t('time.yesterdayInline', { lng });
  if (days < 7) return i18n.t('time.daysAgo', { lng, count: days });
  return i18n.t('time.onDate', { lng, date: PRESETS.dayMonthAuto(date, lng, now) });
}

// ── Calendars ───────────────────────────────────────────────────────────────

/** First day of the week: pt-BR Monday, en-US Sunday. */
export function getWeekStartsOn(options?: FormatOptions): WeekStartsOn {
  return WEEK_STARTS_ON[resolveLocale(options)];
}

/**
 * The 7 weekday names starting at `weekStartsOn` (default: the locale's).
 *   weekdayNames('short')  // pt ["Seg", …, "Dom"]  en ["Sun", …, "Sat"]
 */
export function weekdayNames(style: WeekdayStyle = 'short', weekStartsOn?: number, options?: FormatOptions): string[] {
  const lng = resolveLocale(options);
  const start = weekStartsOn ?? WEEK_STARTS_ON[lng];
  return Array.from({ length: 7 }, (_, i) => weekdayName((start + i) % 7, style, lng));
}

/** The 12 month names, January first. */
export function monthNames(style: MonthStyle = 'long', options?: FormatOptions): string[] {
  const lng = resolveLocale(options);
  return MONTH_KEYS.map((_, index) => monthName(index, style, lng));
}

// ── Lists, numbers, money, sorting ──────────────────────────────────────────

/**
 * Joins items as a sentence.
 *   formatList(['A', 'B', 'C'])          // pt "A, B e C"   en "A, B, and C"
 *   formatList(['A', 'B'], 'or')         // pt "A ou B"     en "A or B"
 */
export function formatList(items: readonly string[], type: 'and' | 'or' = 'and', options?: FormatOptions): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  const lng = resolveLocale(options);
  const first = items.slice(0, -1).join(', ');
  const last = items[items.length - 1]!;
  if (type === 'or') return i18n.t(items.length > 2 ? 'list.orSerial' : 'list.or', { lng, first, last });
  return i18n.t(items.length > 2 ? 'list.andSerial' : 'list.and', { lng, first, last });
}

function fallbackNumber(value: number, lng: Locale, fractionDigits: number): string {
  const [group, decimal] = lng === 'en-US' ? [',', '.'] : ['.', ','];
  const [int = '0', frac] = Math.abs(value).toFixed(fractionDigits).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${value < 0 ? '-' : ''}${grouped}${frac ? `${decimal}${frac}` : ''}`;
}

/**
 *   formatNumber(1234.5)                                   // pt "1.234,5"  en "1,234.5"
 *   formatNumber(0.25, { style: 'percent' })               // pt "25%"      en "25%"
 */
export function formatNumber(value: number, numberOptions?: Intl.NumberFormatOptions, options?: FormatOptions): string {
  const lng = resolveLocale(options);
  try {
    return new Intl.NumberFormat(lng, numberOptions).format(value);
  } catch {
    return fallbackNumber(value, lng, numberOptions?.maximumFractionDigits ?? 0);
  }
}

/**
 * Money from an amount in minor units (cents), as Stripe sends it. The
 * currency comes from the data (`price.currency`), never from the UI
 * language (docs/decisions/0005-i18n.md › Moeda).
 *
 *   formatCurrency(2990, 'BRL')   // pt "R$ 29,90"   en "R$29.90"
 *   formatCurrency(999, 'usd')    // pt "US$ 9,99"   en "$9.99"
 */
export function formatCurrency(amountInMinorUnits: number, currency: string, options?: FormatOptions): string {
  const lng = resolveLocale(options);
  const code = currency.toUpperCase();
  const amount = amountInMinorUnits / 100;
  try {
    return new Intl.NumberFormat(lng, { style: 'currency', currency: code }).format(amount);
  } catch {
    const symbol = code === 'BRL' ? 'R$' : code === 'USD' ? (lng === 'en-US' ? '$' : 'US$') : code;
    const number = fallbackNumber(Math.abs(amount), lng, 2);
    const sign = amount < 0 ? '-' : '';
    return lng === 'en-US' && symbol.length <= 3 && symbol !== code
      ? `${sign}${symbol}${number}`
      : `${sign}${symbol} ${number}`;
  }
}

/** Sort comparator for user text (names, titles) in the UI language. */
export function compareText(a: string, b: string, options?: FormatOptions): number {
  try {
    return a.localeCompare(b, resolveLocale(options), { sensitivity: 'base' });
  } catch {
    return a < b ? -1 : a > b ? 1 : 0;
  }
}
