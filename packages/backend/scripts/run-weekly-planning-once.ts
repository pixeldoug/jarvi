/**
 * One-off: run a single Planejamento Semanal tick against the configured
 * DATABASE_URL, right now.
 *
 * Why this exists: the cron only fires while the backend is up. If the first
 * deploy with the scheduler lands after Sunday 19:00 (JAR-58 rescue), this
 * sends the same message the cron would have — same eligibility, same
 * idempotency (one row per user per Sunday), same MAX_DELAY window (default
 * 180 min, override with WEEKLY_PLANNING_MAX_DELAY_MINUTES).
 *
 *   npm run weekly-planning:run-once -- --dry-run   # who would receive, no send
 *   npm run weekly-planning:run-once                # send for real
 *
 * Run with the production env (DATABASE_URL, TWILIO_*). Safe to re-run: users
 * already claimed this Sunday are skipped.
 */
import 'dotenv/config';
import { getDatabase, getPool, initializeDatabase, isPostgreSQL } from '../src/database';
import { getDateTimeForTimezone } from '../src/services/agent/core/time';
import {
  DEFAULT_WEEKLY_PLANNING_TIME,
  isWeeklyPlanningDay,
  parseWeeklyPlanningTime,
  processDueWeeklyPlanning,
} from '../src/services/weeklyPlanningService';
import { classifySummaryMoment } from '../src/services/dailySummaryService';

interface CandidateRow {
  id: string;
  email: string;
  timezone: string | null;
  weekly_planning_time: string | null;
}

const MAX_DELAY = Number(process.env.WEEKLY_PLANNING_MAX_DELAY_MINUTES || 180);

async function listCandidates(): Promise<CandidateRow[]> {
  const columns = 'u.id, u.email, u.timezone, u.weekly_planning_time';
  if (isPostgreSQL()) {
    const result = await getPool().query<CandidateRow>(
      `SELECT ${columns}
       FROM users u
       WHERE COALESCE(u.weekly_planning_enabled, TRUE) = TRUE
         AND u.whatsapp_verified = TRUE
         AND u.whatsapp_phone IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM weekly_planning_deliveries d
           WHERE d.user_id = u.id AND d.week_start = $1
         )`,
      [getDateTimeForTimezone('America/Sao_Paulo').isoDate],
    );
    return result.rows;
  }
  return (await getDatabase().all(
    `SELECT ${columns}
     FROM users u
     WHERE COALESCE(u.weekly_planning_enabled, 1) = 1
       AND u.whatsapp_verified = 1
       AND u.whatsapp_phone IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM weekly_planning_deliveries d
         WHERE d.user_id = u.id AND d.week_start = ?
       )`,
    [getDateTimeForTimezone('America/Sao_Paulo').isoDate],
  )) as CandidateRow[];
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  await initializeDatabase();

  const now = new Date();
  const candidates = await listCandidates();
  const summary = { due: 0, not_yet: 0, late: 0, not_sunday: 0 };

  for (const c of candidates) {
    const tz = c.timezone || 'America/Sao_Paulo';
    const { isoDate, hourMinute } = getDateTimeForTimezone(tz, now);
    const sendTime = parseWeeklyPlanningTime(c.weekly_planning_time) ?? DEFAULT_WEEKLY_PLANNING_TIME;
    if (!isWeeklyPlanningDay(isoDate)) {
      summary.not_sunday += 1;
      continue;
    }
    const moment = classifySummaryMoment(sendTime, hourMinute, MAX_DELAY);
    summary[moment] += 1;
    if (dryRun) console.log(`  ${moment.padEnd(7)} ${c.email} (${tz} ${hourMinute}, envio ${sendTime})`);
  }

  console.log(
    `[weeklyPlanning:once] ${candidates.length} candidato(s) sem envio nesta semana — ` +
      `due ${summary.due}, not_yet ${summary.not_yet}, late ${summary.late}, fora de domingo ${summary.not_sunday}. ` +
      `MAX_DELAY=${MAX_DELAY}min.`,
  );

  if (dryRun) {
    console.log('[weeklyPlanning:once] --dry-run: nada enviado.');
    return;
  }

  const stats = await processDueWeeklyPlanning(now);
  console.log(
    `[weeklyPlanning:once] evaluated ${stats.evaluated}, sent ${stats.sent}, failed ${stats.failed}, late ${stats.skippedLate}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[weeklyPlanning:once] fatal:', err);
    process.exit(1);
  });
