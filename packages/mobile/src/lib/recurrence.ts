/**
 * pt-BR recurrence labels and defaults. Port of packages/web/src/lib/recurrence.ts
 * so the "Repetir" chip reads the same on both surfaces.
 */
import {
  WEEKDAYS_DAYS_OF_WEEK,
  type RecurrenceConfig,
  type RecurrenceType,
} from '@/types/recurrence';
import { WEEKDAYS_SHORT_PT } from './dates';

export const REPEAT_OPTION_LABELS_PT: Record<RecurrenceType, string> = {
  none: 'Não repetir',
  hourly: 'A cada hora',
  daily: 'Diariamente',
  weekdays: 'Dias úteis',
  weekly: 'Semanalmente',
  monthly: 'Mensalmente',
  custom: 'Personalizado',
};

/** Options the mobile picker offers; `custom` series are shown but edited on the web. */
export const REPEAT_OPTIONS: RecurrenceType[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];

const CUSTOM_UNIT_PLURAL_PT: Record<'hourly' | 'daily' | 'weekly' | 'monthly', string> = {
  hourly: 'horas',
  daily: 'dias',
  weekly: 'semanas',
  monthly: 'meses',
};

export function parseRecurrenceConfig(raw: string | null | undefined): RecurrenceConfig | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as RecurrenceConfig) : null;
  } catch {
    return null;
  }
}

/** "Diariamente", "A cada 2h", "Seg, Qua, Sex", "Todo dia 5", "A cada 2 semanas"; null when not recurring. */
export function formatRecurrence(
  type: RecurrenceType | null | undefined,
  rawConfig: RecurrenceConfig | string | null | undefined,
): string | null {
  if (!type || type === 'none') return null;
  const config = typeof rawConfig === 'string' ? parseRecurrenceConfig(rawConfig) : rawConfig;

  switch (type) {
    case 'hourly': {
      const every = config?.everyHours ?? 1;
      return every <= 1 ? 'A cada hora' : `A cada ${every}h`;
    }
    case 'daily':
      return 'Diariamente';
    case 'weekdays':
      return 'Dias úteis';
    case 'weekly': {
      const days = [...new Set(config?.daysOfWeek ?? [])].sort((a, b) => a - b);
      return days.length === 0 ? 'Semanalmente' : days.map((d) => WEEKDAYS_SHORT_PT[d]).join(', ');
    }
    case 'monthly':
      return config?.monthDay ? `Todo dia ${config.monthDay}` : 'Mensalmente';
    case 'custom': {
      const custom = config?.custom;
      if (!custom) return 'Personalizado';
      const interval = Math.max(1, custom.interval || 1);
      if (interval === 1) {
        return formatRecurrence(custom.frequency, {
          ...config,
          everyHours: 1,
          daysOfWeek: custom.daysOfWeek,
          monthDay: custom.monthDay,
        });
      }
      return `A cada ${interval} ${CUSTOM_UNIT_PLURAL_PT[custom.frequency]}`;
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
