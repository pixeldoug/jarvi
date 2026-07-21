/**
 * Task reminder engine — JAR-14
 *
 * Persists reminders linked to tasks, computes trigger_at from the user's
 * timezone, and fires them on a node-cron schedule (no Redis dependency).
 */
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import type {
  CreateTaskReminderInput,
  RelativeReminderOffset,
  RelativeReminderOffsetUnit,
  ReminderChannel,
  ReminderStatus,
  TaskReminder,
  TaskReminderDraft,
  TaskReminderSchedule,
} from '../types/reminder';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { getDateTimeForTimezone } from './agent/core/time';
import { sendReminderTemplateMessage } from './whatsappService';
import { initiateReminderCall } from './voiceService';
import { sanitizeTimeString } from '../utils/taskTime';

const FALLBACK_TIMEZONE = 'America/Sao_Paulo';
const VALID_CHANNELS: ReminderChannel[] = ['whatsapp', 'call'];
const ACTIVE_STATUSES: ReminderStatus[] = ['pending', 'scheduled'];

export interface ReminderTaskRow {
  id: string;
  user_id: string;
  title: string;
  due_date: string | null;
  time: string | null;
  completed: boolean | number;
}

interface ReminderRow {
  id: string;
  task_id: string;
  user_id: string;
  channel: string;
  schedule_type: string;
  config: string;
  timezone: string;
  trigger_at: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserDeliveryRow {
  whatsapp_phone: string | null;
  whatsapp_verified: boolean | number | null;
  timezone: string | null;
}

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

const getZonedParts = (
  date: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number } => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
  };
};

export function localWallClockToUtcIso(
  datePart: string,
  timePart: string,
  timezone: string,
): string | null {
  const dateMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return null;

  const target = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };

  let guessMs = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0);

  for (let i = 0; i < 4; i++) {
    const zoned = getZonedParts(new Date(guessMs), timezone);
    const desiredMs = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
    const actualMs = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute);
    const diffMs = desiredMs - actualMs;
    if (diffMs === 0) break;
    guessMs += diffMs;
  }

  return new Date(guessMs).toISOString();
}

const addDaysToIsoDate = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const offsetToMs = (offset: RelativeReminderOffset): number => {
  const unitMs: Record<RelativeReminderOffsetUnit, number> = {
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
  };
  const signed = offset.direction === 'before' ? -1 : 1;
  return signed * offset.amount * unitMs[offset.unit];
};

const normalizeDueDate = (dueDate: string | null | undefined): string | null => {
  if (!dueDate) return null;
  const match = String(dueDate).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

const parseScheduleConfig = (scheduleType: string, configJson: string): TaskReminderSchedule | null => {
  try {
    const config = JSON.parse(configJson) as Record<string, unknown>;
    if (scheduleType === 'relative' && config.offset) {
      return { type: 'relative', offset: config.offset as RelativeReminderOffset };
    }
    if (scheduleType === 'absolute' && typeof config.scheduledAt === 'string') {
      return { type: 'absolute', scheduledAt: config.scheduledAt };
    }
    if (scheduleType === 'recurring' && typeof config.time === 'string' && config.frequency) {
      return {
        type: 'recurring',
        time: config.time,
        frequency: config.frequency as 'daily' | 'weekly',
        weekday: typeof config.weekday === 'number' ? config.weekday : undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
};

const rowToReminder = (row: ReminderRow): TaskReminder | null => {
  const schedule = parseScheduleConfig(row.schedule_type, row.config);
  if (!schedule) return null;

  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    channel: row.channel as ReminderChannel,
    schedule,
    status: row.status as ReminderStatus,
    triggerAt: row.trigger_at,
    timezone: row.timezone,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const scheduleToStorage = (
  schedule: TaskReminderSchedule,
): { scheduleType: string; config: string } => {
  if (schedule.type === 'relative') {
    return { scheduleType: 'relative', config: JSON.stringify({ offset: schedule.offset }) };
  }
  if (schedule.type === 'absolute') {
    return { scheduleType: 'absolute', config: JSON.stringify({ scheduledAt: schedule.scheduledAt }) };
  }
  return {
    scheduleType: 'recurring',
    config: JSON.stringify({
      time: schedule.time,
      frequency: schedule.frequency,
      weekday: schedule.weekday,
    }),
  };
};

// ---------------------------------------------------------------------------
// Validation + trigger computation
// ---------------------------------------------------------------------------

export function parseReminderInput(value: unknown): CreateTaskReminderInput | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Record<string, unknown>;
  if (draft.type === 'unset') return null;
  if (!VALID_CHANNELS.includes(draft.channel as ReminderChannel)) return null;

  const channel = draft.channel as ReminderChannel;

  if (draft.type === 'relative' && draft.offset && typeof draft.offset === 'object') {
    const offset = draft.offset as RelativeReminderOffset;
    if (!['minutes', 'hours', 'days'].includes(offset.unit)) return null;
    if (!['before', 'after'].includes(offset.direction)) return null;
    if (typeof offset.amount !== 'number' || offset.amount < 0) return null;
    return { channel, type: 'relative', offset };
  }

  if (draft.type === 'absolute' && typeof draft.scheduledAt === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(draft.scheduledAt)) return null;
    return { channel, type: 'absolute', scheduledAt: draft.scheduledAt };
  }

  if (draft.type === 'recurring' && typeof draft.time === 'string' && draft.frequency) {
    if (!/^\d{1,2}:\d{2}$/.test(draft.time)) return null;
    if (draft.frequency !== 'daily' && draft.frequency !== 'weekly') return null;
    if (draft.frequency === 'weekly' && typeof draft.weekday !== 'number') return null;
    return {
      channel,
      type: 'recurring',
      time: draft.time,
      frequency: draft.frequency,
      weekday: typeof draft.weekday === 'number' ? draft.weekday : undefined,
    };
  }

  return null;
}

export function parseReminderDrafts(value: unknown): CreateTaskReminderInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => parseReminderInput(item))
    .filter((item): item is CreateTaskReminderInput => item !== null);
}

const computeRecurringTriggerAt = (
  schedule: Extract<TaskReminderSchedule, { type: 'recurring' }>,
  timezone: string,
  now: Date = new Date(),
): string | null => {
  const { isoDate } = getDateTimeForTimezone(timezone);

  if (schedule.frequency === 'daily') {
    const todayTrigger = localWallClockToUtcIso(isoDate, schedule.time, timezone);
    if (todayTrigger && new Date(todayTrigger) > now) return todayTrigger;
    return localWallClockToUtcIso(addDaysToIsoDate(isoDate, 1), schedule.time, timezone);
  }

  if (schedule.weekday === undefined) return null;

  for (let offset = 0; offset < 8; offset++) {
    const candidateDate = addDaysToIsoDate(isoDate, offset);
    const [y, m, d] = candidateDate.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
    if (weekday !== schedule.weekday) continue;

    const trigger = localWallClockToUtcIso(candidateDate, schedule.time, timezone);
    if (trigger && new Date(trigger) > now) return trigger;
  }

  return null;
};

export function computeTriggerAt(
  schedule: TaskReminderSchedule,
  task: ReminderTaskRow,
  timezone: string,
  now: Date = new Date(),
): string | null {
  if (task.completed) return null;

  if (schedule.type === 'absolute') {
    const [datePart, timePart = '00:00'] = schedule.scheduledAt.split('T');
    return localWallClockToUtcIso(datePart, timePart, timezone);
  }

  if (schedule.type === 'recurring') {
    return computeRecurringTriggerAt(schedule, timezone, now);
  }

  const dueDate = normalizeDueDate(task.due_date);
  if (!dueDate) return null;

  const time = sanitizeTimeString(task.time) || '00:00';
  const baseUtc = localWallClockToUtcIso(dueDate, time, timezone);
  if (!baseUtc) return null;

  const triggerMs = new Date(baseUtc).getTime() + offsetToMs(schedule.offset);
  return new Date(triggerMs).toISOString();
}

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------

export async function getUserTimezone(userId: string): Promise<string> {
  if (isPostgreSQL()) {
    const result = await getPool().query<{ timezone: string | null }>(
      'SELECT timezone FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0]?.timezone || FALLBACK_TIMEZONE;
  }

  const row = await getDatabase().get<UserDeliveryRow>(
    'SELECT timezone FROM users WHERE id = ?',
    [userId],
  );
  return row?.timezone || FALLBACK_TIMEZONE;
}

const fetchTaskForUser = async (
  taskId: string,
  userId: string,
): Promise<ReminderTaskRow | null> => {
  if (isPostgreSQL()) {
    const result = await getPool().query<ReminderTaskRow>(
      'SELECT id, user_id, title, due_date, time, completed FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, userId],
    );
    return result.rows[0] ?? null;
  }

  return (
    (await getDatabase().get<ReminderTaskRow>(
      'SELECT id, user_id, title, due_date, time, completed FROM tasks WHERE id = ? AND user_id = ?',
      [taskId, userId],
    )) ?? null
  );
};

const fetchTaskById = async (taskId: string): Promise<ReminderTaskRow | null> => {
  if (isPostgreSQL()) {
    const result = await getPool().query<ReminderTaskRow>(
      'SELECT id, user_id, title, due_date, time, completed FROM tasks WHERE id = $1',
      [taskId],
    );
    return result.rows[0] ?? null;
  }

  return (
    (await getDatabase().get<ReminderTaskRow>(
      'SELECT id, user_id, title, due_date, time, completed FROM tasks WHERE id = ?',
      [taskId],
    )) ?? null
  );
};

const fetchReminderRowById = async (reminderId: string): Promise<ReminderRow | null> => {
  if (isPostgreSQL()) {
    const result = await getPool().query<ReminderRow>(
      'SELECT * FROM task_reminders WHERE id = $1',
      [reminderId],
    );
    return result.rows[0] ?? null;
  }

  return (
    (await getDatabase().get<ReminderRow>('SELECT * FROM task_reminders WHERE id = ?', [
      reminderId,
    ])) ?? null
  );
};

export async function listRemindersForTask(
  taskId: string,
  userId: string,
): Promise<TaskReminder[]> {
  const task = await fetchTaskForUser(taskId, userId);
  if (!task) return [];

  let rows: ReminderRow[] = [];
  if (isPostgreSQL()) {
    const result = await getPool().query<ReminderRow>(
      'SELECT * FROM task_reminders WHERE task_id = $1 AND user_id = $2 ORDER BY created_at ASC',
      [taskId, userId],
    );
    rows = result.rows;
  } else {
    rows = (await getDatabase().all(
      'SELECT * FROM task_reminders WHERE task_id = ? AND user_id = ? ORDER BY created_at ASC',
      [taskId, userId],
    )) as ReminderRow[];
  }

  return rows.map(rowToReminder).filter((r): r is TaskReminder => r !== null);
}

const insertReminder = async (
  taskId: string,
  userId: string,
  input: CreateTaskReminderInput,
  timezone: string,
  task: ReminderTaskRow,
): Promise<TaskReminder> => {
  const id = uuidv4();
  const now = new Date().toISOString();
  const { scheduleType, config } = scheduleToStorage(input);
  const schedule: TaskReminderSchedule =
    input.type === 'relative'
      ? { type: 'relative', offset: input.offset }
      : input.type === 'absolute'
        ? { type: 'absolute', scheduledAt: input.scheduledAt }
        : {
            type: 'recurring',
            time: input.time,
            frequency: input.frequency,
            weekday: input.weekday,
          };

  const triggerAt = computeTriggerAt(schedule, task, timezone);
  const status: ReminderStatus = triggerAt ? 'scheduled' : 'pending';

  if (isPostgreSQL()) {
    await getPool().query(
      `INSERT INTO task_reminders
       (id, task_id, user_id, channel, schedule_type, config, timezone, trigger_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, taskId, userId, input.channel, scheduleType, config, timezone, triggerAt, status, now, now],
    );
  } else {
    await getDatabase().run(
      `INSERT INTO task_reminders
       (id, task_id, user_id, channel, schedule_type, config, timezone, trigger_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, taskId, userId, input.channel, scheduleType, config, timezone, triggerAt, status, now, now],
    );
  }

  return {
    id,
    taskId,
    userId,
    channel: input.channel,
    schedule,
    status,
    triggerAt,
    timezone,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
  };
};

export async function createRemindersForTask(
  taskId: string,
  userId: string,
  inputs: CreateTaskReminderInput[],
): Promise<TaskReminder[]> {
  if (inputs.length === 0) return [];

  const task = await fetchTaskForUser(taskId, userId);
  if (!task) throw new Error('Task not found');

  const timezone = await getUserTimezone(userId);
  const created: TaskReminder[] = [];

  for (const input of inputs) {
    created.push(await insertReminder(taskId, userId, input, timezone, task));
  }

  return created;
}

export async function replaceRemindersForTask(
  taskId: string,
  userId: string,
  inputs: CreateTaskReminderInput[],
): Promise<TaskReminder[]> {
  const task = await fetchTaskForUser(taskId, userId);
  if (!task) throw new Error('Task not found');

  if (isPostgreSQL()) {
    await getPool().query('DELETE FROM task_reminders WHERE task_id = $1 AND user_id = $2', [
      taskId,
      userId,
    ]);
  } else {
    await getDatabase().run('DELETE FROM task_reminders WHERE task_id = ? AND user_id = ?', [
      taskId,
      userId,
    ]);
  }

  return createRemindersForTask(taskId, userId, inputs);
}

export async function deleteReminder(
  taskId: string,
  reminderId: string,
  userId: string,
): Promise<boolean> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      'DELETE FROM task_reminders WHERE id = $1 AND task_id = $2 AND user_id = $3 RETURNING id',
      [reminderId, taskId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  const existing = await getDatabase().get(
    'SELECT id FROM task_reminders WHERE id = ? AND task_id = ? AND user_id = ?',
    [reminderId, taskId, userId],
  );
  if (!existing) return false;

  await getDatabase().run(
    'DELETE FROM task_reminders WHERE id = ? AND task_id = ? AND user_id = ?',
    [reminderId, taskId, userId],
  );
  return true;
}

export async function rescheduleRemindersForTask(taskId: string): Promise<void> {
  const task = await fetchTaskById(taskId);
  if (!task) return;

  const timezone = await getUserTimezone(task.user_id);
  const now = new Date().toISOString();

  let rows: ReminderRow[] = [];
  if (isPostgreSQL()) {
    const result = await getPool().query<ReminderRow>(
      `SELECT * FROM task_reminders
       WHERE task_id = $1 AND status IN ('pending', 'scheduled')`,
      [taskId],
    );
    rows = result.rows;
  } else {
    rows = (await getDatabase().all(
      `SELECT * FROM task_reminders
       WHERE task_id = ? AND status IN ('pending', 'scheduled')`,
      [taskId],
    )) as ReminderRow[];
  }

  for (const row of rows) {
    const schedule = parseScheduleConfig(row.schedule_type, row.config);
    if (!schedule) continue;

    const triggerAt = computeTriggerAt(schedule, task, timezone);
    const status: ReminderStatus = task.completed
      ? 'cancelled'
      : triggerAt
        ? 'scheduled'
        : 'pending';

    if (isPostgreSQL()) {
      await getPool().query(
        'UPDATE task_reminders SET trigger_at = $1, status = $2, updated_at = $3 WHERE id = $4',
        [triggerAt, status, now, row.id],
      );
    } else {
      await getDatabase().run(
        'UPDATE task_reminders SET trigger_at = ?, status = ?, updated_at = ? WHERE id = ?',
        [triggerAt, status, now, row.id],
      );
    }
  }
}

export async function cancelPendingRemindersForTask(taskId: string): Promise<void> {
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE task_reminders
       SET status = 'cancelled', updated_at = $1
       WHERE task_id = $2 AND status IN ('pending', 'scheduled')`,
      [now, taskId],
    );
  } else {
    await getDatabase().run(
      `UPDATE task_reminders
       SET status = 'cancelled', updated_at = ?
       WHERE task_id = ? AND status IN ('pending', 'scheduled')`,
      [now, taskId],
    );
  }
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

const fetchUserDeliveryInfo = async (userId: string): Promise<UserDeliveryRow | null> => {
  if (isPostgreSQL()) {
    const result = await getPool().query<UserDeliveryRow>(
      'SELECT whatsapp_phone, whatsapp_verified, timezone FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0] ?? null;
  }

  return (
    (await getDatabase().get<UserDeliveryRow>(
      'SELECT whatsapp_phone, whatsapp_verified, timezone FROM users WHERE id = ?',
      [userId],
    )) ?? null
  );
};

/**
 * Builds the `{{2}}` variable for the "task_reminder" WhatsApp template — never empty.
 * No leading calendar emoji here: the approved template body already prefixes this
 * variable with "🗓️ Agendado para:", so adding one would show two calendar icons.
 */
const buildReminderScheduleLabel = (task: ReminderTaskRow): string => {
  const parts: string[] = [];

  const dueDate = normalizeDueDate(task.due_date);
  if (dueDate) {
    const [y, m, d] = dueDate.split('-');
    parts.push(`${d}/${m}/${y}`);
  }

  const time = sanitizeTimeString(task.time);
  if (time) parts.push(`⏰ ${time}`);

  return parts.length > 0 ? parts.join(' ') : 'Sem data definida';
};

const MONTH_NAMES_PT_BR = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** Natural-language pt-BR sentence spoken by the Twilio Voice call. */
const buildReminderVoiceMessage = (task: ReminderTaskRow): string => {
  const parts = [`Olá! Aqui é a Jarvi com um lembrete da sua tarefa: ${task.title}.`];

  const dueDate = normalizeDueDate(task.due_date);
  if (dueDate) {
    const [, m, d] = dueDate.split('-');
    parts.push(`Data prevista: dia ${Number(d)} de ${MONTH_NAMES_PT_BR[Number(m) - 1] ?? m}.`);
  }

  const time = sanitizeTimeString(task.time);
  if (time) {
    const [hh, mm] = time.split(':');
    const minutePart = Number(mm) > 0 ? ` e ${Number(mm)} minutos` : '';
    parts.push(`Horário: ${Number(hh)} horas${minutePart}.`);
  }

  parts.push('Abra o aplicativo Jarvi para ver mais detalhes.');
  return parts.join(' ');
};

/**
 * Resolves the spoken message for a reminder call. Called by the Twilio
 * Voice webhook once the call connects — looked up by `reminderId` alone
 * since the request is authenticated via Twilio's request signature.
 */
export async function getReminderCallMessage(reminderId: string): Promise<string | null> {
  const reminder = await fetchReminderRowById(reminderId);
  if (!reminder) return null;

  const task = await fetchTaskById(reminder.task_id);
  if (!task) return null;

  return buildReminderVoiceMessage(task);
}

const markReminderSent = async (
  reminderId: string,
  nextTriggerAt: string | null,
  nextStatus: ReminderStatus,
): Promise<void> => {
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE task_reminders
       SET status = $1, trigger_at = $2, sent_at = $3, updated_at = $4
       WHERE id = $5`,
      [nextStatus, nextTriggerAt, now, now, reminderId],
    );
  } else {
    await getDatabase().run(
      `UPDATE task_reminders
       SET status = ?, trigger_at = ?, sent_at = ?, updated_at = ?
       WHERE id = ?`,
      [nextStatus, nextTriggerAt, now, now, reminderId],
    );
  }
};

const markReminderSkipped = async (reminderId: string, reason: string): Promise<void> => {
  const now = new Date().toISOString();
  console.warn(`[reminderService] Skipped reminder ${reminderId}: ${reason}`);

  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE task_reminders SET status = 'skipped', updated_at = $1 WHERE id = $2`,
      [now, reminderId],
    );
  } else {
    await getDatabase().run(
      `UPDATE task_reminders SET status = 'skipped', updated_at = ? WHERE id = ?`,
      [now, reminderId],
    );
  }
};

const deliverReminder = async (row: ReminderRow, task: ReminderTaskRow): Promise<void> => {
  const schedule = parseScheduleConfig(row.schedule_type, row.config);
  if (!schedule) {
    await markReminderSkipped(row.id, 'invalid schedule config');
    return;
  }

  const user = await fetchUserDeliveryInfo(row.user_id);
  if (!user) {
    await markReminderSkipped(row.id, 'user not found');
    return;
  }

  if (!user.whatsapp_phone || !user.whatsapp_verified) {
    await markReminderSkipped(row.id, `${row.channel} channel requires a verified phone number`);
    return;
  }

  try {
    if (row.channel === 'call') {
      await initiateReminderCall(user.whatsapp_phone, row.id);
    } else {
      await sendReminderTemplateMessage(user.whatsapp_phone, task.title, buildReminderScheduleLabel(task));
    }
  } catch (error) {
    console.error(`[reminderService] Failed to deliver ${row.channel} reminder:`, {
      reminderId: row.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const timezone = user.timezone || row.timezone || FALLBACK_TIMEZONE;

  if (schedule.type === 'recurring') {
    const nextTriggerAt = computeRecurringTriggerAt(schedule, timezone);
    await markReminderSent(row.id, nextTriggerAt, nextTriggerAt ? 'scheduled' : 'sent');
    return;
  }

  await markReminderSent(row.id, null, 'sent');
};

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export async function processDueReminders(): Promise<{ processed: number; sent: number }> {
  const nowIso = new Date().toISOString();
  let dueRows: ReminderRow[] = [];

  if (isPostgreSQL()) {
    const result = await getPool().query<ReminderRow>(
      `SELECT r.*
       FROM task_reminders r
       INNER JOIN tasks t ON t.id = r.task_id
       WHERE r.status IN ('pending', 'scheduled')
         AND r.trigger_at IS NOT NULL
         AND r.trigger_at <= $1
         AND t.completed = FALSE`,
      [nowIso],
    );
    dueRows = result.rows;
  } else {
    dueRows = (await getDatabase().all(
      `SELECT r.*
       FROM task_reminders r
       INNER JOIN tasks t ON t.id = r.task_id
       WHERE r.status IN ('pending', 'scheduled')
         AND r.trigger_at IS NOT NULL
         AND r.trigger_at <= ?
         AND t.completed = 0`,
      [nowIso],
    )) as ReminderRow[];
  }

  let sent = 0;
  for (const row of dueRows) {
    const task = await fetchTaskById(row.task_id);
    if (!task || task.completed) {
      await cancelPendingRemindersForTask(row.task_id);
      continue;
    }

    await deliverReminder(row, task);
    sent += 1;
  }

  return { processed: dueRows.length, sent };
}

let scheduledTask: cron.ScheduledTask | null = null;

export function startReminderScheduler(): cron.ScheduledTask {
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule('* * * * *', () => {
    processDueReminders()
      .then(({ processed, sent }) => {
        if (processed > 0) {
          console.log(`[reminderService] Processed ${processed} reminder(s), sent ${sent}.`);
        }
      })
      .catch((error) => {
        console.error('[reminderService] Scheduler run failed:', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  return scheduledTask;
}

/** Accept drafts from the web UI (TaskReminderDraft[]). */
export function parseReminderDraftList(drafts: TaskReminderDraft[]): CreateTaskReminderInput[] {
  return parseReminderDrafts(drafts);
}
