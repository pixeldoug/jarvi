/**
 * Recurrence labels and defaults. Port of packages/web/src/lib/recurrence.ts
 * so the "Repetir" chip reads the same on both surfaces. Text lives in
 * `src/locales/<locale>/dates.json` (`recurrence.*`) and comes out in
 * `options.locale`, else the current UI language. Components pass `{ locale }`
 * so the React Compiler re-runs the call after a language switch.
 */
import { i18n, weekdayNames, type FormatOptions } from '@/i18n';
import {
  WEEKDAYS_DAYS_OF_WEEK,
  type RecurrenceConfig,
  type RecurrenceType,
} from '@/types/recurrence';

const RECURRENCE_TYPES: readonly RecurrenceType[] = ['none', 'hourly', 'daily', 'weekdays', 'weekly', 'monthly', 'custom'];

/** Label of a "Repetir" option: pt "Diariamente" / "Não repetir", en "Daily" / "Don't repeat". */
export function getRepeatOptionLabel(type: RecurrenceType, options?: FormatOptions): string {
  return i18n.t(`dates:recurrence.repeat.${type}`, { lng: options?.locale });
}

/**
 * @deprecated Use `getRepeatOptionLabel(type)`. Kept for existing imports;
 * each value is read in the current UI language when accessed.
 */
export const REPEAT_OPTION_LABELS_PT: Record<RecurrenceType, string> = (() => {
  const record = {} as Record<RecurrenceType, string>;
  for (const type of RECURRENCE_TYPES) {
    Object.defineProperty(record, type, { enumerable: true, get: () => getRepeatOptionLabel(type) });
  }
  return record;
})();

/** Options the mobile picker offers; `custom` series are shown but edited on the web. */
export const REPEAT_OPTIONS: RecurrenceType[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];

export function parseRecurrenceConfig(raw: string | null | undefined): RecurrenceConfig | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as RecurrenceConfig) : null;
  } catch {
    return null;
  }
}

/**
 * Chip text, null when not recurring.
 *   pt "Diariamente", "A cada 2h", "Seg, Qua, Sex", "Todo dia 5", "A cada 2 semanas"
 *   en "Daily", "Every 2 hours", "Mon, Wed, Fri", "Monthly on day 5", "Every 2 weeks"
 */
export function formatRecurrence(
  type: RecurrenceType | null | undefined,
  rawConfig: RecurrenceConfig | string | null | undefined,
  options?: FormatOptions,
): string | null {
  if (!type || type === 'none') return null;
  const config = typeof rawConfig === 'string' ? parseRecurrenceConfig(rawConfig) : rawConfig;
  const lng = options?.locale;

  switch (type) {
    case 'hourly': {
      const every = config?.everyHours ?? 1;
      return every <= 1
        ? getRepeatOptionLabel('hourly', options)
        : i18n.t('dates:recurrence.chip.everyHours', { hours: every, lng });
    }
    case 'daily':
      return getRepeatOptionLabel('daily', options);
    case 'weekdays':
      return getRepeatOptionLabel('weekdays', options);
    case 'weekly': {
      const days = [...new Set(config?.daysOfWeek ?? [])].sort((a, b) => a - b);
      if (days.length === 0) return getRepeatOptionLabel('weekly', options);
      const labels = weekdayNames('short', 0, options);
      return days.map((d) => labels[d]).join(', ');
    }
    case 'monthly':
      return config?.monthDay
        ? i18n.t('dates:recurrence.chip.monthDay', { day: config.monthDay, lng })
        : getRepeatOptionLabel('monthly', options);
    case 'custom': {
      const custom = config?.custom;
      if (!custom) return getRepeatOptionLabel('custom', options);
      const interval = Math.max(1, custom.interval || 1);
      if (interval === 1) {
        return formatRecurrence(
          custom.frequency,
          {
            ...config,
            everyHours: 1,
            daysOfWeek: custom.daysOfWeek,
            monthDay: custom.monthDay,
          },
          options,
        );
      }
      return i18n.t(`dates:recurrence.chip.everyInterval.${custom.frequency}`, { count: interval, lng });
    }
    default:
      return null;
  }
}

/**
 * Fresh config for a "Repetir" choice, seeded from `baseDate` (weekly uses its
 * weekday, monthly its day of month). Never merge with a previous config.
 */
export function buildDefaultRecurrenceConfig(
  type: RecurrenceType,
  baseDate: Date,
  previousUntil?: RecurrenceConfig['until'],
): RecurrenceConfig | null {
  const until = previousUntil ?? { type: 'never' as const };
  switch (type) {
    case 'none':
      return null;
    case 'hourly':
      return { everyHours: 1, until };
    case 'daily':
      return { until };
    case 'weekdays':
      return { daysOfWeek: WEEKDAYS_DAYS_OF_WEEK, until };
    case 'weekly':
      return { daysOfWeek: [baseDate.getDay()], until };
    case 'monthly':
      return { monthDay: baseDate.getDate(), until };
    case 'custom':
      return { custom: { frequency: 'daily', interval: 1 }, until };
    default:
      return null;
  }
}
