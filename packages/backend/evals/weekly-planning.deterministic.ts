/**
 * Deterministic eval — Planejamento Semanal (WhatsApp Sunday nudge).
 *
 * Drives `processDueWeeklyPlanning` against an in-memory SQLite with a
 * recorded WhatsApp transport and an injected clock, so every business rule
 * is asserted exactly: only on Sunday, at the configured local time, once per
 * week, never for people who opted out, late Sundays are skipped, leftover
 * FORCE_NOW cannot text again on Monday, and production ignores FORCE_NOW.
 *
 * Also covers the agent tool `update_notification_settings` end-to-end
 * (executor → service → settings row → backend confirmation sentence).
 *
 * Run:
 *   npm run eval:weekly-planning     (from packages/backend)
 *
 * Exits 1 on any failing assertion so CI can gate on it.
 */

import 'dotenv/config';

import { addDays, buildContext, nextWeekday, setupEvalDatabase, todayIso, WEEKDAY } from './helpers';
import type { AgentOperation, ChannelProfile } from '../src/services/agent/core/types';

// ---------------------------------------------------------------------------
// Tiny assertion harness (same shape as daily-summary.deterministic.ts)
// ---------------------------------------------------------------------------

let currentCase = '';
let failures = 0;
let passed = 0;

function check(condition: unknown, message: string, detail?: unknown): void {
  if (condition) {
    passed++;
    return;
  }
  failures++;
  console.error(`  ✗ [${currentCase}] ${message}`);
  if (detail !== undefined) console.error('    →', typeof detail === 'string' ? detail : JSON.stringify(detail));
}

async function testCase(name: string, fn: () => Promise<void>): Promise<void> {
  currentCase = name;
  const before = failures;
  try {
    await fn();
  } catch (err) {
    failures++;
    console.error(`  ✗ [${name}] threw:`, err);
  }
  console.log(`${failures === before ? '✓' : '✗'} ${name}`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SP = 'America/Sao_Paulo';
const TOKYO = 'Asia/Tokyo';

interface SeedUser {
  id: string;
  phone: string | null;
  verified?: boolean;
  timezone?: string;
  enabled?: boolean | null;
  sendTime?: string | null;
  name?: string | null;
  preferredName?: string | null;
}

interface SentMessage {
  to: string;
  firstName: string;
}

async function main(): Promise<void> {
  await setupEvalDatabase();
  const { getDatabase } = await import('../src/database');
  const db = getDatabase();

  const {
    processDueWeeklyPlanning,
    __setWeeklyPlanningSenderForTesting,
    parseWeeklyPlanningTime,
    isWeeklyPlanningDay,
    weekStartSunday,
    weeklyPlanningFirstName,
    buildWeeklyPlanningPreview,
    getWeeklyPlanningSettings,
    updateWeeklyPlanningSettings,
    DEFAULT_WEEKLY_PLANNING_TIME,
  } = await import('../src/services/weeklyPlanningService');
  const { getDailySummarySettings } = await import('../src/services/dailySummaryService');
  const { localWallClockToUtcIso } = await import('../src/services/reminderService');
  const { executeToolCall } = await import('../src/services/agent/core/tools');
  const { buildConfirmation, isWriteTool } = await import('../src/services/agent/core/confirmations');

  const TODAY = todayIso(SP);
  const SUNDAY = nextWeekday(TODAY, WEEKDAY.domingo);
  const MONDAY = addDays(SUNDAY, 1);
  const NEXT_SUNDAY = addDays(SUNDAY, 7);

  // Recorded WhatsApp transport.
  const sent: SentMessage[] = [];
  __setWeeklyPlanningSenderForTesting(async (to, firstName) => {
    sent.push({ to, firstName });
  });

  /** Instant at which the wall clock reads `hhmm` on `isoDate` in `tz`. */
  const atLocal = (isoDate: string, hhmm: string, tz: string): Date => {
    const iso = localWallClockToUtcIso(isoDate, hhmm, tz);
    if (!iso) throw new Error(`bad wall clock ${isoDate} ${hhmm} ${tz}`);
    return new Date(iso);
  };

  const seedUser = async (u: SeedUser): Promise<void> => {
    const now = new Date().toISOString();
    await db.run(
      `INSERT OR REPLACE INTO users
         (id, email, name, password, auth_provider, has_password, email_verified, timezone, preferred_name,
          whatsapp_phone, whatsapp_verified, weekly_planning_enabled, weekly_planning_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        u.id,
        `${u.id}@jarvi.test`,
        u.name === undefined ? 'Doug Silva' : u.name,
        'x',
        'eval',
        0,
        0,
        u.timezone ?? SP,
        u.preferredName === undefined ? null : u.preferredName,
        u.phone,
        u.verified === false ? 0 : 1,
        u.enabled === undefined ? 1 : u.enabled === null ? null : u.enabled ? 1 : 0,
        u.sendTime === undefined ? DEFAULT_WEEKLY_PLANNING_TIME : u.sendTime,
        now,
        now,
      ],
    );
  };

  const deliveriesFor = async (userId: string) =>
    (await db.all(
      'SELECT week_start, status, message, error FROM weekly_planning_deliveries WHERE user_id = ? ORDER BY created_at',
      [userId],
    )) as Array<{ week_start: string; status: string; message: string | null; error: string | null }>;

  /** Wipe everything the previous case created; keep the schema. */
  const reset = async () => {
    sent.length = 0;
    await db.run('DELETE FROM weekly_planning_deliveries');
    await db.run("DELETE FROM users WHERE id LIKE 'wp-%'");
  };

  // ── 0. Pure units ─────────────────────────────────────────────────────────
  await testCase('unit/parse + sunday + name + preview', async () => {
    check(parseWeeklyPlanningTime('19:00') === '19:00', '"19:00" kept');
    check(parseWeeklyPlanningTime('20h') === '20:00' && parseWeeklyPlanningTime('7h30') === '07:30', '"20h"/"7h30" accepted');
    check(parseWeeklyPlanningTime('24:00') === null && parseWeeklyPlanningTime('domingo') === null, 'garbage rejected');

    check(isWeeklyPlanningDay(SUNDAY) === true, 'next Sunday is a planning day', SUNDAY);
    check(isWeeklyPlanningDay(MONDAY) === false, 'Monday is not', MONDAY);
    check(isWeeklyPlanningDay(addDays(SUNDAY, 6)) === false, 'Saturday is not');
    check(isWeeklyPlanningDay(NEXT_SUNDAY) === true, 'the Sunday after is');
    check(weekStartSunday(SUNDAY) === SUNDAY, 'Sunday is its own week start');
    check(weekStartSunday(MONDAY) === SUNDAY, 'Monday maps back to that Sunday');
    check(weekStartSunday(addDays(SUNDAY, 6)) === SUNDAY, 'Saturday still belongs to that Sunday');
    check(weekStartSunday(NEXT_SUNDAY) === NEXT_SUNDAY, 'the next Sunday opens a new week');

    check(weeklyPlanningFirstName('Douglas Henrique') === 'Douglas', 'first name only');
    check(weeklyPlanningFirstName('  ') === 'tudo bem' && weeklyPlanningFirstName(null) === 'tudo bem', 'empty → "tudo bem"');
    check(weeklyPlanningFirstName('Ana\nMaria') === 'Ana', 'newline never reaches the variable');

    const preview = buildWeeklyPlanningPreview('Douglas');
    check(preview.startsWith('Olá, Douglas! 💜'), 'preview mirrors the approved template', preview);
    check(preview.includes('3 coisas') && preview.includes('lembretes'), 'preview carries the ask and the opt-out hint');
  });

  // ── 1. Sunday at 19:00 → one message with the first name ──────────────────
  await testCase('sunday: one message at 19:00 with {{1}} = first name', async () => {
    await reset();
    await seedUser({ id: 'wp-u1', phone: '+5511999990001', name: 'Douglas Henrique' });

    const stats = await processDueWeeklyPlanning(atLocal(SUNDAY, '19:00', SP));
    check(stats.sent === 1 && sent.length === 1, 'exactly one message sent', { stats, sent });
    check(sent[0]?.to === '+5511999990001', 'sent to the linked phone', sent[0]);
    check(sent[0]?.firstName === 'Douglas', '{{1}} is the first name', sent[0]);
    const rows = await deliveriesFor('wp-u1');
    check(rows.length === 1 && rows[0].status === 'sent' && rows[0].week_start === SUNDAY, 'delivery recorded for this Sunday', rows);
    check(rows[0]?.message?.startsWith('Olá, Douglas! 💜') === true, 'stored message reads like the template', rows[0]?.message);
  });

  // ── 2. Preferred name wins; empty name falls back ─────────────────────────
  await testCase('name: preferred_name wins, blank name → "tudo bem"', async () => {
    await reset();
    await seedUser({ id: 'wp-u2', phone: '+5511999990002', name: 'Maria Souza', preferredName: 'Mari' });
    await seedUser({ id: 'wp-u2b', phone: '+5511999990012', name: '', preferredName: null });

    await processDueWeeklyPlanning(atLocal(SUNDAY, '19:00', SP));
    const mari = sent.find((s) => s.to === '+5511999990002');
    const blank = sent.find((s) => s.to === '+5511999990012');
    check(mari?.firstName === 'Mari', 'preferred name used', mari);
    check(blank?.firstName === 'tudo bem', 'blank name falls back', blank);
  });

  // ── 3. Not Sunday → nothing, no row ───────────────────────────────────────
  await testCase('weekday: nothing on Monday..Saturday even past 19:00', async () => {
    await reset();
    await seedUser({ id: 'wp-u3', phone: '+5511999990003' });

    for (let i = 1; i <= 6; i += 1) {
      await processDueWeeklyPlanning(atLocal(addDays(SUNDAY, i), '19:00', SP));
      await processDueWeeklyPlanning(atLocal(addDays(SUNDAY, i), '20:30', SP));
    }
    check(sent.length === 0, 'no message during the week', sent);
    check((await deliveriesFor('wp-u3')).length === 0, 'no delivery row claimed during the week');
  });

  // ── 3b. FORCE_NOW (staging smoke) ─────────────────────────────────────────
  await testCase('force-now: WEEKLY_PLANNING_FORCE_NOW sends even on Monday afternoon', async () => {
    await reset();
    await seedUser({ id: 'wp-force', phone: '+5511999990099' });
    const previous = process.env.WEEKLY_PLANNING_FORCE_NOW;
    process.env.WEEKLY_PLANNING_FORCE_NOW = 'true';
    try {
      const stats = await processDueWeeklyPlanning(atLocal(MONDAY, '15:00', SP));
      check(stats.sent === 1 && sent.length === 1, 'force-now sends off-schedule', { stats, sent });
      check((await deliveriesFor('wp-force'))[0]?.week_start === SUNDAY, 'claims the week\'s Sunday, not Monday');
      await processDueWeeklyPlanning(atLocal(MONDAY, '15:01', SP));
      check(sent.length === 1, 'force-now still idempotent for the same day', sent.length);
    } finally {
      if (previous === undefined) delete process.env.WEEKLY_PLANNING_FORCE_NOW;
      else process.env.WEEKLY_PLANNING_FORCE_NOW = previous;
    }
  });

  await testCase('force-now leftover: Sunday already sent → Monday does not send again', async () => {
    await reset();
    await seedUser({ id: 'wp-force-left', phone: '+5511999990088' });
    await processDueWeeklyPlanning(atLocal(SUNDAY, '19:00', SP));
    check(sent.length === 1, 'Sunday send landed', sent.length);

    const previous = process.env.WEEKLY_PLANNING_FORCE_NOW;
    process.env.WEEKLY_PLANNING_FORCE_NOW = 'true';
    try {
      await processDueWeeklyPlanning(atLocal(MONDAY, '00:00', SP));
      await processDueWeeklyPlanning(atLocal(MONDAY, '08:00', SP));
      check(sent.length === 1, 'leftover FORCE_NOW must not text again on Monday', sent.length);
      check((await deliveriesFor('wp-force-left')).length === 1, 'still one row for that Sunday');
    } finally {
      if (previous === undefined) delete process.env.WEEKLY_PLANNING_FORCE_NOW;
      else process.env.WEEKLY_PLANNING_FORCE_NOW = previous;
    }
  });

  await testCase('force-now: ignored in production even on Monday', async () => {
    await reset();
    await seedUser({ id: 'wp-force-prod', phone: '+5511999990077' });
    const previousFlag = process.env.WEEKLY_PLANNING_FORCE_NOW;
    const previousEnv = process.env.NODE_ENV;
    process.env.WEEKLY_PLANNING_FORCE_NOW = 'true';
    process.env.NODE_ENV = 'production';
    try {
      const stats = await processDueWeeklyPlanning(atLocal(MONDAY, '00:00', SP));
      check(stats.sent === 0 && sent.length === 0, 'production ignores FORCE_NOW', { stats, sent });
      check((await deliveriesFor('wp-force-prod')).length === 0, 'no row claimed in production off-Sunday');
    } finally {
      if (previousFlag === undefined) delete process.env.WEEKLY_PLANNING_FORCE_NOW;
      else process.env.WEEKLY_PLANNING_FORCE_NOW = previousFlag;
      if (previousEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnv;
    }
  });

  // ── 4. Before the hour → not yet ──────────────────────────────────────────
  await testCase('not-yet: Sunday before 19:00 sends nothing and claims nothing', async () => {
    await reset();
    await seedUser({ id: 'wp-u4', phone: '+5511999990004' });

    await processDueWeeklyPlanning(atLocal(SUNDAY, '08:00', SP));
    await processDueWeeklyPlanning(atLocal(SUNDAY, '18:59', SP));
    check(sent.length === 0, 'nothing before 19:00', sent);
    check((await deliveriesFor('wp-u4')).length === 0, 'no row before the hour');
    await processDueWeeklyPlanning(atLocal(SUNDAY, '19:00', SP));
    check(sent.length === 1, 'sent at 19:00', sent);
  });

  // ── 5. Idempotency ────────────────────────────────────────────────────────
  await testCase('idempotency: repeated + concurrent ticks send once per Sunday', async () => {
    await reset();
    await seedUser({ id: 'wp-u5', phone: '+5511999990005' });

    await processDueWeeklyPlanning(atLocal(SUNDAY, '19:00', SP));
    await processDueWeeklyPlanning(atLocal(SUNDAY, '19:01', SP));
    await processDueWeeklyPlanning(atLocal(SUNDAY, '20:30', SP));
    await Promise.all([
      processDueWeeklyPlanning(atLocal(SUNDAY, '21:00', SP)),
      processDueWeeklyPlanning(atLocal(SUNDAY, '21:00', SP)),
    ]);
    check(sent.length === 1, 'exactly one message across five ticks', sent.length);
    const rows = await deliveriesFor('wp-u5');
    check(rows.length === 1, 'single delivery row (UNIQUE user+week)', rows);

    // Next Sunday is a fresh week.
    await processDueWeeklyPlanning(atLocal(NEXT_SUNDAY, '19:00', SP));
    check(sent.length === 2, 'next Sunday sends again', sent.length);
    check((await deliveriesFor('wp-u5')).map((r) => r.week_start).join(',') === `${SUNDAY},${NEXT_SUNDAY}`, 'one row per Sunday');
  });

  // ── 6. Late ───────────────────────────────────────────────────────────────
  await testCase('late: within 180 min still sends; past it → skipped_late', async () => {
    await reset();
    await seedUser({ id: 'wp-u6', phone: '+5511999990006' });
    // 21:59 is 179 min past 19:00 — still inside the window (evening deploy).
    const stats = await processDueWeeklyPlanning(atLocal(SUNDAY, '21:59', SP));
    check(stats.sent === 1 && sent.length === 1, 'late but inside the window still sends', { stats, sent });

    await reset();
    await seedUser({ id: 'wp-u6b', phone: '+5511999990016' });
    const late = await processDueWeeklyPlanning(atLocal(SUNDAY, '22:01', SP));
    check(sent.length === 0 && late.skippedLate === 1, 'past the window → not sent', { late, sent });
    const rows = await deliveriesFor('wp-u6b');
    check(rows[0]?.status === 'skipped_late' && /past 19:00/.test(rows[0]?.error ?? ''), 'late Sunday recorded so it is not retried', rows);
    // ...and it stays skipped for the rest of that Sunday.
    await processDueWeeklyPlanning(atLocal(SUNDAY, '23:00', SP));
    check(sent.length === 0 && (await deliveriesFor('wp-u6b')).length === 1, 'no retry the same Sunday');
  });

  // ── 7. Opt-out / eligibility ──────────────────────────────────────────────
  await testCase('opt-out: disabled, unverified and phoneless users never receive', async () => {
    await reset();
    await seedUser({ id: 'wp-u7', phone: '+5511999990007', enabled: false });
    await seedUser({ id: 'wp-u7b', phone: '+5511999990017', verified: false });
    await seedUser({ id: 'wp-u7c', phone: null });

    const stats = await processDueWeeklyPlanning(atLocal(SUNDAY, '19:00', SP));
    check(sent.length === 0 && stats.evaluated === 0, 'nobody evaluated', { stats, sent });
    check((await deliveriesFor('wp-u7')).length === 0, 'disabled user has no row');

    // NULL column (legacy row) is treated as ON — the feature is opt-out.
    await seedUser({ id: 'wp-u7d', phone: '+5511999990027', enabled: null });
    await processDueWeeklyPlanning(atLocal(SUNDAY, '19:00', SP));
    check(sent.length === 1 && sent[0].to === '+5511999990027', 'NULL preference defaults to enabled', sent);
  });

  // ── 8. Custom time ────────────────────────────────────────────────────────
  await testCase('custom-time: sends at the configured hour, settings round-trip', async () => {
    await reset();
    await seedUser({ id: 'wp-u8', phone: '+5511999990008', sendTime: '20:30' });

    await processDueWeeklyPlanning(atLocal(SUNDAY, '19:00', SP));
    await processDueWeeklyPlanning(atLocal(SUNDAY, '20:29', SP));
    check(sent.length === 0 && (await deliveriesFor('wp-u8')).length === 0, 'nothing before 20:30', sent);
    await processDueWeeklyPlanning(atLocal(SUNDAY, '20:30', SP));
    check(sent.length === 1, 'sent at 20:30', sent);

    const before = await getWeeklyPlanningSettings('wp-u8');
    check(before?.enabled === true && before.sendTime === '20:30' && before.timezone === SP, 'settings read back', before);
    const after = await updateWeeklyPlanningSettings('wp-u8', { sendTime: '7h15', enabled: false });
    check(after?.sendTime === '07:15' && after.enabled === false, 'settings updated + normalized', after);
    check(await getWeeklyPlanningSettings('wp-missing') === null, 'unknown user → null');
  });

  // ── 9. Timezone ───────────────────────────────────────────────────────────
  await testCase('timezone: Sunday 19:00 is evaluated in each person\'s own zone', async () => {
    await reset();
    await seedUser({ id: 'wp-u9-tokyo', phone: '+8190000000009', timezone: TOKYO });
    await seedUser({ id: 'wp-u9-sp', phone: '+5511999990009', timezone: SP });

    // Sunday 19:00 in Tokyo is Sunday 07:00 in São Paulo → only Tokyo fires.
    await processDueWeeklyPlanning(atLocal(SUNDAY, '19:00', TOKYO));
    check(sent.length === 1 && sent[0].to === '+8190000000009', 'Tokyo user receives at Tokyo 19:00', sent);
    // Sunday 19:00 in SP is Monday 07:00 in Tokyo → Tokyo must not fire again.
    await processDueWeeklyPlanning(atLocal(SUNDAY, '19:00', SP));
    check(sent.length === 2 && sent[1].to === '+5511999990009', 'SP user receives at SP 19:00, Tokyo not twice', sent.map((s) => s.to));
    check((await deliveriesFor('wp-u9-tokyo')).length === 1 && (await deliveriesFor('wp-u9-sp')).length === 1, 'one row each');
  });

  // ── 10. Transport failure ─────────────────────────────────────────────────
  await testCase('failure: transport error recorded as failed, not retried this week', async () => {
    await reset();
    await seedUser({ id: 'wp-u10', phone: '+5511999990010' });
    __setWeeklyPlanningSenderForTesting(async () => {
      const err = new Error('Twilio 63016 marketing cap') as Error & { code: number };
      err.code = 63016;
      throw err;
    });

    const stats = await processDueWeeklyPlanning(atLocal(SUNDAY, '19:00', SP));
    check(stats.failed === 1 && stats.sent === 0, 'counted as failed', stats);
    const rows = await deliveriesFor('wp-u10');
    check(rows[0]?.status === 'failed' && /code=63016/.test(rows[0]?.error ?? ''), 'failure detail stored', rows);

    __setWeeklyPlanningSenderForTesting(async (to, firstName) => {
      sent.push({ to, firstName });
    });
    await processDueWeeklyPlanning(atLocal(SUNDAY, '19:05', SP));
    check(sent.length === 0, 'no retry the same Sunday after a failure', sent);
  });

  // ── 11. Agent tool: update_notification_settings ──────────────────────────
  await testCase('agent-tool: opt-out / time change / re-enable via update_notification_settings', async () => {
    await reset();
    await seedUser({ id: 'wp-agent', phone: '+5511999990011', name: 'Doug Silva' });
    const ctx = { ...buildContext(), userId: 'wp-agent' };
    const whatsapp = { id: 'whatsapp', outputFormat: 'plain' } as ChannelProfile;
    const web = { id: 'web', outputFormat: 'markdown' } as ChannelProfile;

    const asOp = (tool: string, args: Record<string, unknown>, r: Awaited<ReturnType<typeof executeToolCall>>): AgentOperation => ({
      tool,
      kind: isWriteTool(tool) ? 'write' : 'read',
      args,
      success: r.success,
      entity: r.entity,
      persisted: r.changes,
      iteration: 0,
    });

    check(isWriteTool('update_notification_settings'), 'tool counts as a write (backend owns the confirmation)');

    // "não quero mais o lembrete de domingo"
    const off = await executeToolCall('update_notification_settings', { notification: 'weekly_planning', enabled: false }, ctx, whatsapp);
    check(off.success === true && off.changes?.enabled === false, 'opt-out persisted', off);
    check((await getWeeklyPlanningSettings('wp-agent'))?.enabled === false, 'settings row reflects opt-out');
    const offLine = buildConfirmation([asOp('update_notification_settings', { notification: 'weekly_planning', enabled: false }, off)], whatsapp);
    check(offLine === 'Pronto, desliguei o Planejamento semanal. Se quiser voltar a receber, é só me falar.', 'backend confirmation for opt-out', offLine);

    // Scheduler honours the opt-out.
    await processDueWeeklyPlanning(atLocal(SUNDAY, '19:00', SP));
    check(sent.length === 0, 'no Sunday message after opting out via the agent', sent);

    // "manda o planejamento às 20h" — time change also re-enables.
    const time = await executeToolCall('update_notification_settings', { notification: 'weekly_planning', time: '20h' }, ctx, web);
    check(time.success === true && time.changes?.time === '20:00' && time.changes?.enabled === true, 'time normalized and re-enabled', time);
    const timeLine = buildConfirmation([asOp('update_notification_settings', { notification: 'weekly_planning', time: '20h' }, time)], web);
    check(timeLine === 'Pronto, o Planejamento semanal agora chega aos domingos às 20h.', 'backend confirmation for time change', timeLine);
    await processDueWeeklyPlanning(atLocal(SUNDAY, '19:30', SP));
    check(sent.length === 0, 'not yet at 19:30 after moving to 20:00', sent);
    await processDueWeeklyPlanning(atLocal(SUNDAY, '20:00', SP));
    check(sent.length === 1, 'sent at the new 20:00', sent);

    // "volta a mandar o resumo" — daily summary through the same tool.
    const daily = await executeToolCall('update_notification_settings', { notification: 'daily_summary', enabled: false }, ctx, whatsapp);
    check(daily.success === true && (await getDailySummarySettings('wp-agent'))?.enabled === false, 'daily summary opt-out via the same tool', daily);
    const dailyOn = await executeToolCall('update_notification_settings', { notification: 'daily_summary', enabled: true }, ctx, whatsapp);
    const onLine = buildConfirmation([asOp('update_notification_settings', { notification: 'daily_summary', enabled: true }, dailyOn)], whatsapp);
    check(onLine === 'Pronto, o Resumo do dia está ligado de novo.', 'backend confirmation for re-enable', onLine);
    const dailyTime = await executeToolCall('update_notification_settings', { notification: 'daily_summary', time: '07:30' }, ctx, whatsapp);
    const dailyTimeLine = buildConfirmation([asOp('update_notification_settings', { notification: 'daily_summary', time: '07:30' }, dailyTime)], whatsapp);
    check(dailyTimeLine === 'Pronto, o Resumo do dia agora chega todo dia às 7h30.', 'daily time label', dailyTimeLine);

    // Validation.
    const badKind = await executeToolCall('update_notification_settings', { notification: 'reminders', enabled: false }, ctx, whatsapp);
    check(badKind.success === false && badKind.error_code === 'invalid_arguments', 'unknown notification rejected', badKind);
    const badTime = await executeToolCall('update_notification_settings', { notification: 'weekly_planning', time: 'de noite' }, ctx, whatsapp);
    check(badTime.success === false && badTime.error_code === 'invalid_arguments', 'unparseable time rejected', badTime);
    const nothing = await executeToolCall('update_notification_settings', { notification: 'weekly_planning' }, ctx, whatsapp);
    check(nothing.success === false, 'no change requested → rejected', nothing);
    check((await getWeeklyPlanningSettings('wp-agent'))?.sendTime === '20:00', 'rejected calls never touch the row');
  });

  __setWeeklyPlanningSenderForTesting(null);

  console.log(`\n[weekly-planning] ${passed} assertions passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[weekly-planning] fatal error:', err);
  process.exit(1);
});
