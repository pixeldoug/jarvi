/**
 * Sanitization helpers for recurrence + reminder fields on agent tool calls.
 * Mirrors taskController / reminderService validation so the agent writes the
 * same shapes the REST API and UI expect.
 */

import type { RecurrenceType } from '../../../types/recurrence';
import {
  createRemindersForTask,
  parseReminderDrafts,
  replaceRemindersForTask,
  rescheduleRemindersForTask,
} from '../../reminderService';
import type { TaskReminder } from '../../../types/reminder';

const VALID_RECURRENCE_TYPES: RecurrenceType[] = [
  'none',
  'hourly',
  'daily',
  'weekdays',
  'weekly',
  'monthly',
  'custom',
];

export function sanitizeRecurrenceType(value: unknown): RecurrenceType {
  if (typeof value === 'string' && VALID_RECURRENCE_TYPES.includes(value as RecurrenceType)) {
    return value as RecurrenceType;
  }
  return 'none';
}

export function sanitizeRecurrenceUntil(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return null;
  return trimmed;
}

interface RecurrenceConfigLike {
  until?: { type?: string; date?: string };
  monthDay?: number;
  daysOfWeek?: number[];
  timeOfDay?: string;
  time?: string;
  everyHours?: number;
  custom?: Record<string, unknown>;
}

export function serializeRecurrenceConfig(
  value: unknown,
  recurrenceType: RecurrenceType,
  dueDate: string | null,
): string | null {
  if (recurrenceType === 'none') return null;

  let config: RecurrenceConfigLike | null = null;
  if (typeof value === 'string' && value.trim()) {
    try {
      config = JSON.parse(value) as RecurrenceConfigLike;
    } catch {
      config = null;
    }
  } else if (value && typeof value === 'object') {
    config = value as RecurrenceConfigLike;
  }

  if (!config) config = {};

  if (!config.until || !config.until.type) {
    config.until = { type: 'never' };
  }

  if (recurrenceType === 'monthly' && !config.monthDay && dueDate) {
    const day = Number(dueDate.slice(8, 10));
    if (day >= 1 && day <= 31) config.monthDay = day;
  }

  if (recurrenceType === 'weekdays' && !config.daysOfWeek?.length) {
    config.daysOfWeek = [1, 2, 3, 4, 5];
  }

  return JSON.stringify(config);
}

export async function applyRemindersToTask(
  taskId: string,
  userId: string,
  reminders: unknown,
  mode: 'create' | 'replace',
): Promise<TaskReminder[]> {
  if (reminders === undefined) return [];

  const inputs = parseReminderDrafts(reminders);
  if (mode === 'create') {
    if (inputs.length === 0) return [];
    return createRemindersForTask(taskId, userId, inputs);
  }

  const created = await replaceRemindersForTask(taskId, userId, inputs);
  await rescheduleRemindersForTask(taskId);
  return created;
}

/** Compact summary for tool results so the model can verify reminders were saved. */
export function summarizeRemindersForTool(reminders: TaskReminder[]): Array<Record<string, unknown>> {
  return reminders.map((r) => ({
    id: r.id,
    channel: r.channel,
    schedule: r.schedule,
    status: r.status,
    trigger_at: r.triggerAt,
  }));
}

/** Tool schema fragment — shared by create_task and update_task. */
export const RECURRENCE_TOOL_PROPERTIES = {
  recurrence_type: {
    type: 'string',
    enum: ['none', 'hourly', 'daily', 'weekdays', 'weekly', 'monthly', 'custom'],
    description:
      'Tipo de recorrência da tarefa. Use "monthly" com monthDay no recurrence_config para "todo dia X de cada mês". Use "none" para remover recorrência.',
  },
  recurrence_config: {
    type: 'object',
    description:
      'Configuração da recorrência. Sempre inclua until: { type: "never" } salvo se o usuário pedir data de término. monthly: { monthDay: 15, until: { type: "never" } }. weekly: { daysOfWeek: [1], until: { type: "never" } } (0=Dom…6=Sáb). daily/weekdays: { until: { type: "never" } }.',
    properties: {
      monthDay: { type: 'number', description: 'Dia do mês (1-31), obrigatório para monthly.' },
      daysOfWeek: {
        type: 'array',
        items: { type: 'number' },
        description: 'Dias da semana (0=Dom…6=Sáb) para weekly/weekdays.',
      },
      timeOfDay: {
        type: 'string',
        enum: ['morning', 'afternoon', 'evening', 'night'],
        description: 'Período do dia quando não houver horário exato.',
      },
      time: { type: 'string', description: 'Horário HH:MM para recorrências que usam hora fixa.' },
      everyHours: { type: 'number', description: 'Intervalo em horas para recurrence_type hourly.' },
      until: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['never', 'onDate'] },
          date: { type: 'string', description: 'YYYY-MM-DD quando type=onDate.' },
        },
      },
    },
  },
  recurrence_until: {
    type: 'string',
    description: 'Data final da recorrência (YYYY-MM-DD), ou omita/null para sem término.',
  },
} as const;

export const REMINDERS_TOOL_PROPERTY = {
  reminders: {
    type: 'array',
    description:
      'Avisos que o usuário RECEBE (WhatsApp ou ligação). Obrigatório quando pedirem "me lembre/me avisa". NÃO use isto no lugar de due_date ou recurrence_*. Ex.: "me lembre dia 5 de cada mês" → relative no vencimento + channel whatsapp (e time na tarefa). "me avisa 1 dia antes" → offset amount=1. Lembrete diário/semanal fixo → type=recurring com frequency daily/weekly.',
    items: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          enum: ['whatsapp', 'call'],
          description: 'Canal de entrega. Default whatsapp se o usuário não especificar.',
        },
        type: { type: 'string', enum: ['relative', 'absolute', 'recurring'] },
        offset: {
          type: 'object',
          properties: {
            amount: { type: 'number' },
            unit: { type: 'string', enum: ['minutes', 'hours', 'days'] },
            direction: { type: 'string', enum: ['before', 'after'] },
          },
        },
        scheduledAt: {
          type: 'string',
          description: 'Datetime local YYYY-MM-DDTHH:mm para lembrete absoluto.',
        },
        time: { type: 'string', description: 'HH:mm para lembrete recorrente.' },
        frequency: { type: 'string', enum: ['daily', 'weekly'] },
        weekday: { type: 'number', description: '0=Dom…6=Sáb, obrigatório se frequency=weekly.' },
      },
      required: ['channel', 'type'],
    },
  },
} as const;
