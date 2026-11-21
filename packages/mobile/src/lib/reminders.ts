/**
 * Reminder labels and API mapping. Port of packages/web/src/lib/reminders.ts.
 * Reminders are sent by the backend over WhatsApp or a phone call. Text lives
 * in `src/locales/<locale>/dates.json` (`reminders.*`) and comes out in
 * `options.locale`, else the current UI language. Components pass `{ locale }`
 * so the React Compiler re-runs the call after a language switch.
 */
import { formatDate, formatDateTime, formatTime, i18n, weekdayNames, type FormatOptions } from '@/i18n';
import type {
  ReminderChannel,
  RelativeReminderOffset,
  TaskReminder,
  TaskReminderDraft,
} from '@/types/reminder';

export type ConfiguredReminder = Exclude<TaskReminderDraft, { type: 'unset' }>;

export interface RelativeReminderPreset {
  id: string;
  /** Read in the current UI language each time it is accessed. Components use `getPresetLabel`. */
  readonly label: string;
  offset: RelativeReminderOffset;
}

/** "No horário", "15 min antes", "1 hora antes" / "At the time", "15 min before", "1 hour before". */
function presetLabel(offset: RelativeReminderOffset, options?: FormatOptions): string {
  const lng = options?.locale;
  if (offset.amount === 0) return i18n.t('dates:reminders.presets.atTime', { lng });
  if (offset.unit === 'minutes') return i18n.t('dates:reminders.presets.minutesBefore', { minutes: offset.amount, lng });
  if (offset.unit === 'hours') return i18n.t('dates:reminders.presets.hoursBefore', { count: offset.amount, lng });
  return i18n.t('dates:reminders.presets.daysBefore', { count: offset.amount, lng });
}

export function getPresetLabel(preset: RelativeReminderPreset, options?: FormatOptions): string {
  return presetLabel(preset.offset, options);
}

function relativePreset(id: string, offset: RelativeReminderOffset): RelativeReminderPreset {
  return {
    id,
    offset,
    get label() {
      return presetLabel(offset);
    },
  };
}

export const RELATIVE_REMINDER_PRESETS: RelativeReminderPreset[] = [
  relativePreset('at-time', { amount: 0, unit: 'minutes', direction: 'before' }),
  relativePreset('5m-before', { amount: 5, unit: 'minutes', direction: 'before' }),
  relativePreset('15m-before', { amount: 15, unit: 'minutes', direction: 'before' }),
  relativePreset('30m-before', { amount: 30, unit: 'minutes', direction: 'before' }),
  relativePreset('1h-before', { amount: 1, unit: 'hours', direction: 'before' }),
  relativePreset('2h-before', { amount: 2, unit: 'hours', direction: 'before' }),
  relativePreset('1d-before', { amount: 1, unit: 'days', direction: 'before' }),
];

const CHANNELS: readonly ReminderChannel[] = ['whatsapp', 'call'];

/** "WhatsApp" / "Ligação" (en "Phone call"). */
export function getChannelLabel(channel: ReminderChannel, options?: FormatOptions): string {
  return i18n.t(`dates:reminders.channels.${channel}`, { lng: options?.locale });
}

/** @deprecated Use `getChannelLabel(channel)`. Values follow the UI language. */
export const CHANNEL_LABELS: Record<ReminderChannel, string> = (() => {
  const record = {} as Record<ReminderChannel, string>;
  for (const channel of CHANNELS) {
    Object.defineProperty(record, channel, { enumerable: true, get: () => getChannelLabel(channel) });
  }
  return record;
})();

function formatOffset(offset: RelativeReminderOffset, options?: FormatOptions): string {
  const lng = options?.locale;
  if (offset.amount === 0) return i18n.t('dates:reminders.presets.atTime', { lng });
  const count = offset.amount;
  const before = offset.direction === 'before';
  switch (offset.unit) {
    case 'minutes':
      return before
        ? i18n.t('dates:reminders.offset.minutesBefore', { count, lng })
        : i18n.t('dates:reminders.offset.minutesAfter', { count, lng });
    case 'hours':
      return before
        ? i18n.t('dates:reminders.offset.hoursBefore', { count, lng })
        : i18n.t('dates:reminders.offset.hoursAfter', { count, lng });
    default:
      return before
        ? i18n.t('dates:reminders.offset.daysBefore', { count, lng })
        : i18n.t('dates:reminders.offset.daysAfter', { count, lng });
  }
}

/** "5 Nov às 14:30" / "Nov 5 at 2:30 PM"; "5 Nov 2026" / "Nov 5, 2026" without a time. */
function formatAbsolute(isoLocal: string, options?: FormatOptions): string {
  if (/Z$|[+-]\d{2}:\d{2}$/i.test(isoLocal)) {
    const parsed = new Date(isoLocal);
    if (!Number.isNaN(parsed.getTime())) return formatDateTime(parsed, 'dayMonth', { ...options, joiner: 'at' });
  }
  const [datePart = '', timePart] = isoLocal.split('T');
  const [year = NaN, month = 1, day = NaN] = datePart.split('-').map(Number);
  if (!timePart) return formatDate(new Date(year, month - 1, day), 'dayMonthYear', options);
  const [hh = '0', mm = '0'] = timePart.split('.')[0]!.split(':');
  return formatDateTime(new Date(year, month - 1, day, Number(hh), Number(mm)), 'dayMonth', { ...options, joiner: 'at' });
}

/** Stored `HH:mm` shown in the UI language; the raw value if it does not parse. */
function displayTime(time: string, options?: FormatOptions): string {
  return formatTime(time, undefined, options) || time;
}

export function formatReminder(reminder: TaskReminderDraft, options?: FormatOptions): string {
  const lng = options?.locale;
  switch (reminder.type) {
    case 'unset':
      return i18n.t('dates:reminders.set', { lng });
    case 'relative': {
      const preset = RELATIVE_REMINDER_PRESETS.find(
        (p) =>
          p.offset.amount === reminder.offset.amount &&
          p.offset.unit === reminder.offset.unit &&
          p.offset.direction === reminder.offset.direction,
      );
      return preset ? getPresetLabel(preset, options) : formatOffset(reminder.offset, options);
    }
    case 'recurring': {
      const time = displayTime(reminder.time, options);
      if (reminder.frequency === 'daily') return i18n.t('dates:reminders.recurring.daily', { time, lng });
      if (reminder.weekday === undefined) return i18n.t('dates:reminders.recurring.everyWeek', { time, lng });
      const weekday = weekdayNames('full', 0, options)[reminder.weekday] ?? '';
      return i18n.t('dates:reminders.recurring.weekly', { weekday, time, lng });
    }
    case 'absolute':
      return formatAbsolute(reminder.scheduledAt, options);
  }
}

/** "WhatsApp · 15 min antes" / "WhatsApp · 15 min before" */
export function formatReminderWithChannel(reminder: ConfiguredReminder, options?: FormatOptions): string {
  return i18n.t('dates:reminders.withChannel', {
    channel: getChannelLabel(reminder.channel, options),
    when: formatReminder(reminder, options),
    lng: options?.locale,
  });
}

export function createReminderId(): string {
  return `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function reminderFromApi(reminder: TaskReminder): ConfiguredReminder {
  const base = { id: reminder.id, channel: reminder.channel };
  const { schedule } = reminder;
  if (schedule.type === 'relative') return { ...base, type: 'relative', offset: schedule.offset };
  if (schedule.type === 'absolute') return { ...base, type: 'absolute', scheduledAt: schedule.scheduledAt };
  return { ...base, type: 'recurring', time: schedule.time, frequency: schedule.frequency, weekday: schedule.weekday };
}

/** Body item for PUT /api/tasks/:id/reminders. */
export function reminderToApi(reminder: ConfiguredReminder): Record<string, unknown> {
  const base = { id: reminder.id, channel: reminder.channel, type: reminder.type };
  switch (reminder.type) {
    case 'relative':
      return { ...base, offset: reminder.offset };
    case 'absolute':
      return { ...base, scheduledAt: reminder.scheduledAt };
    case 'recurring':
      return { ...base, time: reminder.time, frequency: reminder.frequency, weekday: reminder.weekday };
  }
}

export function isSameReminder(a: ConfiguredReminder, b: ConfiguredReminder): boolean {
  if (a.channel !== b.channel || a.type !== b.type) return false;
  if (a.type === 'relative' && b.type === 'relative') {
    return (
      a.offset.amount === b.offset.amount &&
      a.offset.unit === b.offset.unit &&
      a.offset.direction === b.offset.direction
    );
  }
  if (a.type === 'absolute' && b.type === 'absolute') return a.scheduledAt === b.scheduledAt;
  if (a.type === 'recurring' && b.type === 'recurring') {
    return a.frequency === b.frequency && a.time === b.time && a.weekday === b.weekday;
  }
  return false;
}
