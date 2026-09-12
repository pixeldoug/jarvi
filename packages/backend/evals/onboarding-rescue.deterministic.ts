/**
 * Deterministic eval — Onboarding rescue (WhatsApp nudge for ghost accounts).
 *
 * Drives `processOnboardingRescues` against an in-memory SQLite with a
 * recorded WhatsApp transport and an injected clock, asserting who gets a
 * nudge, when, how many times, and that creating a task through WhatsApp
 * stamps onboarding completion and stops the nudges.
 *
 * Run:
 *   npm run eval:onboarding-rescue     (from packages/backend)
 *
 * Exits 1 on any failing assertion so CI can gate on it.
 */

import 'dotenv/config';

import { setupEvalDatabase, todayIso } from './helpers';

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

const SP = 'America/Sao_Paulo';
const HOUR = 60 * 60 * 1000;

async function main(): Promise<void> {
  await setupEvalDatabase();
  const { getDatabase } = await import('../src/database');
  const db = getDatabase();

  const {
    processOnboardingRescues,
    __setOnboardingRescueSenderForTesting,
    decideRescueAttempt,
    isWithinSendWindow,
  } = await import('../src/services/onboardingRescueService');
  const { markOnboardingCompletedViaWhatsapp } = await import(
    '../src/services/onboardingCompletionService'
  );
  const { localWallClockToUtcIso } = await import('../src/services/reminderService');

  const sent: string[] = [];
  let failNextSend = false;
  __setOnboardingRescueSenderForTesting(async (to) => {
    if (failNextSend) {
      failNextSend = false;
      throw Object.assign(new Error('Twilio rejected'), { code: 63016 });
    }
    sent.push(to);
  });

  const atLocal = (hhmm: string, dayOffset = 0): Date => {
    const [y, m, d] = todayIso(SP).split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d + dayOffset));
    const iso = localWallClockToUtcIso(base.toISOString().slice(0, 10), hhmm, SP);
    if (!iso) throw new Error(`bad wall clock ${hhmm}`);
    return new Date(iso);
  };

  interface SeedUser {
    id: string;
    phone?: string | null;
    verified?: boolean;
    createdAt: Date;
    onboardingCompletedAt?: Date | null;
  }

  const phones = new Map<string, string>();
  let phoneSeq = 1;
  const phoneOf = (id: string): string => phones.get(id) ?? '';
  const seedUser = async (u: SeedUser): Promise<void> => {
    const phone = u.phone === undefined ? `+5511${String(phoneSeq++).padStart(8, '0')}` : u.phone;
    if (phone) phones.set(u.id, phone);
    await db.run(
      `INSERT OR REPLACE INTO users
         (id, email, name, password, auth_provider, has_password, email_verified, timezone, preferred_name,
          whatsapp_phone, whatsapp_verified, onboarding_completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        u.id,
        `${u.id}@jarvi.test`,
        'Você',
        'x',
        'whatsapp',
        0,
        0,
        SP,
        'Você',
        phone,
        u.verified === false ? 0 : 1,
        u.onboardingCompletedAt ? u.onboardingCompletedAt.toISOString() : null,
        u.createdAt.toISOString(),
        u.createdAt.toISOString(),
      ],
    );
  };

  const deliveries = async (userId: string) =>
    (await db.all(
      'SELECT attempt, status FROM onboarding_rescue_deliveries WHERE user_id = ? ORDER BY attempt',
      [userId],
    )) as Array<{ attempt: number; status: string }>;

  const onboardingCompletedAt = async (userId: string) =>
    ((await db.get('SELECT onboarding_completed_at AS v FROM users WHERE id = ?', [userId])) as { v: string | null })
      .v;

  // -------------------------------------------------------------------------
  // Pure decision
  // -------------------------------------------------------------------------

  await testCase('decision: send window is [from, until) in local time', async () => {
    check(isWithinSendWindow('09:00', 9, 21), '09:00 is inside');
    check(isWithinSendWindow('20:59', 9, 21), '20:59 is inside');
    check(!isWithinSendWindow('21:00', 9, 21), '21:00 is outside');
    check(!isWithinSendWindow('08:59', 9, 21), '08:59 is outside');
  });

  await testCase('decision: first attempt waits for the delay, respects quiet hours, then sends', async () => {
    const now = new Date('2026-09-12T17:00:00Z');
    const opts = { firstDelayMinutes: 180 };
    const fresh = decideRescueAttempt(
      { registeredAt: new Date(now.getTime() - 1 * HOUR).toISOString(), attemptsUsed: 0, lastAttemptAt: null, localHourMinute: '14:00', now },
      opts,
    );
    check(fresh.kind === 'wait' && fresh.reason === 'too_early', '1h after signup → too early', fresh);

    const night = decideRescueAttempt(
      { registeredAt: new Date(now.getTime() - 4 * HOUR).toISOString(), attemptsUsed: 0, lastAttemptAt: null, localHourMinute: '23:30', now },
      opts,
    );
    check(night.kind === 'wait' && night.reason === 'quiet_hours', '4h after signup at 23:30 → quiet hours', night);

    const due = decideRescueAttempt(
      { registeredAt: new Date(now.getTime() - 4 * HOUR).toISOString(), attemptsUsed: 0, lastAttemptAt: null, localHourMinute: '14:00', now },
      opts,
    );
    check(due.kind === 'send' && due.attempt === 1, '4h after signup at 14:00 → send attempt 1', due);
  });

  await testCase('decision: a single send is the cap — later ticks are done', async () => {
    const now = new Date('2026-09-13T17:00:00Z');
    const registeredAt = new Date(now.getTime() - 48 * HOUR).toISOString();

    const done = decideRescueAttempt({
      registeredAt,
      attemptsUsed: 1,
      lastAttemptAt: new Date(now.getTime() - 25 * HOUR).toISOString(),
      localHourMinute: '14:00',
      now,
    });
    check(done.kind === 'done', 'after attempt 1 → done even a day later', done);
  });

  // -------------------------------------------------------------------------
  // Scheduler against the DB
  // -------------------------------------------------------------------------

  const T0 = atLocal('14:00');

  await testCase('scheduler: only real ghosts are candidates', async () => {
    await seedUser({ id: 'ghost-1', createdAt: new Date(T0.getTime() - 4 * HOUR) });
    await seedUser({ id: 'fresh-1', createdAt: new Date(T0.getTime() - 1 * HOUR) });
    await seedUser({ id: 'done-1', createdAt: new Date(T0.getTime() - 4 * HOUR), onboardingCompletedAt: new Date(T0.getTime() - 3 * HOUR) });
    await seedUser({ id: 'unverified-1', createdAt: new Date(T0.getTime() - 4 * HOUR), verified: false });
    await seedUser({ id: 'nophone-1', createdAt: new Date(T0.getTime() - 4 * HOUR), phone: null });
    await seedUser({ id: 'old-1', createdAt: new Date(T0.getTime() - 30 * 24 * HOUR) });
    await seedUser({ id: 'hastask-1', createdAt: new Date(T0.getTime() - 4 * HOUR) });
    await db.run(
      `INSERT INTO tasks (id, user_id, title, completed, recurrence_type, created_at, updated_at)
       VALUES ('t-1', 'hastask-1', 'Comprar pão', 0, 'none', ?, ?)`,
      [T0.toISOString(), T0.toISOString()],
    );

    sent.length = 0;
    const stats = await processOnboardingRescues(T0);
    check(stats !== null, 'transport configured → tick ran');
    check(sent.length === 1, 'exactly one nudge went out', sent);
    check(sent[0] === phoneOf('ghost-1'), 'and it went to ghost-1', sent);
    check((await deliveries('ghost-1')).length === 1, 'ghost-1 has one delivery row');
    check((await deliveries('ghost-1'))[0]?.status === 'sent', 'delivery marked sent');
    check((await deliveries('fresh-1')).length === 0, 'fresh account (1h) not nudged yet');
    check((await deliveries('done-1')).length === 0, 'completed onboarding not nudged');
    check((await deliveries('unverified-1')).length === 0, 'unverified WhatsApp not nudged');
    check((await deliveries('old-1')).length === 0, 'account older than the window not nudged');
    check((await deliveries('hastask-1')).length === 0, 'account with a task not nudged');
  });

  await testCase('scheduler: a second tick never double-sends attempt 1', async () => {
    sent.length = 0;
    await processOnboardingRescues(new Date(T0.getTime() + 5 * 60 * 1000));
    check(sent.length === 0, 'no new message five minutes later', sent);
    check((await deliveries('ghost-1')).length === 1, 'still one delivery row');
  });

  await testCase('scheduler: fresh account becomes due once the delay passes', async () => {
    sent.length = 0;
    await processOnboardingRescues(new Date(T0.getTime() + 3 * HOUR)); // 17:00 local
    check(sent.length === 1, 'fresh-1 nudged at 17:00', sent);
    check((await deliveries('fresh-1')).length === 1, 'fresh-1 has a delivery row');
  });

  await testCase('scheduler: after the one send, later ticks never nudge again', async () => {
    sent.length = 0;
    await processOnboardingRescues(atLocal('23:00', 1));
    check(!sent.includes(phoneOf('ghost-1')), 'ghost-1 not nudged at 23:00', sent);

    sent.length = 0;
    await processOnboardingRescues(atLocal('10:00', 2));
    check(!sent.includes(phoneOf('ghost-1')), 'ghost-1 not nudged the next morning either', sent);
    check((await deliveries('ghost-1')).length === 1, 'still one delivery row');
  });

  await testCase('scheduler: a rejected send consumes the attempt instead of retrying forever', async () => {
    await seedUser({ id: 'reject-1', createdAt: new Date(T0.getTime() - 5 * HOUR) });
    failNextSend = true;
    sent.length = 0;
    await processOnboardingRescues(T0);
    const rows = await deliveries('reject-1');
    check(rows.length === 1 && rows[0]?.status === 'failed', 'attempt 1 recorded as failed', rows);
    const row = (await db.get('SELECT error FROM onboarding_rescue_deliveries WHERE user_id = ?', ['reject-1'])) as { error: string };
    check(row.error.includes('63016'), 'Twilio error code stored', row);

    sent.length = 0;
    await processOnboardingRescues(new Date(T0.getTime() + 60 * 1000));
    check((await deliveries('reject-1')).length === 1, 'not retried a minute later');
  });

  // -------------------------------------------------------------------------
  // Completion via WhatsApp
  // -------------------------------------------------------------------------

  await testCase('completion: creating the first task via WhatsApp stamps onboarding once and stops nudges', async () => {
    await seedUser({ id: 'rescued-1', createdAt: new Date(T0.getTime() - 4 * HOUR) });
    check((await onboardingCompletedAt('rescued-1')) == null, 'starts without onboarding_completed_at');

    const first = await markOnboardingCompletedViaWhatsapp({ userId: 'rescued-1', email: 'rescued-1@jarvi.test', now: T0 });
    check(first === true, 'first call flips the stamp');
    check((await onboardingCompletedAt('rescued-1')) === T0.toISOString(), 'stamp equals the task creation instant');

    const second = await markOnboardingCompletedViaWhatsapp({ userId: 'rescued-1', email: 'rescued-1@jarvi.test' });
    check(second === false, 'second call is a no-op');
    check((await onboardingCompletedAt('rescued-1')) === T0.toISOString(), 'stamp not overwritten');

    sent.length = 0;
    await processOnboardingRescues(T0);
    check(!sent.includes(phoneOf('rescued-1')), 'rescued account gets no nudge', sent);
    check((await deliveries('rescued-1')).length === 0, 'rescued account is no longer a candidate');
  });

  await testCase('completion: never touches an account that already finished the wizard', async () => {
    const before = await onboardingCompletedAt('done-1');
    const flipped = await markOnboardingCompletedViaWhatsapp({ userId: 'done-1', email: 'done-1@jarvi.test' });
    check(flipped === false, 'no flip');
    check((await onboardingCompletedAt('done-1')) === before, 'original completion preserved');
  });

  __setOnboardingRescueSenderForTesting(null);

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
