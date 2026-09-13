/**
 * Planejamento Semanal — proactive WhatsApp nudge every Sunday evening.
 *
 * Once a week, on Sunday at the time the person configured (default 19:00 in
 * their own timezone), sends the approved `sunday_reminder` template
 * asking for the 3 things they need to solve by Friday. There is no task
 * selection: the message is the same for everyone (only the first name
 * changes) and goes out even when the person has an empty list — the whole
 * point is to get them talking to the agent.
 *
 * Structure mirrors dailySummaryService: everything that decides *whether* to
 * send is deterministic and lives here. No model is involved.
 *
 * Idempotency: `weekly_planning_deliveries` has UNIQUE (user_id, week_start),
 * where `week_start` is the ISO date of the local Sunday. A row is claimed
 * BEFORE anything is sent, so two overlapping ticks (or a restart) can never
 * produce a second message for the same Sunday.
 *
 * Template category is **Marketing** on Meta's side (see whatsappService), so
 * deliveries may be throttled by Meta's marketing caps or suppressed for
 * people who opted out of marketing at the WhatsApp level. Failures are
 * recorded per week and never retried within the same week.
 */
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { getDateTimeForTimezone, getWeekdayNamePt } from './agent/core/time';
import { classifySummaryMoment, parseDailySummaryTime } from './dailySummaryService';
import { sendWeeklyPlanningMessage } from './whatsappService';

const FALLBACK_TIMEZONE = 'America/Sao_Paulo';
export const DEFAULT_WEEKLY_PLANNING_TIME = '19:00';

/** 0 = domingo. Kept as a named constant so the eval reads well. */
export const WEEKLY_PLANNING_WEEKDAY = 0;
const WEEKLY_PLANNING_WEEKDAY_PT = 'domingo';

/**
 * How late the message may still go out (server restart, evening deploy).
 * More lenient than the daily summary (60 min): a Sunday planning nudge at
 * 21:30 is still useful, and a deploy landing after 19:00 must not lose the
 * whole week. Past this the Sunday is recorded as `skipped_late`.
 */
const MAX_DELAY_MINUTES = Number(process.env.WEEKLY_PLANNING_MAX_DELAY_MINUTES || 180);

/**
 * Staging smoke-test kill switch. When `true`/`1`, the next tick treats every
 * eligible user as due — skips the Sunday check and the send-time window.
 * Still claims `weekly_planning_deliveries` for today's local date, so a
 * restart cannot double-send. Never set this on production.
 */
const isForceNow = (): boolean => {
  const raw = (process.env.WEEKLY_PLANNING_FORCE_NOW ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1';
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeeklyPlanningSettings {
  enabled: boolean;
  sendTime: string;
  timezone: string;
}

export type WeeklyPlanningDeliveryStatus = 'processing' | 'sent' | 'failed' | 'skipped_late';

interface CandidateUserRow {
  id: string;
  name: string | null;
  preferred_name: string | null;
  timezone: string | null;
  whatsapp_phone: string | null;
  weekly_planning_time: string | null;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for the deterministic eval)
// ---------------------------------------------------------------------------

/** Same accepted formats as the daily summary ("19:00", "19h", "19h30"). */
export const parseWeeklyPlanningTime = parseDailySummaryTime;

/** Variables may not contain newlines/tabs or Meta rejects the send. */
const sanitizeVariable = (value: string): string => value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

/** First name for {{1}}; empty/whitespace names fall back to "tudo bem". */
export function weeklyPlanningFirstName(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0] ?? '';
  return sanitizeVariable(first).slice(0, 40) || 'tudo bem';
}

/** True when the local ISO date is a Sunday. */
export function isWeeklyPlanningDay(isoDate: string): boolean {
  return getWeekdayNamePt(isoDate) === WEEKLY_PLANNING_WEEKDAY_PT;
}

/**
 * Human-readable rendering of the approved template — stored in the delivery
 * row so `weekly_planning_deliveries.message` reads like what was received.
 */
export function buildWeeklyPlanningPreview(firstName: string): string {
  return [
    `Oi, ${firstName}! 💜`,
    '',
    'Dominguinho, amanhã começa uma nova semana. 💪',
    '',
    'Me conta 3 coisas que você precisa resolver até sexta. Pode ser áudio ou texto, do seu jeito.',
    '',
    'Eu organizo tudo com data e te lembro na hora certa.',
    '',
    'ℹ️ Não quer mais receber esse lembrete aos domingos? É só me falar.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Settings (used by /api/users/weekly-planning and the agent tool)
// ---------------------------------------------------------------------------

interface SettingsRow {
  weekly_planning_enabled: boolean | number | null;
  weekly_planning_time: string | null;
  timezone: string | null;
}

const rowToSettings = (row: SettingsRow | undefined | null): WeeklyPlanningSettings => ({
  // NULL (row predates the column and the DB did not backfill) means ON —
  // the feature is opt-out.
  enabled: row?.weekly_planning_enabled == null ? true : Boolean(row.weekly_planning_enabled),
  sendTime: parseWeeklyPlanningTime(row?.weekly_planning_time) ?? DEFAULT_WEEKLY_PLANNING_TIME,
  timezone: row?.timezone || FALLBACK_TIMEZONE,
});

export async function getWeeklyPlanningSettings(userId: string): Promise<WeeklyPlanningSettings | null> {
  if (isPostgreSQL()) {
    const result = await getPool().query<SettingsRow>(
      'SELECT weekly_planning_enabled, weekly_planning_time, timezone FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0] ? rowToSettings(result.rows[0]) : null;
  }

  const row = await getDatabase().get<SettingsRow>(
    'SELECT weekly_planning_enabled, weekly_planning_time, timezone FROM users WHERE id = ?',
    [userId],
  );
  return row ? rowToSettings(row) : null;
}

export async function updateWeeklyPlanningSettings(
  userId: string,
  patch: { enabled?: boolean; sendTime?: string },
): Promise<WeeklyPlanningSettings | null> {
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE users
       SET weekly_planning_enabled = COALESCE($1, weekly_planning_enabled),
           weekly_planning_time = COALESCE($2, weekly_planning_time),
           updated_at = $3
       WHERE id = $4`,
      [patch.enabled ?? null, patch.sendTime ?? null, now, userId],
    );
  } else {
    await getDatabase().run(
      `UPDATE users
       SET weekly_planning_enabled = COALESCE(?, weekly_planning_enabled),
           weekly_planning_time = COALESCE(?, weekly_planning_time),
           updated_at = ?
       WHERE id = ?`,
      [patch.enabled === undefined ? null : patch.enabled ? 1 : 0, patch.sendTime ?? null, now, userId],
    );
  }

  return getWeeklyPlanningSettings(userId);
}

// ---------------------------------------------------------------------------
// Data access for the scheduler
// ---------------------------------------------------------------------------

const fetchCandidateUsers = async (): Promise<CandidateUserRow[]> => {
  const columns = 'id, name, preferred_name, timezone, whatsapp_phone, weekly_planning_time';

  if (isPostgreSQL()) {
    const result = await getPool().query<CandidateUserRow>(
      `SELECT ${columns}
       FROM users
       WHERE COALESCE(weekly_planning_enabled, TRUE) = TRUE
         AND whatsapp_verified = TRUE
         AND whatsapp_phone IS NOT NULL`,
    );
    return result.rows;
  }

  return (await getDatabase().all(
    `SELECT ${columns}
     FROM users
     WHERE COALESCE(weekly_planning_enabled, 1) = 1
       AND whatsapp_verified = 1
       AND whatsapp_phone IS NOT NULL`,
  )) as CandidateUserRow[];
};

/**
 * Claims the (user, Sunday) slot. Returns null when a row already exists —
 * i.e. this week was already handled (sent, failed, skipped or in flight).
 */
const claimDelivery = async (userId: string, weekStart: string): Promise<string | null> => {
  const id = uuidv4();
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    const result = await getPool().query(
      `INSERT INTO weekly_planning_deliveries (id, user_id, week_start, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'processing', $4, $5)
       ON CONFLICT (user_id, week_start) DO NOTHING
       RETURNING id`,
      [id, userId, weekStart, now, now],
    );
    return (result.rowCount ?? 0) > 0 ? id : null;
  }

  const result = await getDatabase().run(
    `INSERT OR IGNORE INTO weekly_planning_deliveries (id, user_id, week_start, status, created_at, updated_at)
     VALUES (?, ?, ?, 'processing', ?, ?)`,
    [id, userId, weekStart, now, now],
  );
  return (result.changes ?? 0) > 0 ? id : null;
};

const finalizeDelivery = async (
  deliveryId: string,
  status: WeeklyPlanningDeliveryStatus,
  message: string | null,
  error: string | null,
): Promise<void> => {
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE weekly_planning_deliveries
       SET status = $1, message = $2, error = $3, updated_at = $4
       WHERE id = $5`,
      [status, message, error, now, deliveryId],
    );
  } else {
    await getDatabase().run(
      `UPDATE weekly_planning_deliveries
       SET status = ?, message = ?, error = ?, updated_at = ?
       WHERE id = ?`,
      [status, message, error, now, deliveryId],
    );
  }
};

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

type WeeklyPlanningSender = (to: string, firstName: string) => Promise<void>;
let weeklyPlanningSender: WeeklyPlanningSender = sendWeeklyPlanningMessage;

/** Swap the WhatsApp transport for deterministic tests. `null` restores it. */
export function __setWeeklyPlanningSenderForTesting(sender: WeeklyPlanningSender | null): void {
  weeklyPlanningSender = sender ?? sendWeeklyPlanningMessage;
}

const describeError = (error: unknown): string => {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  const parts: string[] = [];
  if (code !== undefined && code !== null) parts.push(`code=${String(code)}`);
  if (status !== undefined && status !== null) parts.push(`status=${String(status)}`);
  parts.push(error instanceof Error ? error.message : String(error));
  return parts.join(' ').slice(0, 500);
};

export interface WeeklyPlanningRunStats {
  evaluated: number;
  sent: number;
  failed: number;
  skippedLate: number;
}

/**
 * One scheduler tick. `now` is injectable so the eval can drive the clock.
 *
 * Per candidate (planning on + verified WhatsApp):
 *  1. local date/time in the person's zone;
 *  2. is it Sunday there? otherwise nothing to do;
 *  3. is the configured time reached (and not too far behind)?
 *  4. claim this Sunday's slot — bail if the week was already handled;
 *  5. send the template with the first name; record the outcome.
 */
export async function processDueWeeklyPlanning(now: Date = new Date()): Promise<WeeklyPlanningRunStats> {
  const stats: WeeklyPlanningRunStats = { evaluated: 0, sent: 0, failed: 0, skippedLate: 0 };
  const users = await fetchCandidateUsers();

  for (const user of users) {
    const timezone = user.timezone || FALLBACK_TIMEZONE;
    const sendTime = parseWeeklyPlanningTime(user.weekly_planning_time) ?? DEFAULT_WEEKLY_PLANNING_TIME;
    const { isoDate, hourMinute } = getDateTimeForTimezone(timezone, now);

    const forceNow = isForceNow();
    if (!forceNow && !isWeeklyPlanningDay(isoDate)) continue;

    const moment = forceNow ? 'due' : classifySummaryMoment(sendTime, hourMinute, MAX_DELAY_MINUTES);
    if (moment === 'not_yet') continue;

    const deliveryId = await claimDelivery(user.id, isoDate);
    if (!deliveryId) continue; // already handled this Sunday

    stats.evaluated += 1;

    if (moment === 'late') {
      await finalizeDelivery(deliveryId, 'skipped_late', null, `local time ${hourMinute} past ${sendTime} window`);
      stats.skippedLate += 1;
      continue;
    }

    const firstName = weeklyPlanningFirstName(user.preferred_name || user.name);
    const preview = buildWeeklyPlanningPreview(firstName);

    try {
      await weeklyPlanningSender(user.whatsapp_phone as string, firstName);
    } catch (error) {
      const detail = describeError(error);
      console.error(`[weeklyPlanning] Delivery failed for user ${user.id} (${isoDate}): ${detail}`);
      await finalizeDelivery(deliveryId, 'failed', preview, detail);
      stats.failed += 1;
      continue;
    }

    await finalizeDelivery(deliveryId, 'sent', preview, null);
    stats.sent += 1;
  }

  return stats;
}

let scheduledTask: cron.ScheduledTask | null = null;

export function startWeeklyPlanningScheduler(): cron.ScheduledTask {
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule('* * * * *', () => {
    processDueWeeklyPlanning()
      .then((stats) => {
        if (stats.evaluated > 0) {
          console.log(
            `[weeklyPlanning] Evaluated ${stats.evaluated} user(s): sent ${stats.sent}, ` +
              `failed ${stats.failed}, late ${stats.skippedLate}.`,
          );
        }
      })
      .catch((error) => {
        console.error('[weeklyPlanning] Scheduler run failed:', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  return scheduledTask;
}
