/**
 * Recurrence helpers - Jarvi Web
 *
 * pt-BR formatting for the "Frequência" chip + small conversion helpers
 * shared between ControlBar, TaskDetailsSidebar and FrequencyPicker.
 */
import {
  RecurrenceConfig,
  RecurrenceType,
  WEEKDAYS_DAYS_OF_WEEK,
  type TimeOfDay,
} from '@jarvi/shared';

export const WEEKDAY_SHORT_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const REPEAT_OPTION_LABELS_PT: Record<RecurrenceType, string> = {
  none: 'Nenhuma',
  hourly: 'A cada hora',
  daily: 'Diariamente',
  weekdays: 'Dias úteis',
  weekly: 'Semanalmente',
  monthly: 'Mensalmente',
  custom: 'Personalizado',
};

export const TIME_OF_DAY_LABELS_PT: Record<TimeOfDay, string> = {
  morning: 'Manhã',
  afternoon: 'Tarde',
  evening: 'Noite',
  night: 'Madrugada',
};

const CUSTOM_FREQUENCY_UNIT_PT: Record<'hourly' | 'daily' | 'weekly' | 'monthly', [string, string]> = {
  hourly: ['hora', 'horas'],
  daily: ['dia', 'dias'],
  weekly: ['semana', 'semanas'],
  monthly: ['mês', 'meses'],
};

const pluralizeUnit = (count: number, [singular, plural]: [string, string]): string =>
  count === 1 ? singular : plural;

export function parseRecurrenceConfig(raw: string | null | undefined): RecurrenceConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RecurrenceConfig;
  } catch {
    return null;
  }
}

/**
 * Short pt-BR summary for the Frequência chip (e.g. "Diariamente", "A cada
 * 2h", "Seg, Qua, Sex", "Todo dia 5", "A cada 2 semanas"). Returns `null`
 * when there's no active recurrence, so the caller can fall back to the
 * static "Frequência" label.
 */
export function formatFrequencyChip(
  recurrenceType: RecurrenceType | null | undefined,
  recurrenceConfig: RecurrenceConfig | string | null | undefined,
): string | null {
  if (!recurrenceType || recurrenceType === 'none') return null;

  const config =
    typeof recurrenceConfig === 'string' ? parseRecurrenceConfig(recurrenceConfig) : recurrenceConfig;

  switch (recurrenceType) {
    case 'hourly': {
      const everyHours = config?.everyHours ?? 1;
      return everyHours <= 1 ? 'A cada hora' : `A cada ${everyHours}h`;
    }

    case 'daily':
      return 'Diariamente';

    case 'weekdays':
      return 'Dias úteis';

    case 'weekly': {
      const daysOfWeek = config?.daysOfWeek?.length ? config.daysOfWeek : [];
      if (daysOfWeek.length === 0) return 'Semanalmente';
      const sorted = [...new Set(daysOfWeek)].sort((a: number, b: number) => a - b);
      return sorted.map((day: number) => WEEKDAY_SHORT_PT[day]).join(', ');
    }

    case 'monthly': {
      const monthDay = config?.monthDay;
      return monthDay ? `Todo dia ${monthDay}` : 'Mensalmente';
    }

    case 'custom': {
      const custom = config?.custom;
      if (!custom) return 'Personalizado';
      const interval = Math.max(1, custom.interval || 1);
      const unit = CUSTOM_FREQUENCY_UNIT_PT[custom.frequency as 'hourly' | 'daily' | 'weekly' | 'monthly'];

      if (interval === 1) {
        // "every 1 <unit>" reads better as the plain label ("Diariamente" etc).
        const plainType = custom.frequency === 'hourly' ? 'hourly' : custom.frequency;
        return formatFrequencyChip(plainType as RecurrenceType, {
          ...config,
          everyHours: 1,
          daysOfWeek: custom.daysOfWeek,
          monthDay: custom.monthDay,
        });
      }

      return `A cada ${interval} ${pluralizeUnit(interval, unit)}`;
    }

    default:
      return null;
  }
}

/**
 * Builds a fresh RecurrenceConfig for a given "Repetir" selection, seeded
 * with sensible defaults derived from `baseDate` (e.g. weekly defaults to
 * the weekday of the base date, monthly to its day-of-month). Always starts
 * from an empty object — callers must NOT merge this with a previous config,
 * so switching between options never leaks unrelated sub-fields (e.g.
 * `daysOfWeek` surviving a Weekly → Daily switch).
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
      return {
        custom: { frequency: 'daily', interval: 1 },
        until,
      };
    default:
      return null;
  }
}
