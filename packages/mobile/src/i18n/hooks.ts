/**
 * React hooks over the i18n instance. Both re-render the component when the
 * language changes (they subscribe through react-i18next).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  compareText,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatList,
  formatNumber,
  formatRelativeDay,
  formatRelativeTime,
  formatTime,
  getWeekStartsOn,
  monthNames,
  weekdayNames,
  type DateInput,
  type DatePreset,
  type FormatOptions,
  type MonthStyle,
  type RelativeDayOptions,
  type TimeStyle,
  type WeekdayStyle,
} from './format';
import { DEFAULT_LOCALE, matchLocale, type Locale } from './locale';

/** The active language (`'pt-BR' | 'en-US'`). */
export function useLocale(): Locale {
  const { i18n } = useTranslation();
  return matchLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE;
}

type WithoutLocale<T> = Omit<T, 'locale'>;

/**
 * The format.ts helpers bound to the active language.
 *
 *   const today = useToday();
 *   const { formatDate, formatTime, formatRelativeDay } = useFormat();
 *   formatRelativeDay(task.due_date, { now: today, weekdayThisWeek: true })
 *   formatTime(task.time)                 // pt "09:00"   en "9:00 AM"
 *   formatDate(day, 'monthYear')          // pt "Outubro 2026"
 */
export function useFormat() {
  const locale = useLocale();
  return useMemo(
    () => ({
      locale,
      weekStartsOn: getWeekStartsOn({ locale }),
      formatDate: (value: DateInput, preset?: DatePreset, options?: WithoutLocale<FormatOptions>) =>
        formatDate(value, preset, { ...options, locale }),
      formatTime: (value: DateInput, style?: TimeStyle) => formatTime(value, style, { locale }),
      formatDateTime: (
        value: DateInput,
        preset?: DatePreset,
        options?: WithoutLocale<FormatOptions> & { timeStyle?: TimeStyle; joiner?: 'comma' | 'at' },
      ) => formatDateTime(value, preset, { ...options, locale }),
      formatRelativeDay: (value: DateInput, options?: WithoutLocale<RelativeDayOptions>) =>
        formatRelativeDay(value, { ...options, locale }),
      formatRelativeTime: (value: DateInput, options?: WithoutLocale<FormatOptions>) =>
        formatRelativeTime(value, { ...options, locale }),
      formatList: (items: readonly string[], type?: 'and' | 'or') => formatList(items, type, { locale }),
      formatNumber: (value: number, numberOptions?: Intl.NumberFormatOptions) =>
        formatNumber(value, numberOptions, { locale }),
      formatCurrency: (amountInMinorUnits: number, currency: string) =>
        formatCurrency(amountInMinorUnits, currency, { locale }),
      weekdayNames: (style?: WeekdayStyle, weekStartsOn?: number) => weekdayNames(style, weekStartsOn, { locale }),
      monthNames: (style?: MonthStyle) => monthNames(style, { locale }),
      compareText: (a: string, b: string) => compareText(a, b, { locale }),
    }),
    [locale],
  );
}
