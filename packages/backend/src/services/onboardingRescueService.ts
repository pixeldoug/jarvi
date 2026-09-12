/**
 * Onboarding rescue — proactive WhatsApp nudge for "ghost" accounts.
 *
 * A ghost is someone who confirmed the WhatsApp code (so the account exists)
 * but never reached the end of the wizard: `onboarding_completed_at` is null
 * and they have no tasks. Most of them stopped exactly at "criar as primeiras
 * tarefas", and almost none ever sent a message to the Jarvi number — so
 * without this job they never hear from Jarvi again.
 *
 * Rules (all deterministic, no model involved):
 *
 *   one send     FIRST_DELAY after the account was created (default 3h)
 *   quiet hours  only between QUIET_END..QUIET_START local time (default 09:00–20:59)
 *   scope        accounts created in the last MAX_ACCOUNT_AGE_DAYS (default 14):
 *                older accounts predate the wizard and were backfilled as done
 *
 * A second template/send was considered and dropped: same copy twice reads as
 * spam, and a distinct follow-up is a second Meta conversation without proof
 * the first one was missed.
 *
 * Idempotency: `onboarding_rescue_deliveries` has UNIQUE (user_id, attempt).
 * A row is claimed BEFORE anything is sent, so overlapping ticks or a restart
 * cannot double-send. A failed send consumes the attempt (no retry storm on a
 * number Meta rejects).
 *
 * Completion is detected by the DB, not by this job: the moment the person
 * creates a task through WhatsApp, `markOnboardingCompletedViaWhatsapp`
 * stamps `onboarding_completed_at`, which removes them from the candidates.
 */
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { getDateTimeForTimezone } from './agent/core/time';
import { captureServer } from './posthogService';
import {
  ONBOARDING_RESCUE_BODY,
  resolveOnboardingRescueTransport,
  sendOnboardingRescueMessage,
} from './whatsappService';

const FALLBACK_TIMEZONE = 'America/Sao_Paulo';

const envNumber = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const RESCUE_MAX_ATTEMPTS = 1;
export const RESCUE_FIRST_DELAY_MINUTES = envNumber('ONBOARDING_RESCUE_FIRST_DELAY_MINUTES', 180);
export const RESCUE_MAX_ACCOUNT_AGE_DAYS = envNumber('ONBOARDING_RESCUE_MAX_ACCOUNT_AGE_DAYS', 14);
/** Local wall-clock window in which a nudge may go out: [start, end). */
export const RESCUE_QUIET_START_HOUR = envNumber('ONBOARDING_RESCUE_SEND_FROM_HOUR', 9);
export const RESCUE_QUIET_END_HOUR = envNumber('ONBOARDING_RESCUE_SEND_UNTIL_HOUR', 21);

// ---------------------------------------------------------------------------
// Pure decision (exported for the deterministic eval)
// ---------------------------------------------------------------------------

export interface RescueDecisionInput {
  /** `users.created_at` as ISO. */
  registeredAt: string;
  /** Attempts already claimed (sent or failed). */
  attemptsUsed: number;
  /** `created_at` of the latest claimed attempt, if any. */
  lastAttemptAt: string | null;
  /** Local "HH:MM" in the person's timezone. */
  localHourMinute: string;
  now: Date;
}

export type RescueDecision =
  | { kind: 'send'; attempt: number }
  | { kind: 'wait'; reason: 'too_early' | 'quiet_hours' }
  | { kind: 'done' };

const minutesSince = (iso: string, now: Date): number =>
  (now.getTime() - new Date(iso).getTime()) / 60_000;

export function isWithinSendWindow(
  localHourMinute: string,
  fromHour: number = RESCUE_QUIET_START_HOUR,
  untilHour: number = RESCUE_QUIET_END_HOUR,
): boolean {
  const hour = Number(localHourMinute.split(':')[0]);
  if (!Number.isFinite(hour)) return false;
  return hour >= fromHour && hour < untilHour;
}

export function decideRescueAttempt(
  input: RescueDecisionInput,
  options: {
    firstDelayMinutes?: number;
    maxAttempts?: number;
    sendFromHour?: number;
    sendUntilHour?: number;
  } = {},
): RescueDecision {
  const maxAttempts = options.maxAttempts ?? RESCUE_MAX_ATTEMPTS;
  if (input.attemptsUsed >= maxAttempts) return { kind: 'done' };

  const firstDelay = options.firstDelayMinutes ?? RESCUE_FIRST_DELAY_MINUTES;
  const elapsed = minutesSince(input.registeredAt, input.now);
  if (elapsed < firstDelay) return { kind: 'wait', reason: 'too_early' };

  if (!isWithinSendWindow(input.localHourMinute, options.sendFromHour, options.sendUntilHour)) {
    return { kind: 'wait', reason: 'quiet_hours' };
  }

  return { kind: 'send', attempt: input.attemptsUsed + 1 };
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

interface CandidateRow {
  id: string;
  email: string;
  timezone: string | null;
  whatsapp_phone: string;
  created_at: string | Date;
}

interface AttemptSummaryRow {
  attempts_used: number | string;
  last_attempt_at: string | Date | null;
}

const toIso = (value: string | Date): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

/**
 * Verified WhatsApp, wizard never finished, no tasks at all, recent account.
 * "No tasks" is what makes it a rescue and not noise: a person who already
 * created something through WhatsApp is being stamped as completed anyway.
 */
const fetchCandidates = async (now: Date): Promise<CandidateRow[]> => {
  const since = new Date(now.getTime() - RESCUE_MAX_ACCOUNT_AGE_DAYS * 86_400_000).toISOString();

  if (isPostgreSQL()) {
    const result = await getPool().query<CandidateRow>(
      `SELECT u.id, u.email, u.timezone, u.whatsapp_phone, u.created_at
       FROM users u
       WHERE u.whatsapp_verified = TRUE
         AND u.whatsapp_phone IS NOT NULL
         AND u.onboarding_completed_at IS NULL
         AND u.created_at >= $1
         AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.user_id = u.id)`,
      [since],
    );
    return result.rows;
  }

  return (await getDatabase().all(
    `SELECT u.id, u.email, u.timezone, u.whatsapp_phone, u.created_at
     FROM users u
     WHERE u.whatsapp_verified = 1
       AND u.whatsapp_phone IS NOT NULL
       AND u.onboarding_completed_at IS NULL
       AND u.created_at >= ?
       AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.user_id = u.id)`,
    [since],
  )) as CandidateRow[];
};

const fetchAttemptSummary = async (
  userId: string,
): Promise<{ attemptsUsed: number; lastAttemptAt: string | null }> => {
  const sql = `SELECT COUNT(*) AS attempts_used, MAX(created_at) AS last_attempt_at
               FROM onboarding_rescue_deliveries WHERE user_id = `;
  const row = isPostgreSQL()
    ? (await getPool().query<AttemptSummaryRow>(`${sql}$1`, [userId])).rows[0]
    : await getDatabase().get<AttemptSummaryRow>(`${sql}?`, [userId]);

  const attemptsUsed = Number(row?.attempts_used ?? 0);
  const lastAttemptAt = row?.last_attempt_at ? toIso(row.last_attempt_at) : null;
  return { attemptsUsed, lastAttemptAt };
};

/** Claims (user, attempt). Null when another tick already took it. */
const claimAttempt = async (userId: string, attempt: number, now: Date): Promise<string | null> => {
  const id = uuidv4();
  const nowIso = now.toISOString();

  if (isPostgreSQL()) {
    const result = await getPool().query(
      `INSERT INTO onboarding_rescue_deliveries (id, user_id, attempt, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'processing', $4, $5)
       ON CONFLICT (user_id, attempt) DO NOTHING
       RETURNING id`,
      [id, userId, attempt, nowIso, nowIso],
    );
    return (result.rowCount ?? 0) > 0 ? id : null;
  }

  const result = await getDatabase().run(
    `INSERT OR IGNORE INTO onboarding_rescue_deliveries (id, user_id, attempt, status, created_at, updated_at)
     VALUES (?, ?, ?, 'processing', ?, ?)`,
    [id, userId, attempt, nowIso, nowIso],
  );
  return (result.changes ?? 0) > 0 ? id : null;
};

const finalizeAttempt = async (
  id: string,
  status: 'sent' | 'failed',
  message: string | null,
  error: string | null,
): Promise<void> => {
  const nowIso = new Date().toISOString();
  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE onboarding_rescue_deliveries
       SET status = $1, message = $2, error = $3, updated_at = $4 WHERE id = $5`,
      [status, message, error, nowIso, id],
    );
    return;
  }
  await getDatabase().run(
    `UPDATE onboarding_rescue_deliveries
     SET status = ?, message = ?, error = ?, updated_at = ? WHERE id = ?`,
    [status, message, error, nowIso, id],
  );
};

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

type RescueSender = (to: string) => Promise<void>;
let rescueSender: RescueSender = sendOnboardingRescueMessage;
let transportResolver: () => ReturnType<typeof resolveOnboardingRescueTransport> =
  resolveOnboardingRescueTransport;

/** Swap the WhatsApp transport for deterministic tests. `null` restores it. */
export function __setOnboardingRescueSenderForTesting(sender: RescueSender | null): void {
  rescueSender = sender ?? sendOnboardingRescueMessage;
  transportResolver = sender ? () => 'template' : resolveOnboardingRescueTransport;
}

const describeError = (error: unknown): string => {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  const parts: string[] = [];
  if (code != null) parts.push(`code=${String(code)}`);
  if (status != null) parts.push(`status=${String(status)}`);
  parts.push(error instanceof Error ? error.message : String(error));
  return parts.join(' ').slice(0, 500);
};

export interface RescueRunStats {
  candidates: number;
  sent: number;
  failed: number;
  waiting: number;
  done: number;
}

let warnedNoTransport = false;

/**
 * One scheduler tick. `now` is injectable so the eval can drive the clock.
 * Returns null when no transport is configured (nothing evaluated).
 */
export async function processOnboardingRescues(now: Date = new Date()): Promise<RescueRunStats | null> {
  if (!transportResolver()) {
    if (!warnedNoTransport) {
      warnedNoTransport = true;
      console.warn(
        '[onboardingRescue] TWILIO_ONBOARDING_RESCUE_CONTENT_SID is not set; rescue nudges are disabled.',
      );
    }
    return null;
  }

  const stats: RescueRunStats = { candidates: 0, sent: 0, failed: 0, waiting: 0, done: 0 };
  const candidates = await fetchCandidates(now);
  stats.candidates = candidates.length;

  for (const user of candidates) {
    const timezone = user.timezone || FALLBACK_TIMEZONE;
    const { hourMinute } = getDateTimeForTimezone(timezone, now);
    const { attemptsUsed, lastAttemptAt } = await fetchAttemptSummary(user.id);

    const decision = decideRescueAttempt({
      registeredAt: toIso(user.created_at),
      attemptsUsed,
      lastAttemptAt,
      localHourMinute: hourMinute,
      now,
    });

    if (decision.kind === 'done') {
      stats.done += 1;
      continue;
    }
    if (decision.kind === 'wait') {
      stats.waiting += 1;
      continue;
    }

    const deliveryId = await claimAttempt(user.id, decision.attempt, now);
    if (!deliveryId) continue; // another tick got here first

    try {
      await rescueSender(user.whatsapp_phone);
    } catch (error) {
      const detail = describeError(error);
      console.error(
        `[onboardingRescue] Attempt ${decision.attempt} failed for user ${user.id}: ${detail}`,
      );
      await finalizeAttempt(deliveryId, 'failed', ONBOARDING_RESCUE_BODY, detail);
      stats.failed += 1;
      continue;
    }

    await finalizeAttempt(deliveryId, 'sent', ONBOARDING_RESCUE_BODY, null);
    captureServer(user.email, 'onboarding_rescue_sent', {
      attempt: decision.attempt,
      channel: 'whatsapp',
      source: 'backend',
    });
    stats.sent += 1;
  }

  return stats;
}

let scheduledTask: cron.ScheduledTask | null = null;

export function startOnboardingRescueScheduler(): cron.ScheduledTask {
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule('*/5 * * * *', () => {
    processOnboardingRescues()
      .then((stats) => {
        if (stats && (stats.sent > 0 || stats.failed > 0)) {
          console.log(
            `[onboardingRescue] ${stats.candidates} candidate(s): sent ${stats.sent}, ` +
              `failed ${stats.failed}, waiting ${stats.waiting}, done ${stats.done}.`,
          );
        }
      })
      .catch((error) => {
        console.error('[onboardingRescue] Scheduler run failed:', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  return scheduledTask;
}
