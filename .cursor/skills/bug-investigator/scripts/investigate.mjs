#!/usr/bin/env node
/**
 * Jarvi Bug Investigator — automated API/access/validation/injection probes.
 *
 * Env:
 *   JARVI_API_URL   default http://localhost:3001
 *   JARVI_EMAIL / JARVI_PASSWORD  or JARVI_TOKEN
 *
 * Usage:
 *   node .cursor/skills/bug-investigator/scripts/investigate.mjs
 *   node .cursor/skills/bug-investigator/scripts/investigate.mjs --out=./findings.json
 *   node .cursor/skills/bug-investigator/scripts/investigate.mjs --categories=access,validation
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREFIX = '[bug-inv]';

// Railway / some Windows CA stores fail leaf verify in Node; opt-in like legacy bugbash scripts.
if (process.env.JARVI_INSECURE_TLS === '1' || process.argv.includes('--insecure-tls')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const API = (process.env.JARVI_API_URL || arg('api', 'http://localhost:3001')).replace(/\/$/, '');
const EMAIL = process.env.JARVI_EMAIL || '';
const PASSWORD = process.env.JARVI_PASSWORD || '';
const OUT = arg('out', '');
const ONLY = (arg('categories', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const findings = [];
const created = { tasks: [], notes: [], categories: [] };

function record(f) {
  if (ONLY.length && !ONLY.includes(f.category)) return;
  findings.push({ ...f, at: new Date().toISOString() });
}

async function raw(method, p, { token, body, headers } = {}) {
  const h = { ...(headers || {}) };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${API}${p}`, {
      method,
      headers: h,
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
  } catch (err) {
    return { status: 0, j: null, text: String(err), ok: false };
  }
  const text = await res.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {
    j = null;
  }
  return { status: res.status, j, text, ok: res.ok, headers: res.headers };
}

async function login() {
  if (process.env.JARVI_TOKEN) return process.env.JARVI_TOKEN.trim();
  if (!EMAIL || !PASSWORD) {
    throw new Error('Set JARVI_TOKEN or JARVI_EMAIL+JARVI_PASSWORD');
  }
  const r = await raw('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = r.j?.token || r.j?.accessToken || r.j?.data?.token;
  if (!token) throw new Error(`login failed (${r.status}): ${r.text.slice(0, 300)}`);
  return token;
}

async function cleanup(token) {
  const tasks = await raw('GET', '/api/tasks', { token });
  const notes = await raw('GET', '/api/notes', { token });
  const cats = await raw('GET', '/api/categories', { token });
  const tlist = Array.isArray(tasks.j) ? tasks.j : tasks.j?.tasks || [];
  const nlist = Array.isArray(notes.j) ? notes.j : notes.j?.notes || [];
  const clist = Array.isArray(cats.j) ? cats.j : cats.j?.categories || [];
  for (const t of tlist) {
    if (String(t.title || '').includes(PREFIX)) {
      await raw('DELETE', `/api/tasks/${t.id}`, { token });
    }
  }
  for (const n of nlist) {
    if (String(n.title || '').includes(PREFIX)) {
      await raw('DELETE', `/api/notes/${n.id}`, { token });
    }
  }
  for (const c of clist) {
    if (String(c.name || c.title || '').includes(PREFIX)) {
      await raw('DELETE', `/api/categories/${c.id}`, { token });
    }
  }
}

function expectStatus(actual, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  return list.includes(actual);
}

function isSubscriptionBlocked(r) {
  return (
    r.status === 403 &&
    (r.j?.error === 'subscription_required' ||
      /subscription_required|active subscription is required/i.test(String(r.text || '')))
  );
}

// ─── probes ─────────────────────────────────────────────────────────

async function probeExposure() {
  for (const p of ['/debug/notes-table', '/debug', '/debug/users', '/.env', '/api/debug']) {
    const r = await raw('GET', p);
    const looksExposed =
      r.status === 200 &&
      (typeof r.text === 'string' &&
        (/table_exists|column|password|secret|CREATE TABLE/i.test(r.text) ||
          (r.j && (r.j.table_exists != null || r.j.count != null))));
    record({
      id: `exposure.${p.replace(/\W+/g, '_')}`,
      category: 'exposure',
      severity: looksExposed ? 'P0' : 'P2',
      title: `Unauthenticated GET ${p}`,
      verdict: looksExposed ? 'fail' : expectStatus(r.status, [401, 403, 404]) ? 'pass' : r.status === 200 ? 'needs_manual' : 'pass',
      evidence: { status: r.status, snippet: r.text.slice(0, 240) },
      repro: { method: 'GET', path: p },
    });
  }
}

async function probeAccess(token) {
  const protectedPaths = [
    ['GET', '/api/tasks'],
    ['GET', '/api/notes'],
    ['GET', '/api/categories'],
    ['GET', '/api/auth/profile'],
    ['GET', '/api/subscriptions/status'],
  ];

  for (const [method, p] of protectedPaths) {
    const r = await raw(method, p);
    record({
      id: `access.no-token.${p.replace(/\W+/g, '_')}`,
      category: 'access',
      severity: 'P0',
      title: `${method} ${p} sem token`,
      verdict: expectStatus(r.status, [401, 403]) ? 'pass' : 'fail',
      evidence: { status: r.status, snippet: r.text.slice(0, 200) },
      repro: { method, path: p },
    });
  }

  const junk = await raw('GET', '/api/tasks', { token: 'not.a.jwt' });
  record({
    id: 'access.junk-jwt',
    category: 'access',
    severity: 'P0',
    title: 'JWT inválido em /api/tasks',
    verdict: expectStatus(junk.status, [401, 403]) ? 'pass' : 'fail',
    evidence: { status: junk.status, snippet: junk.text.slice(0, 200) },
    repro: { method: 'GET', path: '/api/tasks', headers: { Authorization: 'Bearer not.a.jwt' } },
  });

  // expired-looking token (valid shape, bad sig)
  const fake =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImZha2UiLCJleHAiOjE2MDAwMDAwMDB9.signature';
  const exp = await raw('GET', '/api/tasks', { token: fake });
  record({
    id: 'access.fake-jwt',
    category: 'access',
    severity: 'P0',
    title: 'JWT forjado (assinatura inválida)',
    verdict: expectStatus(exp.status, [401, 403]) ? 'pass' : 'fail',
    evidence: { status: exp.status },
    repro: { method: 'GET', path: '/api/tasks' },
  });

  // sanity: valid token works
  const ok = await raw('GET', '/api/auth/profile', { token });
  record({
    id: 'access.valid-profile',
    category: 'access',
    severity: 'P2',
    title: 'Token válido acessa profile',
    verdict: ok.status === 200 ? 'pass' : 'fail',
    evidence: { status: ok.status },
    repro: { method: 'GET', path: '/api/auth/profile' },
  });
}

async function probeAuth() {
  const missing = await raw('POST', '/api/auth/login', {
    body: { email: `nobody-${Date.now()}@example.com`, password: 'wrong-password-xyz' },
  });
  const wrongPass = EMAIL
    ? await raw('POST', '/api/auth/login', {
        body: { email: EMAIL, password: 'definitely-wrong-password-!!!' },
      })
    : { status: 0, text: '', j: null };

  const msgMissing = JSON.stringify(missing.j || missing.text);
  const msgWrong = JSON.stringify(wrongPass.j || wrongPass.text);
  const enumerates =
    EMAIL &&
    missing.status !== 0 &&
    wrongPass.status !== 0 &&
    msgMissing !== msgWrong &&
    /not found|não encontr|inexist|unknown user|no user/i.test(msgMissing) &&
    /password|senha|invalid|incorret/i.test(msgWrong);

  record({
    id: 'auth.login-enumeration',
    category: 'auth',
    severity: 'P1',
    title: 'Login diferencia email inexistente vs senha errada',
    verdict: enumerates ? 'fail' : 'pass',
    evidence: {
      missingStatus: missing.status,
      wrongStatus: wrongPass.status,
      missingMsg: msgMissing.slice(0, 180),
      wrongMsg: msgWrong.slice(0, 180),
    },
    repro: { method: 'POST', path: '/api/auth/login', body: { email: '…', password: '…' } },
  });

  const forgot = await raw('POST', '/api/auth/forgot-password', {
    body: { email: `ghost-${Date.now()}@example.com` },
  });
  record({
    id: 'auth.forgot-password-orphan',
    category: 'auth',
    severity: 'P2',
    title: 'forgot-password com email inexistente',
    verdict: expectStatus(forgot.status, [200, 202, 204]) ? 'pass' : forgot.status >= 500 ? 'fail' : 'needs_manual',
    evidence: { status: forgot.status, snippet: forgot.text.slice(0, 200) },
    repro: { method: 'POST', path: '/api/auth/forgot-password' },
  });
}

async function probeValidation(token) {
  const cases = [
    {
      id: 'empty-title',
      body: { title: '' },
      badIf: (r) => r.status === 201 || r.status === 200,
      severity: 'P2',
    },
    {
      id: 'whitespace-title',
      body: { title: '   ' },
      badIf: (r) => r.status === 201 || r.status === 200,
      severity: 'P2',
    },
    {
      id: 'newline-title',
      body: { title: `${PREFIX}\nline2` },
      badIf: (r) => r.status === 201 && /\n/.test(r.j?.title || ''),
      severity: 'P3',
    },
    {
      id: 'invalid-priority',
      body: { title: `${PREFIX} pri`, priority: 'ultra-mega' },
      badIf: (r) => r.status >= 500 || r.status === 201,
      severity: 'P2',
    },
    {
      id: 'invalid-duedate',
      body: { title: `${PREFIX} due`, dueDate: 'not-a-date' },
      badIf: (r) => r.status >= 500 || r.status === 201,
      severity: 'P2',
    },
    {
      id: 'duedate-impossible',
      body: { title: `${PREFIX} due2`, dueDate: '2026-13-40' },
      badIf: (r) => r.status >= 500 || r.status === 201,
      severity: 'P2',
    },
    {
      id: 'huge-title',
      body: { title: `${PREFIX} ` + 'A'.repeat(8000) },
      badIf: (r) => r.status >= 500 || r.status === 201,
      severity: 'P2',
    },
  ];

  for (const c of cases) {
    const r = await raw('POST', '/api/tasks', { token, body: c.body });
    if (r.j?.id) created.tasks.push(r.j.id);
    const failed = isSubscriptionBlocked(r) ? false : c.badIf(r);
    record({
      id: `validation.${c.id}`,
      category: 'validation',
      severity: c.severity,
      title: `Task create: ${c.id}`,
      verdict: isSubscriptionBlocked(r) ? 'skip' : failed ? 'fail' : r.status >= 500 ? 'fail' : 'pass',
      evidence: { status: r.status, title: r.j?.title, snippet: r.text.slice(0, 220) },
      repro: { method: 'POST', path: '/api/tasks', body: c.body },
    });
  }

  // non-json body
  const nj = await raw('POST', '/api/tasks', {
    token,
    body: 'not-json',
    headers: { 'Content-Type': 'application/json' },
  });
  record({
    id: 'validation.non-json',
    category: 'validation',
    severity: 'P2',
    title: 'Body JSON inválido',
    verdict: nj.status >= 500 ? 'fail' : 'pass',
    evidence: { status: nj.status, snippet: nj.text.slice(0, 200) },
    repro: { method: 'POST', path: '/api/tasks', body: 'not-json' },
  });
}

async function probeInjection(token) {
  const xss = `<img src=x onerror=alert(1)><script>alert(2)</script>`;
  const note = await raw('POST', '/api/notes', {
    token,
    body: { title: `${PREFIX} xss`, content: xss },
  });
  if (note.j?.id) created.notes.push(note.j.id);
  const stored = typeof note.j?.content === 'string' ? note.j.content : '';
  const keepsDangerous = /onerror|<script/i.test(stored);
  record({
    id: 'injection.notes-xss-stored',
    category: 'injection',
    severity: 'P1',
    title: 'Nota persiste HTML/script sem sanitize',
    verdict: note.status >= 500 ? 'fail' : keepsDangerous ? 'fail' : 'pass',
    evidence: {
      status: note.status,
      keepsOnerror: /onerror/i.test(stored),
      keepsScript: /<script/i.test(stored),
    },
    repro: { method: 'POST', path: '/api/notes', body: { title: `${PREFIX} xss`, content: xss } },
  });

  const sqlTitle = `${PREFIX} ' OR 1=1 --`;
  const sql = await raw('POST', '/api/tasks', { token, body: { title: sqlTitle } });
  if (sql.j?.id) created.tasks.push(sql.j.id);
  record({
    id: 'injection.sql-like-title',
    category: 'injection',
    severity: 'P1',
    title: 'Title SQL-like não causa 500',
    verdict: sql.status >= 500 ? 'fail' : 'pass',
    evidence: { status: sql.status },
    repro: { method: 'POST', path: '/api/tasks', body: { title: sqlTitle } },
  });

  const rtl = await raw('POST', '/api/tasks', {
    token,
    body: { title: `${PREFIX} \u202Eevil` },
  });
  if (rtl.j?.id) created.tasks.push(rtl.j.id);
  record({
    id: 'injection.rtl-override',
    category: 'injection',
    severity: 'P3',
    title: 'Unicode RTL override no título',
    verdict: rtl.status >= 500 ? 'fail' : 'needs_manual',
    evidence: { status: rtl.status, title: rtl.j?.title },
    repro: { method: 'POST', path: '/api/tasks' },
  });
}

async function probeIdor(token) {
  const foreign = '00000000-0000-4000-8000-000000000099';
  for (const [method, p] of [
    ['GET', `/api/tasks/${foreign}`],
    ['PUT', `/api/tasks/${foreign}`],
    ['DELETE', `/api/tasks/${foreign}`],
    ['PUT', `/api/notes/${foreign}`],
    ['DELETE', `/api/notes/${foreign}`],
    ['DELETE', `/api/categories/${foreign}`],
  ]) {
    const body =
      method === 'PUT'
        ? p.includes('notes')
          ? { title: `${PREFIX} idor`, content: 'x' }
          : { title: `${PREFIX} idor` }
        : undefined;
    const r = await raw(method, p, { token, body });
    const leaked = r.status === 200 || r.status === 201;
    record({
      id: `idor.${method}.${p.replace(/\W+/g, '_')}`,
      category: 'idor',
      severity: 'P1',
      title: `${method} recurso alienígena ${p}`,
      verdict: leaked ? 'fail' : expectStatus(r.status, [401, 403, 404]) ? 'pass' : r.status >= 500 ? 'fail' : 'needs_manual',
      evidence: { status: r.status, snippet: r.text.slice(0, 180) },
      repro: { method, path: p, body },
    });
  }

  // mass assignment user_id
  const t = await raw('POST', '/api/tasks', {
    token,
    body: {
      title: `${PREFIX} mass-assign`,
      user_id: foreign,
      userId: foreign,
    },
  });
  if (t.j?.id) created.tasks.push(t.j.id);
  const assignedOther =
    t.j &&
    (t.j.user_id === foreign || t.j.userId === foreign);
  record({
    id: 'idor.mass-assign-user-id',
    category: 'idor',
    severity: 'P0',
    title: 'Create task com user_id forçado',
    verdict: assignedOther ? 'fail' : t.status >= 500 ? 'fail' : 'pass',
    evidence: { status: t.status, user_id: t.j?.user_id || t.j?.userId },
    repro: { method: 'POST', path: '/api/tasks', body: { title: `${PREFIX} mass-assign`, user_id: foreign } },
  });
}

async function probeStability(token) {
  const t = await raw('POST', '/api/tasks', {
    token,
    body: { title: `${PREFIX} toggle-race`, dueDate: '2026-08-10' },
  });
  if (!t.j?.id) {
    record({
      id: 'stability.toggle-setup',
      category: 'stability',
      severity: 'P2',
      title: 'Falha ao criar task para toggle',
      verdict: 'fail',
      evidence: { status: t.status, snippet: t.text.slice(0, 200) },
      repro: { method: 'POST', path: '/api/tasks' },
    });
    return;
  }
  created.tasks.push(t.j.id);
  const [a, b] = await Promise.all([
    raw('PATCH', `/api/tasks/${t.j.id}/toggle`, { token }),
    raw('PATCH', `/api/tasks/${t.j.id}/toggle`, { token }),
  ]);
  record({
    id: 'stability.double-toggle',
    category: 'stability',
    severity: 'P2',
    title: 'Double toggle concorrente',
    verdict: a.status >= 500 || b.status >= 500 ? 'fail' : 'needs_manual',
    evidence: {
      a: a.status,
      b: b.status,
      aCompleted: a.j?.completed,
      bCompleted: b.j?.completed,
    },
    repro: { method: 'PATCH', path: `/api/tasks/${t.j.id}/toggle` },
  });

  // category delete unknown
  const del = await raw('DELETE', `/api/categories/${'00000000-0000-4000-8000-000000000001'}`, {
    token,
  });
  record({
    id: 'stability.category-delete-missing',
    category: 'stability',
    severity: 'P2',
    title: 'DELETE category inexistente',
    verdict: del.status >= 500 ? 'fail' : expectStatus(del.status, [404, 403, 400]) ? 'pass' : 'needs_manual',
    evidence: { status: del.status, snippet: del.text.slice(0, 200) },
    repro: { method: 'DELETE', path: '/api/categories/00000000-0000-4000-8000-000000000001' },
  });
}

async function probeUserSearch(token) {
  const r = await raw('GET', '/api/users/search?q=a', { token });
  const list = Array.isArray(r.j) ? r.j : r.j?.users || r.j?.data || [];
  const emails = (Array.isArray(list) ? list : [])
    .map((u) => u.email)
    .filter(Boolean);
  record({
    id: 'auth.user-search-short-query',
    category: 'auth',
    severity: 'P1',
    title: 'GET /api/users/search?q=a enumera usuários',
    verdict: emails.length > 0 ? 'fail' : r.status >= 500 ? 'fail' : 'pass',
    evidence: {
      status: r.status,
      count: Array.isArray(list) ? list.length : 0,
      sampleEmails: emails.slice(0, 3).map((e) => e.replace(/(.).+(@.+)/, '$1***$2')),
    },
    repro: { method: 'GET', path: '/api/users/search?q=a' },
  });
}

async function probeUxHints() {
  record({
    id: 'ux.browser-pass',
    category: 'ux',
    severity: 'P3',
    title: 'Passos manuais de UX (browser)',
    verdict: 'needs_manual',
    evidence: {
      checklist: [
        'Toggle criar tarefa persiste?',
        'Completed aparece em seções de data?',
        'Homepage / early-access copy corretos?',
        'Finances / CSS quebrado?',
        'Links de collab apontam para localhost?',
        'Markdown preview executa HTML?',
      ],
    },
    repro: { method: 'MANUAL', path: '/app' },
  });
}

// ─── main ───────────────────────────────────────────────────────────

async function main() {
  console.log(`Bug Investigator → ${API}`);
  const health = await raw('GET', '/health');
  if (health.status !== 200) {
    console.error(`Health check failed (${health.status}). Is the API up?`);
    process.exit(2);
  }

  await probeExposure();
  await probeAuth();
  await probeUxHints();

  let token;
  try {
    token = await login();
  } catch (err) {
    console.warn('Auth skipped:', err.message);
    record({
      id: 'access.login-required',
      category: 'access',
      severity: 'P2',
      title: 'Não foi possível autenticar — sondas autenticadas puladas',
      verdict: 'skip',
      evidence: { error: String(err.message || err) },
      repro: { method: 'POST', path: '/api/auth/login' },
    });
    return finish();
  }

  await cleanup(token);
  await probeAccess(token);

  const subCheck = await raw('GET', '/api/tasks', { token });
  if (isSubscriptionBlocked(subCheck)) {
    record({
      id: 'access.subscription-required',
      category: 'access',
      severity: 'P2',
      title: 'Conta sem assinatura ativa — sondas CRUD puladas',
      verdict: 'skip',
      evidence: { status: subCheck.status, snippet: (subCheck.text || '').slice(0, 200) },
      repro: { method: 'GET', path: '/api/tasks' },
    });
    return finish();
  }

  await probeValidation(token);
  await probeInjection(token);
  await probeIdor(token);
  await probeStability(token);
  await probeUserSearch(token);
  await cleanup(token);
  return finish();
}

function finish() {
  const filtered = ONLY.length ? findings.filter((f) => ONLY.includes(f.category)) : findings;
  const passed = filtered.filter((f) => f.verdict === 'pass').length;
  const failed = filtered.filter((f) => f.verdict === 'fail').length;
  const manual = filtered.filter((f) => f.verdict === 'needs_manual').length;
  const skipped = filtered.filter((f) => f.verdict === 'skip').length;

  const report = {
    meta: {
      api: API,
      at: new Date().toISOString(),
      passed,
      failed,
      needs_manual: manual,
      skipped,
      total: filtered.length,
    },
    findings: filtered,
  };

  const text = JSON.stringify(report, null, 2);
  if (OUT) {
    const abs = path.resolve(OUT);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf8');
    console.log(`Wrote ${abs}`);
  }

  console.log(`\nSummary: ${passed} pass / ${failed} fail / ${manual} manual / ${skipped} skip`);
  for (const f of filtered.filter((x) => x.verdict === 'fail')) {
    console.log(`  FAIL [${f.severity}] ${f.id} — ${f.title} (HTTP ${f.evidence?.status ?? '?'})`);
  }
  for (const f of filtered.filter((x) => x.verdict === 'needs_manual')) {
    console.log(`  MANUAL [${f.severity}] ${f.id} — ${f.title}`);
  }

  // also write default under skill folder if no --out
  if (!OUT) {
    const def = path.join(__dirname, '..', 'last-run.json');
    fs.writeFileSync(def, text, 'utf8');
    console.log(`Wrote ${def}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
