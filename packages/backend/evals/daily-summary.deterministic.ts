/**
 * Deterministic eval — Resumo do Dia (WhatsApp daily summary).
 *
 * Drives `processDueDailySummaries` against an in-memory SQLite with a
 * recorded WhatsApp transport and an injected clock, so every business rule
 * is asserted exactly: who gets a message, when, with which items, and that
 * no second summary ever goes out for the same local day.
 *
 * Run:
 *   npm run eval:daily-summary     (from packages/backend)
 *
 * Exits 1 on any failing assertion so CI can gate on it.
 */

import 'dotenv/config';

import { addDays, setupEvalDatabase, todayIso } from './helpers';

// ---------------------------------------------------------------------------
// Tiny assertion harness (same shape as reliable-execution.deterministic.ts)
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
  preferredName?: string;
}

interface SentMessage {
  to: string;
  /** Which approved Meta template was selected. */
  variant: 'full' | 'today' | 'reminders';
  /** Twilio contentVariables as sent. */
  variables: Record<string, string>;
  /** Rendered preview (what the person reads). */
  body: string;
}

async function main(): Promise<void> {
  await setupEvalDatabase();
  const { getDatabase } = await import('../src/database');
  const db = getDatabase();

  const {
    processDueDailySummaries,
    __setDailySummarySenderForTesting,
    parseDailySummaryTime,
    classifySummaryMoment,
    formatReminderDueLabel,
    selectDailySummaryItems,
    buildDailySummaryMessage,
    NO_TASKS_DUE_TODAY_LABEL,
    getDailySummarySettings,
    updateDailySummarySettings,
  } = await import('../src/services/dailySummaryService');
  const {
    processDueReminders,
    localWallClockToUtcIso,
    __setReminderWhatsappSenderForTesting,
    resetReminderDeliveryBreaker,
  } = await import('../src/services/reminderService');

  const TODAY = todayIso(SP);

  // Recorded WhatsApp transport.
  const sent: SentMessage[] = [];
  __setDailySummarySenderForTesting(async (to, message) => {
    sent.push({ to, variant: message.variant, variables: message.variables, body: message.preview });
  });

  /** Instant at which the wall clock reads `hhmm` on `isoDate` in `tz`. */
  const atLocal = (isoDate: string, hhmm: string, tz: string): Date => {
    const iso = localWallClockToUtcIso(isoDate, hhmm, tz);
    if (!iso) throw new Error(`bad wall clock ${isoDate} ${hhmm} ${tz}`);
    return new Date(iso);
  };

  let taskSeq = 1;
  const seedUser = async (u: SeedUser): Promise<void> => {
    const now = new Date().toISOString();
    await db.run(
      `INSERT OR REPLACE INTO users
         (id, email, name, password, auth_provider, has_password, email_verified, timezone, preferred_name,
          whatsapp_phone, whatsapp_verified, daily_summary_enabled, daily_summary_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        u.id,
        `${u.id}@jarvi.test`,
        u.preferredName ?? 'Doug',
        'x',
        'eval',
        0,
        0,
        u.timezone ?? SP,
        u.preferredName ?? 'Doug',
        u.phone,
        u.verified === false ? 0 : 1,
        u.enabled === undefined ? 1 : u.enabled === null ? null : u.enabled ? 1 : 0,
        u.sendTime === undefined ? '08:00' : u.sendTime,
        now,
        now,
      ],
    );
  };

  const seedTask = async (
    userId: string,
    title: string,
    opts: { dueDate?: string | null; time?: string | null; completed?: boolean } = {},
  ): Promise<string> => {
    const id = `ds-task-${taskSeq++}`;
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO tasks (id, user_id, title, completed, due_date, time, recurrence_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'none', ?, ?)`,
      [id, userId, title, opts.completed ? 1 : 0, opts.dueDate ?? null, opts.time ?? null, now, now],
    );
    return id;
  };

  const seedReminder = async (
    userId: string,
    taskId: string,
    triggerAtIso: string | null,
    status: 'scheduled' | 'pending' | 'sent' | 'cancelled' = 'scheduled',
    sentAtIso: string | null = null,
  ): Promise<string> => {
    const id = `ds-rem-${taskSeq++}`;
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO task_reminders
         (id, task_id, user_id, channel, schedule_type, config, timezone, trigger_at, status, sent_at, created_at, updated_at)
       VALUES (?, ?, ?, 'whatsapp', 'relative', ?, ?, ?, ?, ?, ?, ?)`,
      [id, taskId, userId, JSON.stringify({ offset: { amount: 2, unit: 'days', direction: 'before' } }), SP, triggerAtIso, status, sentAtIso, now, now],
    );
    return id;
  };

  const deliveriesFor = async (userId: string) =>
    (await db.all(
      'SELECT summary_date, status, item_count, message FROM daily_summary_deliveries WHERE user_id = ? ORDER BY created_at',
      [userId],
    )) as Array<{ summary_date: string; status: string; item_count: number; message: string | null }>;

  /** Wipe everything the previous case created; keep the schema. */
  const reset = async () => {
    sent.length = 0;
    await db.run('DELETE FROM daily_summary_deliveries');
    await db.run('DELETE FROM task_reminders');
    await db.run('DELETE FROM tasks');
    await db.run("DELETE FROM users WHERE id LIKE 'ds-%'");
  };

  // ── 0. Pure units ─────────────────────────────────────────────────────────
  await testCase('unit/parse + moment + labels + dedupe', async () => {
    check(parseDailySummaryTime('8:00') === '08:00', '"8:00" normalizes');
    check(parseDailySummaryTime('08:30') === '08:30', '"08:30" kept');
    check(parseDailySummaryTime('7h') === '07:00' && parseDailySummaryTime('7h45') === '07:45', '"7h"/"7h45" accepted');
    check(parseDailySummaryTime('24:00') === null && parseDailySummaryTime('08:60') === null, 'out of range rejected');
    check(parseDailySummaryTime('amanhã') === null && parseDailySummaryTime(8) === null, 'garbage rejected');

    check(classifySummaryMoment('08:00', '07:59', 60) === 'not_yet', '07:59 not yet');
    check(classifySummaryMoment('08:00', '08:00', 60) === 'due', '08:00 due');
    check(classifySummaryMoment('08:00', '09:00', 60) === 'due', 'edge of window still due');
    check(classifySummaryMoment('08:00', '09:01', 60) === 'late', 'past the window is late');

    check(formatReminderDueLabel(addDays(TODAY, 1), TODAY) === 'Vence amanhã', 'tomorrow label');
    check(formatReminderDueLabel(addDays(TODAY, -1), TODAY) === 'Venceu ontem', 'yesterday label');
    const in3 = addDays(TODAY, 3);
    check(/^Vence (segunda|terça|quarta|quinta|sexta)-feira$|^Vence (sábado|domingo)$/.test(formatReminderDueLabel(in3, TODAY) ?? ''), 'weekday label within 6 days', formatReminderDueLabel(in3, TODAY));
    const far = addDays(TODAY, 20);
    check(formatReminderDueLabel(far, TODAY) === `Vence ${far.slice(8, 10)}/${far.slice(5, 7)}`, 'DD/MM beyond a week', formatReminderDueLabel(far, TODAY));
    check(formatReminderDueLabel(null, TODAY) === null, 'undated → no suffix');

    const content = selectDailySummaryItems(
      [
        { taskId: 'a', title: 'Enviar orçamento', dueDate: TODAY, time: null },
        { taskId: 'b', title: 'Pagar fornecedor', dueDate: TODAY, time: '14:00' },
      ],
      [
        { taskId: 'a', title: 'Enviar orçamento', dueDate: TODAY, time: null }, // also has a reminder today
        { taskId: 'c', title: 'Renovar seguro', dueDate: addDays(TODAY, 2), time: null },
        { taskId: 'c', title: 'Renovar seguro', dueDate: addDays(TODAY, 2), time: null }, // two reminders, one task
        { taskId: 'd', title: 'Outra de hoje', dueDate: TODAY, time: '09:00' }, // reminder for a task due today → Hoje
      ],
      TODAY,
    );
    check(content.today.map((i) => i.taskId).join(',') === 'd,b,a' || content.today.length === 3, 'three tasks under Hoje, each once', content.today);
    check(content.today.filter((i) => i.taskId === 'a').length === 1, 'task with reminder + due today appears once');
    check(content.reminders.length === 1 && content.reminders[0].taskId === 'c', 'one reminder item, deduped', content.reminders);

    const msg = buildDailySummaryMessage(content, { preferredName: 'Douglas Henrique', todayIso: TODAY });
    check(msg?.variant === 'full', 'both sections → daily_summary (full) template', msg);
    check(msg?.variables['1'] === 'Douglas', '{{1}} is the first name', msg?.variables);
    check(msg?.variables['2'] === '4 coisas', '{{2}} is "N coisas"', msg?.variables);
    check(msg?.variables['3'] === 'Outra de hoje às 09h00 · Pagar fornecedor às 14h00 · Enviar orçamento', '{{3}} today items, timed first, " · " separated', msg?.variables);
    check(/^Renovar seguro \(vence .+\)$/.test(msg?.variables['4'] ?? ''), '{{4}} reminder with lowercase due label', msg?.variables);
    check(Object.keys(msg?.variables ?? {}).join(',') === '1,2,3,4', 'full template gets exactly {{1}}..{{4}}', msg?.variables);
    check(Object.values(msg?.variables ?? {}).every((v) => !/[\r\n\t]/.test(v) && v.length > 0), 'no variable is empty or multi-line', msg?.variables);
    check(msg?.preview.startsWith('Bom dia, Douglas! ☀️'), 'preview mirrors the template', msg?.preview);

    // Reminders-only: dedicated template when available, otherwise the full
    // template with an explicit "nada com vencimento hoje" line.
    const remOnly = { today: [], reminders: content.reminders };
    const withTemplate = buildDailySummaryMessage(remOnly, { todayIso: TODAY, remindersTemplateAvailable: true });
    check(withTemplate?.variant === 'reminders' && Object.keys(withTemplate.variables).join(',') === '1,2,3', 'reminders template: {{1}} nome, {{2}} contagem, {{3}} lista', withTemplate);
    check(withTemplate?.variables['2'] === '1 coisa' && withTemplate.variables['3'].startsWith('Renovar seguro ('), 'reminders template variables', withTemplate?.variables);
    const fallback = buildDailySummaryMessage(remOnly, { todayIso: TODAY, remindersTemplateAvailable: false });
    check(fallback?.variant === 'full' && fallback.variables['3'] === NO_TASKS_DUE_TODAY_LABEL, 'fallback uses full template with "nada com vencimento hoje"', fallback);
    check(fallback?.variables['4'].startsWith('Renovar seguro ('), 'fallback keeps the reminders list in {{4}}', fallback?.variables);

    // Long titles: list variable is capped with "e mais N", never a blank.
    const many = Array.from({ length: 30 }, (_, i) => ({ taskId: `t${i}`, title: `Tarefa número ${i} com um título bem comprido`, dueDate: TODAY, time: null }));
    const capped = buildDailySummaryMessage({ today: many, reminders: [] }, { todayIso: TODAY });
    check((capped?.variables['3'].length ?? 999) <= 340 && /· e mais \d+$/.test(capped?.variables['3'] ?? ''), 'long lists truncated with "e mais N"', capped?.variables['3']);
    check(capped?.variables['2'] === '30 coisas', 'count still reflects all items', capped?.variables['2']);

    // Name fallbacks.
    check(buildDailySummaryMessage(content, { preferredName: null, todayIso: TODAY })?.variables['1'] === 'tudo bem', 'no name → "tudo bem"');
    check(buildDailySummaryMessage(content, { preferredName: 'Ana\nMaria', todayIso: TODAY })?.variables['1'] === 'Ana', 'newline in name never reaches the variable');

    check(buildDailySummaryMessage({ today: [], reminders: [] }, { todayIso: TODAY }) === null, 'empty content → null');
  });

  // ── 1. Task due today ─────────────────────────────────────────────────────
  await testCase('due-today: one message, task under Hoje', async () => {
    await reset();
    await seedUser({ id: 'ds-u1', phone: '+5511999990001' });
    await seedTask('ds-u1', 'Enviar orçamento', { dueDate: TODAY });
    await seedTask('ds-u1', 'Pagar fornecedor', { dueDate: TODAY, time: '14:00' });
    await seedTask('ds-u1', 'Semana que vem', { dueDate: addDays(TODAY, 7) }); // not today

    const stats = await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    check(stats.sent === 1 && sent.length === 1, 'exactly one message sent', { stats, sent });
    check(sent[0]?.to === '+5511999990001', 'sent to the linked phone', sent[0]);
    check(sent[0]?.variant === 'today', 'only Hoje → daily_summary_today template', sent[0]);
    check(sent[0]?.variables['2'] === '2 coisas', 'two items counted', sent[0]?.variables);
    check(sent[0]?.variables['3'] === 'Pagar fornecedor às 14h00 · Enviar orçamento', 'Hoje lists both (timed first, then untimed)', sent[0]?.variables);
    check(sent[0]?.variables['4'] === undefined && !sent[0]?.body.includes('Semana que vem'), 'no reminders variable, future task excluded', sent[0]);
    const rows = await deliveriesFor('ds-u1');
    check(rows.length === 1 && rows[0].status === 'sent' && rows[0].item_count === 2 && rows[0].summary_date === TODAY, 'delivery recorded as sent', rows);
  });

  // ── 2. Only a reminder for a future task ──────────────────────────────────
  await testCase('reminder-only: future task under Lembretes with due label', async () => {
    await reset();
    await seedUser({ id: 'ds-u2', phone: '+5511999990002' });
    const dueIn2 = addDays(TODAY, 2);
    const seguro = await seedTask('ds-u2', 'Renovar seguro', { dueDate: dueIn2 });
    // "2 dias antes" → fires today at 09:00 local (still scheduled at 08:00).
    await seedReminder('ds-u2', seguro, localWallClockToUtcIso(TODAY, '09:00', SP));
    // A reminder for tomorrow must NOT appear.
    const outro = await seedTask('ds-u2', 'Outro', { dueDate: addDays(TODAY, 5) });
    await seedReminder('ds-u2', outro, localWallClockToUtcIso(addDays(TODAY, 1), '09:00', SP));

    await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    check(sent.length === 1, 'one message', sent);
    const body = sent[0]?.body ?? '';
    check(sent[0]?.variant === 'reminders' && Object.keys(sent[0].variables).join(',') === '1,2,3', 'only Lembretes → daily_summary_reminders template', sent[0]);
    check(sent[0]?.variables['2'] === '1 coisa', 'singular count', sent[0]?.variables);
    const dueLabel = formatReminderDueLabel(dueIn2, TODAY) ?? '';
    check(sent[0]?.variables['3'] === `Renovar seguro (${dueLabel.charAt(0).toLowerCase()}${dueLabel.slice(1)})`, 'reminder item with weekday', sent[0]?.variables);
    check(!body.includes('Outro'), "tomorrow's reminder excluded", body);
  });

  // ── 3. Due today AND reminder today → once, under Hoje ────────────────────
  await testCase('dedupe: due today + reminder today appears once under Hoje', async () => {
    await reset();
    await seedUser({ id: 'ds-u3', phone: '+5511999990003' });
    const task = await seedTask('ds-u3', 'Enviar orçamento', { dueDate: TODAY, time: '10:00' });
    await seedReminder('ds-u3', task, localWallClockToUtcIso(TODAY, '09:00', SP));
    // Already-delivered reminder earlier today for a Thursday-ish task → Lembretes.
    const seguro = await seedTask('ds-u3', 'Renovar seguro', { dueDate: addDays(TODAY, 2) });
    await seedReminder('ds-u3', seguro, null, 'sent', localWallClockToUtcIso(TODAY, '07:30', SP));

    await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    const body = sent[0]?.body ?? '';
    check(sent.length === 1, 'one message', sent);
    check((body.match(/Enviar orçamento/g) ?? []).length === 1, 'task appears exactly once', body);
    check(sent[0]?.variant === 'full', 'both sections → full template', sent[0]);
    check(sent[0]?.variables['3'] === 'Enviar orçamento às 10h00', 'and it is under Hoje ({{3}})', sent[0]?.variables);
    check(sent[0]?.variables['4']?.startsWith('Renovar seguro ('), 'sent-earlier-today reminder still listed ({{4}})', sent[0]?.variables);
    check(sent[0]?.variables['2'] === '2 coisas', 'count is 2 (deduped)', sent[0]?.variables);
    const rows = await deliveriesFor('ds-u3');
    check(rows[0]?.item_count === 2, 'item_count deduped', rows);
  });

  // ── 4. Nothing relevant ───────────────────────────────────────────────────
  await testCase('empty: nothing relevant → no message, day recorded as empty', async () => {
    await reset();
    await seedUser({ id: 'ds-u4', phone: '+5511999990004' });
    await seedTask('ds-u4', 'Amanhã', { dueDate: addDays(TODAY, 1) });
    await seedTask('ds-u4', 'Sem data');
    const cancelled = await seedTask('ds-u4', 'Cancelado', { dueDate: addDays(TODAY, 3) });
    await seedReminder('ds-u4', cancelled, localWallClockToUtcIso(TODAY, '09:00', SP), 'cancelled');

    const stats = await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    check(sent.length === 0 && stats.sent === 0 && stats.empty === 1, 'nothing sent, counted as empty', { stats, sent });
    const rows = await deliveriesFor('ds-u4');
    check(rows.length === 1 && rows[0].status === 'empty' && rows[0].item_count === 0, 'empty day recorded', rows);
  });

  // ── 5. Completed tasks never appear ───────────────────────────────────────
  await testCase('completed: done tasks (due today or with reminder) are excluded', async () => {
    await reset();
    await seedUser({ id: 'ds-u5', phone: '+5511999990005' });
    await seedTask('ds-u5', 'Já feita', { dueDate: TODAY, completed: true });
    const done = await seedTask('ds-u5', 'Concluída com lembrete', { dueDate: addDays(TODAY, 2), completed: true });
    await seedReminder('ds-u5', done, localWallClockToUtcIso(TODAY, '09:00', SP));

    await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    check(sent.length === 0, 'no message when everything relevant is completed', sent);
    check((await deliveriesFor('ds-u5'))[0]?.status === 'empty', 'recorded as empty');

    // Mixed: one open, one done → only the open one shows.
    await reset();
    await seedUser({ id: 'ds-u5', phone: '+5511999990005' });
    await seedTask('ds-u5', 'Aberta', { dueDate: TODAY });
    await seedTask('ds-u5', 'Fechada', { dueDate: TODAY, completed: true });
    await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    check(sent.length === 1 && sent[0].variables['3'] === 'Aberta' && !sent[0].body.includes('Fechada'), 'only the open task listed', sent[0]?.variables);
    check(sent[0]?.variables['2'] === '1 coisa', 'count ignores the completed one', sent[0]?.variables);
  });

  // ── 6. Disabled ───────────────────────────────────────────────────────────
  await testCase('disabled: no message, no delivery row', async () => {
    await reset();
    await seedUser({ id: 'ds-u6', phone: '+5511999990006', enabled: false });
    await seedTask('ds-u6', 'Enviar orçamento', { dueDate: TODAY });

    const stats = await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    check(sent.length === 0 && stats.evaluated === 0, 'disabled user skipped entirely', { stats, sent });
    check((await deliveriesFor('ds-u6')).length === 0, 'no delivery row', await deliveriesFor('ds-u6'));

    // Unverified WhatsApp → also skipped (nowhere to send).
    await seedUser({ id: 'ds-u6b', phone: '+5511999990016', verified: false });
    await seedTask('ds-u6b', 'Enviar orçamento', { dueDate: TODAY });
    await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    check(sent.length === 0, 'unverified phone never receives', sent);

    // NULL column (legacy row) is treated as ON — the feature is opt-out.
    await seedUser({ id: 'ds-u6c', phone: '+5511999990026', enabled: null });
    await seedTask('ds-u6c', 'Legado', { dueDate: TODAY });
    await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    check(sent.length === 1 && sent[0].to === '+5511999990026', 'NULL preference defaults to enabled', sent);
  });

  // ── 7. Custom time ────────────────────────────────────────────────────────
  await testCase('custom-time: sends at the configured hour, not before', async () => {
    await reset();
    await seedUser({ id: 'ds-u7', phone: '+5511999990007', sendTime: '10:30' });
    await seedTask('ds-u7', 'Enviar orçamento', { dueDate: TODAY });

    await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    check(sent.length === 0, 'nothing at 08:00', sent);
    await processDueDailySummaries(atLocal(TODAY, '10:29', SP));
    check(sent.length === 0, 'nothing at 10:29', sent);
    check((await deliveriesFor('ds-u7')).length === 0, 'no row claimed before the hour');
    await processDueDailySummaries(atLocal(TODAY, '10:30', SP));
    check(sent.length === 1, 'sent at 10:30', sent);
    check((await deliveriesFor('ds-u7'))[0]?.status === 'sent', 'recorded');

    // Settings API layer: invalid time rejected, valid time normalized.
    const before = await getDailySummarySettings('ds-u7');
    check(before?.enabled === true && before.sendTime === '10:30' && before.timezone === SP, 'settings read back', before);
    const after = await updateDailySummarySettings('ds-u7', { sendTime: '7:15', enabled: false });
    check(after?.sendTime === '07:15' && after.enabled === false, 'settings updated + normalized', after);
  });

  // ── 8. Timezone ───────────────────────────────────────────────────────────
  await testCase('timezone: 08:00 is evaluated in each person\'s own zone', async () => {
    await reset();
    const TODAY_TOKYO = todayIso(TOKYO);
    await seedUser({ id: 'ds-u8-tokyo', phone: '+8190000000008', timezone: TOKYO });
    await seedUser({ id: 'ds-u8-sp', phone: '+5511999990008', timezone: SP });
    await seedTask('ds-u8-tokyo', 'Reunião em Tóquio', { dueDate: TODAY_TOKYO });
    await seedTask('ds-u8-sp', 'Reunião em SP', { dueDate: TODAY });

    // 08:00 in Tokyo is 20:00 of the previous day in São Paulo (12h apart).
    // Which instant comes first in absolute time depends on the real clock
    // (Tokyo's "today" may already be SP's "tomorrow"), so tick in order.
    const tokyoAt = atLocal(TODAY_TOKYO, '08:00', TOKYO);
    const spAt = atLocal(TODAY, '08:00', SP);
    const [first, second] = [tokyoAt, spAt].sort((a, b) => a.getTime() - b.getTime());
    const firstPhone = first === tokyoAt ? '+8190000000008' : '+5511999990008';

    await processDueDailySummaries(first);
    check(sent.length === 1 && sent[0].to === firstPhone, 'at the first 08:00 only that zone\'s user receives', sent);

    await processDueDailySummaries(second);
    check(sent.length === 2, 'the other user receives at their own 08:00', sent.map((s) => s.to));
    const tokyoMsg = sent.find((s) => s.to === '+8190000000008');
    const spMsg = sent.find((s) => s.to === '+5511999990008');
    check(tokyoMsg?.body.includes('Reunião em Tóquio') && !tokyoMsg.body.includes('Reunião em SP'), "Tokyo user sees only Tokyo's task", tokyoMsg?.body);
    check(spMsg?.body.includes('Reunião em SP') && !spMsg.body.includes('Tóquio'), "SP user sees only SP's task", spMsg?.body);
    check((await deliveriesFor('ds-u8-tokyo')).some((r) => r.summary_date === TODAY_TOKYO && r.status === 'sent'), 'Tokyo summary_date is the local Tokyo date');
    check((await deliveriesFor('ds-u8-sp')).some((r) => r.summary_date === TODAY && r.status === 'sent'), 'SP summary_date is the local SP date');
  });

  // ── 9. Duplicate prevention ───────────────────────────────────────────────
  await testCase('idempotency: repeated ticks in the window send once', async () => {
    await reset();
    await seedUser({ id: 'ds-u9', phone: '+5511999990009' });
    await seedTask('ds-u9', 'Enviar orçamento', { dueDate: TODAY });

    await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    await processDueDailySummaries(atLocal(TODAY, '08:01', SP));
    await processDueDailySummaries(atLocal(TODAY, '08:30', SP));
    // Concurrent ticks (overlapping runs) must also collapse to one.
    await Promise.all([
      processDueDailySummaries(atLocal(TODAY, '08:31', SP)),
      processDueDailySummaries(atLocal(TODAY, '08:31', SP)),
    ]);
    check(sent.length === 1, 'exactly one message across five ticks', sent.length);
    const rows = await deliveriesFor('ds-u9');
    check(rows.length === 1, 'single delivery row (UNIQUE user+day)', rows);

    // Late: server was down through the whole window → skipped, not sent at 15:00.
    await reset();
    await seedUser({ id: 'ds-u9b', phone: '+5511999990019' });
    await seedTask('ds-u9b', 'Enviar orçamento', { dueDate: TODAY });
    const stats = await processDueDailySummaries(atLocal(TODAY, '15:00', SP));
    check(sent.length === 0 && stats.skippedLate === 1, 'far past the window → not sent', { stats, sent });
    check((await deliveriesFor('ds-u9b'))[0]?.status === 'skipped_late', 'late day recorded so it is not retried');
  });

  // ── 10. Task created after the summary went out ───────────────────────────
  await testCase('after-send: a task created later today does not trigger a second summary', async () => {
    await reset();
    await seedUser({ id: 'ds-u10', phone: '+5511999990010' });
    await seedTask('ds-u10', 'Enviar orçamento', { dueDate: TODAY });
    await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    check(sent.length === 1, 'first summary sent', sent.length);

    await seedTask('ds-u10', 'Surgiu agora', { dueDate: TODAY });
    await processDueDailySummaries(atLocal(TODAY, '08:20', SP));
    await processDueDailySummaries(atLocal(TODAY, '12:00', SP));
    check(sent.length === 1, 'no second summary the same day', sent.map((s) => s.body));

    // Same when the morning was EMPTY: a task created afterwards waits for tomorrow.
    await reset();
    await seedUser({ id: 'ds-u10b', phone: '+5511999990020' });
    await processDueDailySummaries(atLocal(TODAY, '08:00', SP));
    check(sent.length === 0 && (await deliveriesFor('ds-u10b'))[0]?.status === 'empty', 'empty morning recorded');
    await seedTask('ds-u10b', 'Surgiu depois', { dueDate: TODAY });
    await processDueDailySummaries(atLocal(TODAY, '08:15', SP));
    check(sent.length === 0, 'still nothing — one evaluation per day', sent);

    // Tomorrow is a fresh day.
    await seedTask('ds-u10b', 'De amanhã', { dueDate: addDays(TODAY, 1) });
    await processDueDailySummaries(atLocal(addDays(TODAY, 1), '08:00', SP));
    check(sent.length === 1 && sent[0].variables['3'] === 'De amanhã', 'next day sends again', sent[0]?.variables);
  });

  // ── 11. Individual reminders are independent ──────────────────────────────
  await testCase('independence: task reminder fires with the daily summary disabled', async () => {
    await reset();
    resetReminderDeliveryBreaker();
    const reminderSends: Array<{ to: string; title: string }> = [];
    __setReminderWhatsappSenderForTesting(async (to, title) => {
      reminderSends.push({ to, title });
    });

    await seedUser({ id: 'ds-u11', phone: '+5511999990011', enabled: false });
    const task = await seedTask('ds-u11', 'Renovar seguro', { dueDate: addDays(TODAY, 2) });
    // Due one minute ago in real time — inside the reminder delivery window.
    await seedReminder('ds-u11', task, new Date(Date.now() - 60_000).toISOString());

    const stats = await processDueReminders();
    check(stats.sent === 1 && reminderSends.length === 1, 'reminder delivered', { stats, reminderSends });
    check(reminderSends[0]?.to === '+5511999990011' && reminderSends[0].title === 'Renovar seguro', 'to the right person/task', reminderSends[0]);
    const row = await db.get<{ status: string }>('SELECT status FROM task_reminders WHERE task_id = ?', [task]);
    check(row?.status === 'sent', 'reminder marked sent', row);
    check(sent.length === 0 && (await deliveriesFor('ds-u11')).length === 0, 'daily summary untouched', sent);

    // And the other way round: disabling the summary must not cancel reminders.
    await seedUser({ id: 'ds-u11b', phone: '+5511999990021' });
    const t2 = await seedTask('ds-u11b', 'Pagar boleto', { dueDate: addDays(TODAY, 3) });
    const r2 = await seedReminder('ds-u11b', t2, localWallClockToUtcIso(addDays(TODAY, 1), '09:00', SP));
    await updateDailySummarySettings('ds-u11b', { enabled: false });
    const r2row = await db.get<{ status: string; trigger_at: string | null }>('SELECT status, trigger_at FROM task_reminders WHERE id = ?', [r2]);
    check(r2row?.status === 'scheduled' && r2row.trigger_at !== null, 'existing reminder still scheduled after disabling the summary', r2row);

    __setReminderWhatsappSenderForTesting(null);
  });

  __setDailySummarySenderForTesting(null);

  console.log(`\n[daily-summary] ${passed} assertions passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[daily-summary] fatal error:', err);
  process.exit(1);
});
