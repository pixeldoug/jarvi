import type {
  RelativeReminderOffset,
  ReminderChannel,
  TaskReminder,
  TaskReminderDraft,
} from '@jarvi/shared';

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

export function getWhenDropdownPresets(canUseRelative: boolean): RelativeReminderPreset[] {
  if (!canUseRelative) return [];
  return RELATIVE_REMINDER_PRESETS;
}

function formatOffsetLabel(offset: RelativeReminderOffset): string {
  if (offset.amount === 0) return 'No horário';

  const unitLabel =
    offset.unit === 'minutes'
      ? offset.amount === 1
        ? 'minuto'
        : 'minutos'
      : offset.unit === 'hours'
        ? offset.amount === 1
          ? 'hora'
          : 'horas'
        : offset.amount === 1
          ? 'dia'
          : 'dias';

  const preposition = offset.direction === 'before' ? 'antes' : 'depois';
  return `${offset.amount} ${unitLabel} ${preposition}`;
}

function formatAbsoluteDateTime(isoLocal: string): string {
  const [datePart, timePart] = isoLocal.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const monthLabel = date
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .replace(/^./, (s) => s.toUpperCase());

  if (timePart) {
    return `${day} ${monthLabel} às ${timePart}`;
  }

  return `${day} ${monthLabel} ${year}`;
}

const WEEKDAY_LABELS_PT = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const;

function formatRecurringLabel(reminder: Extract<TaskReminderDraft, { type: 'recurring' }>): string {
  if (reminder.frequency === 'daily') {
    return `Todos os dias às ${reminder.time}`;
  }

  const weekday =
    reminder.weekday !== undefined ? WEEKDAY_LABELS_PT[reminder.weekday] : 'semana';
  return `Toda ${weekday} às ${reminder.time}`;
}

const CHANNEL_LABELS: Record<ReminderChannel, string> = {
  whatsapp: 'Whatsapp',
  call: 'Ligação',
};

/** Channels shown in the destination picker (Figma dropdown order). */
export const REMINDER_CHANNEL_OPTIONS: ReminderChannel[] = ['call', 'whatsapp'];

export function formatChannelLabel(channel: ReminderChannel): string {
  return CHANNEL_LABELS[channel];
}

export function formatChannelOptionLabel(channel: ReminderChannel): string {
  return CHANNEL_LABELS[channel];
}

export function formatCustomDateLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selected = new Date(date);
  selected.setHours(0, 0, 0, 0);

  if (selected.getTime() === today.getTime()) return 'Hoje';

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (selected.getTime() === tomorrow.getTime()) return 'Amanhã';

  const day = date.getDate();
  const month = date
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .replace(/^./, (s) => s.toUpperCase());

  return `${day} ${month} ${date.getFullYear()}`;
}

export function dateToIsoDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatReminderLabel(reminder: TaskReminderDraft): string {
  if (reminder.type === 'unset') return 'Definir';

  if (reminder.type === 'relative') {
    const preset = RELATIVE_REMINDER_PRESETS.find(
      (p) =>
        p.offset.amount === reminder.offset.amount &&
        p.offset.unit === reminder.offset.unit &&
        p.offset.direction === reminder.offset.direction,
    );
    return preset?.label ?? formatOffsetLabel(reminder.offset);
  }

  if (reminder.type === 'recurring') {
    return formatRecurringLabel(reminder);
  }

  return formatAbsoluteDateTime(reminder.scheduledAt);
}

export function formatRemindersChipLabel(reminders: TaskReminderDraft[]): string {
  const configured = reminders.filter(isConfiguredReminder);
  if (configured.length === 0) return 'Lembretes';
  if (configured.length === 1) return formatReminderLabel(configured[0]);
  return `${configured.length} lembretes`;
}

export function createReminderId(): string {
  return `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultReminderDraft(): TaskReminderDraft {
  return {
    id: createReminderId(),
    channel: 'whatsapp',
    type: 'unset',
  };
}

/** @deprecated Use createDefaultReminderDraft */
export function createEmptyReminderCard(): TaskReminderDraft {
  return createDefaultReminderDraft();
}

export function isConfiguredReminder(
  reminder: TaskReminderDraft,
): reminder is Exclude<TaskReminderDraft, { type: 'unset' }> {
  return reminder.type !== 'unset';
}

export type ConfiguredReminder = Exclude<TaskReminderDraft, { type: 'unset' }>;

export function areRemindersEqual(a: ConfiguredReminder, b: ConfiguredReminder): boolean {
  if (a.channel !== b.channel || a.type !== b.type) return false;

  if (a.type === 'relative' && b.type === 'relative') {
    return (
      a.offset.amount === b.offset.amount &&
      a.offset.unit === b.offset.unit &&
      a.offset.direction === b.offset.direction
    );
  }

  if (a.type === 'absolute' && b.type === 'absolute') {
    return a.scheduledAt === b.scheduledAt;
  }

  if (a.type === 'recurring' && b.type === 'recurring') {
    return (
      a.frequency === b.frequency &&
      a.time === b.time &&
      a.weekday === b.weekday
    );
  }

  return false;
}

export function hasDuplicateReminder(
  reminders: ConfiguredReminder[],
  candidate: ConfiguredReminder,
): boolean {
  return reminders.some((reminder) => areRemindersEqual(reminder, candidate));
}

/** Relative reminders need a task due time as reference (date alone is not enough). */
export function taskHasSchedule(_dueDate: Date | null | undefined, dueTime?: string): boolean {
  return Boolean(dueTime?.trim());
}

export function taskReminderToDraft(reminder: TaskReminder): ConfiguredReminder {
  const base = { id: reminder.id, channel: reminder.channel };

  if (reminder.schedule.type === 'relative') {
    return { ...base, type: 'relative', offset: reminder.schedule.offset };
  }

  if (reminder.schedule.type === 'absolute') {
    return { ...base, type: 'absolute', scheduledAt: reminder.schedule.scheduledAt };
  }

  return {
    ...base,
    type: 'recurring',
    time: reminder.schedule.time,
    frequency: reminder.schedule.frequency,
    weekday: reminder.schedule.weekday,
  };
}

export function configuredReminderToApiPayload(reminder: ConfiguredReminder): Record<string, unknown> {
  if (reminder.type === 'relative') {
    return {
      id: reminder.id,
      channel: reminder.channel,
      type: 'relative',
      offset: reminder.offset,
    };
  }

  if (reminder.type === 'absolute') {
    return {
      id: reminder.id,
      channel: reminder.channel,
      type: 'absolute',
      scheduledAt: reminder.scheduledAt,
    };
  }

  return {
    id: reminder.id,
    channel: reminder.channel,
    type: 'recurring',
    time: reminder.time,
    frequency: reminder.frequency,
    weekday: reminder.weekday,
  };
}
