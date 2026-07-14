import type { RelativeReminderOffset, TaskReminderDraft } from '@jarvi/shared';

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

export function taskHasSchedule(dueDate: Date | null | undefined, dueTime?: string): boolean {
  return Boolean(dueDate || dueTime);
}
