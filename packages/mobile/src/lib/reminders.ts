/**
 * Reminder labels and API mapping. Port of packages/web/src/lib/reminders.ts.
 * Reminders are sent by the backend over WhatsApp or a phone call.
 */
import type {
  ReminderChannel,
  RelativeReminderOffset,
  TaskReminder,
  TaskReminderDraft,
} from '@/types/reminder';
import { MONTHS_SHORT_PT } from './dates';

export type ConfiguredReminder = Exclude<TaskReminderDraft, { type: 'unset' }>;

export interface RelativeReminderPreset {
  id: string;
  label: string;
  offset: RelativeReminderOffset;
}

export const RELATIVE_REMINDER_PRESETS: RelativeReminderPreset[] = [
  { id: 'at-time', label: 'No horário', offset: { amount: 0, unit: 'minutes', direction: 'before' } },
  { id: '5m-before', label: '5 min antes', offset: { amount: 5, unit: 'minutes', direction: 'before' } },
  { id: '15m-before', label: '15 min antes', offset: { amount: 15, unit: 'minutes', direction: 'before' } },
  { id: '30m-before', label: '30 min antes', offset: { amount: 30, unit: 'minutes', direction: 'before' } },
  { id: '1h-before', label: '1 hora antes', offset: { amount: 1, unit: 'hours', direction: 'before' } },
  { id: '2h-before', label: '2 horas antes', offset: { amount: 2, unit: 'hours', direction: 'before' } },
  { id: '1d-before', label: '1 dia antes', offset: { amount: 1, unit: 'days', direction: 'before' } },
];

export const CHANNEL_LABELS: Record<ReminderChannel, string> = {
  whatsapp: 'WhatsApp',
  call: 'Ligação',
};

const WEEKDAY_LABELS_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function formatOffset(offset: RelativeReminderOffset): string {
  if (offset.amount === 0) return 'No horário';
  const units = {
    minutes: ['minuto', 'minutos'],
    hours: ['hora', 'horas'],
    days: ['dia', 'dias'],
  } as const;
  const [singular, plural] = units[offset.unit];
  return `${offset.amount} ${offset.amount === 1 ? singular : plural} ${offset.direction === 'before' ? 'antes' : 'depois'}`;
}

function formatAbsolute(isoLocal: string): string {
  if (/Z$|[+-]\d{2}:\d{2}$/i.test(isoLocal)) {
    const parsed = new Date(isoLocal);
    if (!Number.isNaN(parsed.getTime())) {
      const hh = String(parsed.getHours()).padStart(2, '0');
      const mm = String(parsed.getMinutes()).padStart(2, '0');
      return `${parsed.getDate()} ${MONTHS_SHORT_PT[parsed.getMonth()]} às ${hh}:${mm}`;
    }
  }
  const [datePart = '', timePart] = isoLocal.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const monthLabel = MONTHS_SHORT_PT[(month ?? 1) - 1];
  if (!timePart) return `${day} ${monthLabel} ${year}`;
  const [hh = '00', mm = '00'] = timePart.split('.')[0]!.split(':');
  return `${day} ${monthLabel} às ${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
}

export function formatReminder(reminder: TaskReminderDraft): string {
  switch (reminder.type) {
    case 'unset':
      return 'Definir';
    case 'relative': {
      const preset = RELATIVE_REMINDER_PRESETS.find(
        (p) =>
          p.offset.amount === reminder.offset.amount &&
          p.offset.unit === reminder.offset.unit &&
          p.offset.direction === reminder.offset.direction,
      );
      return preset?.label ?? formatOffset(reminder.offset);
    }
    case 'recurring':
      return reminder.frequency === 'daily'
        ? `Todos os dias às ${reminder.time}`
        : `Toda ${reminder.weekday !== undefined ? WEEKDAY_LABELS_PT[reminder.weekday] : 'semana'} às ${reminder.time}`;
    case 'absolute':
      return formatAbsolute(reminder.scheduledAt);
  }
}

/** "WhatsApp · 15 min antes" */
export function formatReminderWithChannel(reminder: ConfiguredReminder): string {
  return `${CHANNEL_LABELS[reminder.channel]} · ${formatReminder(reminder)}`;
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
