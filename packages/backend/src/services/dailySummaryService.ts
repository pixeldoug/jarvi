/**
 * Resumo do Dia — proactive WhatsApp daily summary.
 *
 * Once a day, at the time the person configured (default 08:00 in their own
 * timezone), sends one WhatsApp message listing what matters today:
 *
 *   Hoje       → open tasks whose due_date is today
 *   Lembretes  → open tasks with a reminder firing today, due on another day
 *
 * Everything that decides *whether* and *what* to send is deterministic and
 * lives here — dates, eligibility, dedupe, idempotency, which approved Meta
 * template to use and what goes in each variable. No model is involved.
 *
 * Idempotency: `daily_summary_deliveries` has UNIQUE (user_id, summary_date).
 * A row is claimed BEFORE anything is sent, so two overlapping ticks (or a
 * restart) can never produce a second summary for the same local day. A day
 * with nothing relevant is also recorded (status `empty`), so a task created
 * later that morning does not trigger a late second evaluation.
 *
 * Independent from task reminders: turning the summary off never touches
 * `task_reminders`, and the reminder scheduler never reads these settings.
 */
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { getDateTimeForTimezone, getWeekdayNamePt } from './agent/core/time';
import { normalizeTaskDueDate } from './agent/core/tasks';
import { localWallClockToUtcIso } from './reminderService';
import { DAILY_SUMMARY_TEMPLATE_SIDS, sendDailySummaryMessage } from './whatsappService';
import { sanitizeTimeString } from '../utils/taskTime';

const FALLBACK_TIMEZONE = 'America/Sao_Paulo';
export const DEFAULT_DAILY_SUMMARY_TIME = '08:00';

/**
 * How late the summary may still go out (server restart, slow tick). Past this
 * the moment has gone — a "Bom dia" at 15:00 is worse than none — so the day
 * is recorded as `skipped_late` and nothing is sent.
 */
const MAX_DELAY_MINUTES = Number(process.env.DAILY_SUMMARY_MAX_DELAY_MINUTES || 60);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailySummarySettings {
  enabled: boolean;
  sendTime: string;
  timezone: string;
}

export interface DailySummaryItem {
  taskId: string;
  title: string;
  /** Plain YYYY-MM-DD or null. */
  dueDate: string | null;
  /** Plain HH:MM or null. */
  time: string | null;
}

export interface DailySummaryContent {
  /** Open tasks due today (a task with a reminder today AND due today lands here, once). */
  today: DailySummaryItem[];
  /** Open tasks with a reminder firing today but due on another day (or undated). */
  reminders: DailySummaryItem[];
}

export type DailySummaryDeliveryStatus =
  | 'processing'
  | 'sent'
  | 'empty'
  | 'failed'
  | 'skipped_late';

interface CandidateUserRow {
  id: string;
  name: string | null;
  preferred_name: string | null;
  timezone: string | null;
  whatsapp_phone: string | null;
  daily_summary_time: string | null;
}

interface TaskDueRow {
  id: string;
  title: string;
  due_date: string | Date | null;
  time: string | null;
}

interface ReminderTodayRow {
  task_id: string;
  title: string;
  due_date: string | Date | null;
  time: string | null;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for the deterministic eval)
// ---------------------------------------------------------------------------

/** Accepts "8:00", "08:00", "8h", "08:30" → "HH:MM"; null when invalid. */
export function parseDailySummaryTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2})|h(\d{2})?)?$/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? match[3] ?? '0');
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Due when the local clock is at/after `sendTime` and no more than
 * `maxDelayMinutes` past it. Returns 'due' | 'late' | 'not_yet'.
 */
export function classifySummaryMoment(
  sendTime: string,
  localHourMinute: string,
  maxDelayMinutes: number = MAX_DELAY_MINUTES,
): 'due' | 'late' | 'not_yet' {
  const diff = toMinutes(localHourMinute) - toMinutes(sendTime);
  if (diff < 0) return 'not_yet';
  if (diff > maxDelayMinutes) return 'late';
  return 'due';
}

const addDaysToIsoDate = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const daysBetween = (fromIso: string, toIso: string): number => {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
};

const compareItems = (a: DailySummaryItem, b: DailySummaryItem): number => {
  const dateCmp = (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99');
  if (dateCmp !== 0) return dateCmp;
  const timeCmp = (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
  if (timeCmp !== 0) return timeCmp;
  return a.title.localeCompare(b.title, 'pt-BR');
};

/**
 * Splits and dedupes: tasks due today go to `today`; reminder tasks go to
 * `reminders` unless they are already in `today` (or due today themselves).
 * Each task appears exactly once.
 */
export function selectDailySummaryItems(
  tasksDueToday: DailySummaryItem[],
  reminderTasks: DailySummaryItem[],
  todayIso: string,
): DailySummaryContent {
  const today = new Map<string, DailySummaryItem>();
  const reminders = new Map<string, DailySummaryItem>();

  for (const task of tasksDueToday) {
    if (task.dueDate === todayIso) today.set(task.taskId, task);
  }

  for (const task of reminderTasks) {
    if (today.has(task.taskId)) continue;
    if (task.dueDate === todayIso) {
      today.set(task.taskId, task);
      continue;
    }
    if (!reminders.has(task.taskId)) reminders.set(task.taskId, task);
  }

  return {
    today: [...today.values()].sort(compareItems),
    reminders: [...reminders.values()].sort(compareItems),
  };
}

const formatTimeLabel = (time: string | null): string | null => {
  const match = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}h${match[2]}`;
};

const formatDdMm = (isoDate: string): string => {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
};

/** "Vence amanhã" / "Vence quinta-feira" / "Vence 25/09" / "Venceu ontem" … */
export function formatReminderDueLabel(dueDate: string | null, todayIso: string): string | null {
  if (!dueDate) return null;
  const delta = daysBetween(todayIso, dueDate);
  if (delta === 0) return 'Vence hoje';
  if (delta === 1) return 'Vence amanhã';
  if (delta === -1) return 'Venceu ontem';
  const weekday = getWeekdayNamePt(dueDate);
  if (delta > 1 && delta <= 6 && weekday) return `Vence ${weekday}`;
  if (delta < -1 && delta >= -6 && weekday) return `Venceu ${weekday}`;
  return delta > 0 ? `Vence ${formatDdMm(dueDate)}` : `Venceu ${formatDdMm(dueDate)}`;
}

/** Item separator inside a template variable (Meta forbids line breaks). */
const ITEM_SEPARATOR = ' · ';

/**
 * WhatsApp caps a template body at 1024 chars; keep each list variable well
 * under that so a person with many tasks still gets the message.
 */
const MAX_LIST_VARIABLE_LENGTH = 320;

/** Variables may not contain newlines/tabs or Meta rejects the send. */
const sanitizeVariable = (value: string): string => value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

/** Joins labels with " · ", truncating to "… e mais N" past the length cap. */
const joinItems = (labels: string[]): string => {
  const kept: string[] = [];
  for (let i = 0; i < labels.length; i += 1) {
    const candidate = [...kept, labels[i]].join(ITEM_SEPARATOR);
    const remaining = labels.length - (i + 1);
    const suffix = remaining > 0 ? `${ITEM_SEPARATOR}e mais ${remaining}` : '';
    if (kept.length > 0 && candidate.length + suffix.length > MAX_LIST_VARIABLE_LENGTH) {
      const rest = labels.length - kept.length;
      return `${kept.join(ITEM_SEPARATOR)}${ITEM_SEPARATOR}e mais ${rest}`;
    }
    kept.push(labels[i]);
  }
  return kept.join(ITEM_SEPARATOR);
};

const todayItemLabel = (item: DailySummaryItem): string => {
  const time = formatTimeLabel(item.time);
  return sanitizeVariable(`${item.title}${time ? ` às ${time}` : ''}`);
};

const reminderItemLabel = (item: DailySummaryItem, todayIso: string): string => {
  const due = formatReminderDueLabel(item.dueDate, todayIso);
  return sanitizeVariable(`${item.title}${due ? ` (${due.charAt(0).toLowerCase()}${due.slice(1)})` : ''}`);
};

export type DailySummaryTemplateVariant = 'full' | 'today' | 'reminders';

export interface DailySummaryMessage {
  /** Which approved template to send. */
  variant: DailySummaryTemplateVariant;
  /** Twilio contentVariables ("1", "2", …), already sanitized. */
  variables: Record<string, string>;
  /** Human-readable rendering of the template — stored in the delivery row. */
  preview: string;
}

export interface DailySummaryMessageOptions {
  preferredName?: string | null;
  todayIso: string;
  /**
   * Whether the `daily_summary_reminders` template can be sent. When false
   * (default follows the SID table) a reminders-only day uses the `full`
   * template with an explicit "nada com vencimento hoje" Hoje line.
   */
  remindersTemplateAvailable?: boolean;
}

/** Hoje line used when falling back to the full template without tasks due today. */
export const NO_TASKS_DUE_TODAY_LABEL = 'nada com vencimento hoje';

const firstName = (name: string | null | undefined): string => {
  const first = name?.trim().split(/\s+/)[0] ?? '';
  return sanitizeVariable(first).slice(0, 40) || 'tudo bem';
};

/**
 * Deterministic template selection + variables. No model involved.
 * Returns null when there is nothing to say (caller must not send).
 *
 * The preview mirrors the approved template bodies so what is stored in
 * `daily_summary_deliveries.message` reads like what the person received.
 */
export function buildDailySummaryMessage(
  content: DailySummaryContent,
  options: DailySummaryMessageOptions,
): DailySummaryMessage | null {
  const total = content.today.length + content.reminders.length;
  if (total === 0) return null;

  const name = firstName(options.preferredName);
  const count = total === 1 ? '1 coisa' : `${total} coisas`;
  const todayList = joinItems(content.today.map(todayItemLabel));
  const reminderList = joinItems(content.reminders.map((item) => reminderItemLabel(item, options.todayIso)));
  const remindersTemplateAvailable =
    options.remindersTemplateAvailable ?? DAILY_SUMMARY_TEMPLATE_SIDS.reminders !== null;

  const header = `Bom dia, ${name}! ☀️`;
  const footer = 'Tenha um bom dia! 💜';

  const full = (todayLine: string): DailySummaryMessage => ({
    variant: 'full',
    variables: { '1': name, '2': count, '3': todayLine, '4': reminderList },
    preview: [header, '', `Você tem ${count} para ficar de olho hoje:`, '', `Hoje: ${todayLine}`, '', `Lembretes: ${reminderList}`, '', footer].join('\n'),
  });

  if (content.today.length > 0 && content.reminders.length > 0) return full(todayList);

  if (content.today.length > 0) {
    return {
      variant: 'today',
      variables: { '1': name, '2': count, '3': todayList },
      preview: [header, '', `Você tem ${count} para ficar de olho hoje:`, '', `Hoje: ${todayList}`, '', footer].join('\n'),
    };
  }

  if (!remindersTemplateAvailable) return full(NO_TASKS_DUE_TODAY_LABEL);

  return {
    variant: 'reminders',
    variables: { '1': name, '2': count, '3': reminderList },
    preview: [header, '', `Hoje você tem ${count} para se lembrar:`, '', reminderList, '', footer].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Settings (used by /api/users/daily-summary)
// ---------------------------------------------------------------------------

interface SettingsRow {
  daily_summary_enabled: boolean | number | null;
  daily_summary_time: string | null;
  timezone: string | null;
}

const rowToSettings = (row: SettingsRow | undefined | null): DailySummarySettings => ({
  // NULL (row predates the column and the DB did not backfill) means ON —
  // the feature is opt-out.
  enabled: row?.daily_summary_enabled == null ? true : Boolean(row.daily_summary_enabled),
  sendTime: parseDailySummaryTime(row?.daily_summary_time) ?? DEFAULT_DAILY_SUMMARY_TIME,
  timezone: row?.timezone || FALLBACK_TIMEZONE,
});

export async function getDailySummarySettings(userId: string): Promise<DailySummarySettings | null> {
  if (isPostgreSQL()) {
    const result = await getPool().query<SettingsRow>(
      'SELECT daily_summary_enabled, daily_summary_time, timezone FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0] ? rowToSettings(result.rows[0]) : null;
  }

  const row = await getDatabase().get<SettingsRow>(
    'SELECT daily_summary_enabled, daily_summary_time, timezone FROM users WHERE id = ?',
    [userId],
  );
  return row ? rowToSettings(row) : null;
}

export async function updateDailySummarySettings(
  userId: string,
  patch: { enabled?: boolean; sendTime?: string },
): Promise<DailySummarySettings | null> {
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE users
       SET daily_summary_enabled = COALESCE($1, daily_summary_enabled),
           daily_summary_time = COALESCE($2, daily_summary_time),
           updated_at = $3
       WHERE id = $4`,
      [patch.enabled ?? null, patch.sendTime ?? null, now, userId],
    );
  } else {
    await getDatabase().run(
      `UPDATE users
       SET daily_summary_enabled = COALESCE(?, daily_summary_enabled),
           daily_summary_time = COALESCE(?, daily_summary_time),
           updated_at = ?
       WHERE id = ?`,
      [patch.enabled === undefined ? null : patch.enabled ? 1 : 0, patch.sendTime ?? null, now, userId],
    );
  }

  return getDailySummarySettings(userId);
}

// ---------------------------------------------------------------------------
// Data access for the scheduler
// ---------------------------------------------------------------------------

const fetchCandidateUsers = async (): Promise<CandidateUserRow[]> => {
  const columns = 'id, name, preferred_name, timezone, whatsapp_phone, daily_summary_time';

  if (isPostgreSQL()) {
    const result = await getPool().query<CandidateUserRow>(
      `SELECT ${columns}
       FROM users
       WHERE COALESCE(daily_summary_enabled, TRUE) = TRUE
         AND whatsapp_verified = TRUE
         AND whatsapp_phone IS NOT NULL`,
    );
    return result.rows;
  }

  return (await getDatabase().all(
    `SELECT ${columns}
     FROM users
     WHERE COALESCE(daily_summary_enabled, 1) = 1
       AND whatsapp_verified = 1
       AND whatsapp_phone IS NOT NULL`,
  )) as CandidateUserRow[];
};

const toItem = (row: { id?: string; task_id?: string; title: string; due_date: string | Date | null; time: string | null }): DailySummaryItem => ({
  taskId: (row.task_id ?? row.id) as string,
  title: row.title,
  dueDate: normalizeTaskDueDate(row.due_date),
  time: sanitizeTimeString(row.time),
});

const fetchTasksDueToday = async (userId: string, todayIso: string): Promise<DailySummaryItem[]> => {
  const tomorrowIso = addDaysToIsoDate(todayIso, 1);
  let rows: TaskDueRow[];

  // `due_date` is a calendar date; bounding by [today, tomorrow) keeps both
  // plain 'YYYY-MM-DD' strings and 'YYYY-MM-DDT00:00…' values inside the day.
  if (isPostgreSQL()) {
    const result = await getPool().query<TaskDueRow>(
      `SELECT id, title, due_date, time
       FROM tasks
       WHERE user_id = $1 AND completed = FALSE
         AND due_date IS NOT NULL AND due_date >= $2 AND due_date < $3`,
      [userId, todayIso, tomorrowIso],
    );
    rows = result.rows;
  } else {
    rows = (await getDatabase().all(
      `SELECT id, title, due_date, time
       FROM tasks
       WHERE user_id = ? AND completed = 0
         AND due_date IS NOT NULL AND due_date >= ? AND due_date < ?`,
      [userId, todayIso, tomorrowIso],
    )) as TaskDueRow[];
  }

  return rows.map(toItem).filter((item) => item.dueDate === todayIso);
};

/**
 * Open tasks with a reminder that fires today in the person's zone: still
 * scheduled for later today, or already delivered earlier today (a one-shot
 * reminder loses its trigger_at once sent, so `sent_at` is the witness).
 * Cancelled/skipped/failed reminders are not "reminders for today".
 */
const fetchReminderTasksForToday = async (
  userId: string,
  todayIso: string,
  timezone: string,
): Promise<DailySummaryItem[]> => {
  const startUtc = localWallClockToUtcIso(todayIso, '00:00', timezone);
  const endUtc = localWallClockToUtcIso(addDaysToIsoDate(todayIso, 1), '00:00', timezone);
  if (!startUtc || !endUtc) return [];

  const where = (p: (n: number) => string, completedFalse: string) => `
    FROM task_reminders r
    INNER JOIN tasks t ON t.id = r.task_id
    WHERE r.user_id = ${p(1)}
      AND t.completed = ${completedFalse}
      AND (
        (r.status IN ('pending', 'scheduled') AND r.trigger_at IS NOT NULL AND r.trigger_at >= ${p(2)} AND r.trigger_at < ${p(3)})
        OR (r.status = 'sent' AND r.sent_at IS NOT NULL AND r.sent_at >= ${p(2)} AND r.sent_at < ${p(3)})
      )`;

  let rows: ReminderTodayRow[];
  if (isPostgreSQL()) {
    const result = await getPool().query<ReminderTodayRow>(
      `SELECT r.task_id, t.title, t.due_date, t.time ${where((n) => `$${n}`, 'FALSE')}`,
      [userId, startUtc, endUtc],
    );
    rows = result.rows;
  } else {
    rows = (await getDatabase().all(
      `SELECT r.task_id, t.title, t.due_date, t.time ${where(() => '?', '0')}`,
      [userId, startUtc, endUtc, startUtc, endUtc],
    )) as ReminderTodayRow[];
  }

  return rows.map(toItem);
};

/**
 * Claims the (user, day) slot. Returns false when a row already exists —
 * i.e. this day was already handled (sent, empty, failed or in flight).
 */
const claimDelivery = async (userId: string, summaryDate: string): Promise<string | null> => {
  const id = uuidv4();
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    const result = await getPool().query(
      `INSERT INTO daily_summary_deliveries (id, user_id, summary_date, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'processing', $4, $5)
       ON CONFLICT (user_id, summary_date) DO NOTHING
       RETURNING id`,
      [id, userId, summaryDate, now, now],
    );
    return (result.rowCount ?? 0) > 0 ? id : null;
  }

  const result = await getDatabase().run(
    `INSERT OR IGNORE INTO daily_summary_deliveries (id, user_id, summary_date, status, created_at, updated_at)
     VALUES (?, ?, ?, 'processing', ?, ?)`,
    [id, userId, summaryDate, now, now],
  );
  return (result.changes ?? 0) > 0 ? id : null;
};

const finalizeDelivery = async (
  deliveryId: string,
  status: DailySummaryDeliveryStatus,
  itemCount: number,
  message: string | null,
  error: string | null,
): Promise<void> => {
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE daily_summary_deliveries
       SET status = $1, item_count = $2, message = $3, error = $4, updated_at = $5
       WHERE id = $6`,
      [status, itemCount, message, error, now, deliveryId],
    );
  } else {
    await getDatabase().run(
      `UPDATE daily_summary_deliveries
       SET status = ?, item_count = ?, message = ?, error = ?, updated_at = ?
       WHERE id = ?`,
      [status, itemCount, message, error, now, deliveryId],
    );
  }
};

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

type DailySummarySender = (to: string, message: DailySummaryMessage) => Promise<void>;
let dailySummarySender: DailySummarySender = sendDailySummaryMessage;

/** Swap the WhatsApp transport for deterministic tests. `null` restores it. */
export function __setDailySummarySenderForTesting(sender: DailySummarySender | null): void {
  dailySummarySender = sender ?? sendDailySummaryMessage;
}

const describeError = (error: unknown): string => {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  const parts: string[] = [];
  if (code !== undefined && code !== null) parts.push(`code=${String(code)}`);
  if (status !== undefined && status !== null) parts.push(`status=${String(status)}`);
  parts.push(error instanceof Error ? error.message : String(error));
  return parts.join(' ').slice(0, 500);
};

export interface DailySummaryRunStats {
  evaluated: number;
  sent: number;
  empty: number;
  failed: number;
  skippedLate: number;
}

/**
 * One scheduler tick. `now` is injectable so the eval can drive the clock.
 *
 * Per candidate (summary on + verified WhatsApp):
 *  1. local date/time in the person's zone;
 *  2. is the configured time reached (and not too far behind)?
 *  3. claim today's slot — bail if the day was already handled;
 *  4. select + dedupe items (backend only);
 *  5. send if there is something to say; record the outcome.
 */
export async function processDueDailySummaries(now: Date = new Date()): Promise<DailySummaryRunStats> {
  const stats: DailySummaryRunStats = { evaluated: 0, sent: 0, empty: 0, failed: 0, skippedLate: 0 };
  const users = await fetchCandidateUsers();

  for (const user of users) {
    const timezone = user.timezone || FALLBACK_TIMEZONE;
    const sendTime = parseDailySummaryTime(user.daily_summary_time) ?? DEFAULT_DAILY_SUMMARY_TIME;
    const { isoDate, hourMinute } = getDateTimeForTimezone(timezone, now);

    const moment = classifySummaryMoment(sendTime, hourMinute);
    if (moment === 'not_yet') continue;

    const deliveryId = await claimDelivery(user.id, isoDate);
    if (!deliveryId) continue; // already handled today

    stats.evaluated += 1;

    if (moment === 'late') {
      await finalizeDelivery(deliveryId, 'skipped_late', 0, null, `local time ${hourMinute} past ${sendTime} window`);
      stats.skippedLate += 1;
      continue;
    }

    try {
      const [dueToday, reminderTasks] = await Promise.all([
        fetchTasksDueToday(user.id, isoDate),
        fetchReminderTasksForToday(user.id, isoDate, timezone),
      ]);
      const content = selectDailySummaryItems(dueToday, reminderTasks, isoDate);
      const itemCount = content.today.length + content.reminders.length;

      const message = buildDailySummaryMessage(content, {
        preferredName: user.preferred_name || user.name,
        todayIso: isoDate,
      });

      if (!message) {
        await finalizeDelivery(deliveryId, 'empty', 0, null, null);
        stats.empty += 1;
        continue;
      }

      try {
        await dailySummarySender(user.whatsapp_phone as string, message);
      } catch (error) {
        const detail = describeError(error);
        console.error(`[dailySummary] Delivery failed for user ${user.id} (${isoDate}): ${detail}`);
        await finalizeDelivery(deliveryId, 'failed', itemCount, message.preview, detail);
        stats.failed += 1;
        continue;
      }

      await finalizeDelivery(deliveryId, 'sent', itemCount, message.preview, null);
      stats.sent += 1;
    } catch (error) {
      // Selection/build failed: record it so the day is not re-evaluated.
      const detail = describeError(error);
      console.error(`[dailySummary] Failed to build summary for user ${user.id} (${isoDate}): ${detail}`);
      await finalizeDelivery(deliveryId, 'failed', 0, null, detail);
      stats.failed += 1;
    }
  }

  return stats;
}

let scheduledTask: cron.ScheduledTask | null = null;

export function startDailySummaryScheduler(): cron.ScheduledTask {
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule('* * * * *', () => {
    processDueDailySummaries()
      .then((stats) => {
        if (stats.evaluated > 0) {
          console.log(
            `[dailySummary] Evaluated ${stats.evaluated} user(s): sent ${stats.sent}, ` +
              `empty ${stats.empty}, failed ${stats.failed}, late ${stats.skippedLate}.`,
          );
        }
      })
      .catch((error) => {
        console.error('[dailySummary] Scheduler run failed:', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  return scheduledTask;
}
