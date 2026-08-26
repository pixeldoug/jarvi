#!/usr/bin/env node
/**
 * Jarvi daily system check — public probes only (no credentials).
 *
 * Env:
 *   JARVI_API_URL     default https://jarvi-production.up.railway.app
 *   JARVI_WEB_URL     default https://app.jarvi.life
 *   JARVI_MARKETING_URL default https://jarvi.life
 *   JARVI_INSECURE_TLS=1  skip TLS verify (Railway + some Windows CA stores)
 *
 * Usage:
 *   node scripts/daily-system-check.mjs
 *   node scripts/daily-system-check.mjs --out=scripts/bugbash-issues/_daily-last.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.JARVI_INSECURE_TLS === '1' || process.argv.includes('--insecure-tls')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const API = (process.env.JARVI_API_URL || 'https://jarvi-production.up.railway.app').replace(/\/$/, '');
const WEB = (process.env.JARVI_WEB_URL || 'https://app.jarvi.life').replace(/\/$/, '');
const MARKETING = (process.env.JARVI_MARKETING_URL || 'https://jarvi.life').replace(/\/$/, '');
const GITHUB_REPO = process.env.JARVI_GITHUB_REPO || 'pixeldoug/jarvi';
const EXPECTED_HOMEPAGE = 'https://app.jarvi.life';
const OUT = arg('out', path.join(__dirname, 'bugbash-issues', '_daily-last.json'));

const findings = [];

function record(f) {
  findings.push({ ...f, at: new Date().toISOString() });
}

async function get(url, { timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'jarvi-daily-system-check/1.0' },
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text, headers: res.headers, url };
  } catch (err) {
    return { status: 0, ok: false, text: String(err), headers: null, url };
  } finally {
    clearTimeout(t);
  }
}

async function probeHealth() {
  const r = await get(`${API}/health`);
  const healthy = r.status === 200 && /ok|healthy|up/i.test(r.text);
  record({
    id: 'stability.health',
    category: 'stability',
    severity: 'P0',
    title: 'API /health',
    verdict: healthy ? 'pass' : 'fail',
    evidence: { status: r.status, snippet: r.text.slice(0, 240) },
    repro: { method: 'GET', url: `${API}/health` },
  });
}

async function probeDebug() {
  const paths = ['/debug/notes-table', '/debug', '/debug/users', '/.env', '/api/debug'];
  for (const p of paths) {
    const r = await get(`${API}${p}`);
    const body = r.text || '';
    const looksExposed =
      r.status === 200 &&
      (/table_exists|column_name|"count"\s*:/i.test(body) ||
        /DB_PASSWORD|JWT_SECRET|BEGIN RSA/i.test(body));
    const closed = [401, 403, 404].includes(r.status);
    let verdict = 'needs_manual';
    if (looksExposed) verdict = 'fail';
    else if (r.status === 0) verdict = 'fail';
    else if (closed) verdict = 'pass';
    record({
      id: `exposure.debug${p.replace(/\W+/g, '_')}`,
      category: 'exposure',
      severity: p === '/debug/notes-table' ? 'P0' : 'P1',
      title: `Endpoint de debug ${p}`,
      verdict,
      evidence: { status: r.status, snippet: body.slice(0, 300) },
      repro: { method: 'GET', url: `${API}${p}` },
    });
  }
}

async function probeLanding() {
  const home = await get(MARKETING);
  const html = home.text || '';
  const earlyAccessCopy = /acesso antecipado|Garanta seu acesso/i.test(html);
  const typoVoce = /quanto mais voce usa/i.test(html);
  record({
    id: 'ux.landing-early-access-cta',
    category: 'ux',
    severity: 'P2',
    title: 'Landing vende acesso antecipado',
    verdict: home.status !== 200 ? 'fail' : earlyAccessCopy ? 'fail' : 'pass',
    evidence: { status: home.status, earlyAccessCopy, snippet: html.slice(0, 200) },
    repro: { method: 'GET', url: MARKETING },
  });
  record({
    id: 'ux.landing-typo-voce',
    category: 'ux',
    severity: 'P3',
    title: 'Typo “voce” na landing',
    verdict: home.status !== 200 ? 'skip' : typoVoce ? 'fail' : 'pass',
    evidence: { status: home.status, typoVoce },
    repro: { method: 'GET', url: MARKETING },
  });

  const ea = await get(`${MARKETING}/early-access`);
  const redirected =
    [301, 302, 307, 308].includes(ea.status) &&
    /criar-conta|app\.jarvi\.life/i.test(ea.headers?.get?.('location') || '');
  const notFound = ea.status === 404 || /não encontrada|not found/i.test(ea.text || '');
  record({
    id: 'ux.early-access-route',
    category: 'ux',
    severity: 'P2',
    title: '/early-access deve redirecionar para criar-conta',
    verdict: redirected ? 'pass' : notFound ? 'fail' : 'needs_manual',
    evidence: {
      status: ea.status,
      location: ea.headers?.get?.('location') || null,
      snippet: (ea.text || '').slice(0, 200),
    },
    repro: { method: 'GET', url: `${MARKETING}/early-access` },
  });
}

async function probeGithubHomepage() {
  const r = await get(`https://api.github.com/repos/${GITHUB_REPO}`);
  let homepage = null;
  try {
    homepage = JSON.parse(r.text).homepage || '';
  } catch {
    homepage = null;
  }
  const ok =
    typeof homepage === 'string' &&
    homepage.replace(/\/$/, '') === EXPECTED_HOMEPAGE.replace(/\/$/, '');
  const looksWrong = /jarvi-web\.vercel\.app|food|log/i.test(String(homepage));
  record({
    id: 'ux.github-homepage',
    category: 'ux',
    severity: 'P1',
    title: 'Homepage do GitHub deve ser app.jarvi.life',
    verdict: r.status !== 200 ? 'needs_manual' : ok ? 'pass' : looksWrong || homepage ? 'fail' : 'needs_manual',
    evidence: { status: r.status, homepage },
    repro: { method: 'GET', url: `https://github.com/${GITHUB_REPO}` },
  });
}

async function probeCollabLocalhost() {
  const html = await get(WEB);
  if (html.status !== 200) {
    record({
      id: 'access.collab-localhost',
      category: 'access',
      severity: 'P1',
      title: 'Bundle prod aponta Socket.IO para localhost',
      verdict: 'needs_manual',
      evidence: { status: html.status, snippet: (html.text || '').slice(0, 200) },
      repro: { method: 'GET', url: WEB },
    });
    return;
  }
  const assets = [...(html.text || '').matchAll(/\/assets\/[^"' ]+\.js/g)].map((m) => m[0]);
  let hit = null;
  let scanned = 0;
  for (const asset of assets.slice(0, 8)) {
    const abs = asset.startsWith('http') ? asset : `${WEB}${asset}`;
    const js = await get(abs);
    scanned += 1;
    if (/localhost:3001|REACT_APP_API_URL/i.test(js.text || '')) {
      hit = { asset: abs, snippet: (js.text.match(/.{0,40}localhost:3001.{0,40}/i) || [''])[0] };
      break;
    }
  }
  record({
    id: 'access.collab-localhost',
    category: 'access',
    severity: 'P1',
    title: 'Bundle prod aponta Socket.IO para localhost',
    verdict: hit ? 'fail' : scanned === 0 ? 'needs_manual' : 'pass',
    evidence: { htmlStatus: html.status, scanned, hit },
    repro: { method: 'GET', url: WEB },
  });
}

async function main() {
  await probeHealth();
  await probeDebug();
  await probeLanding();
  await probeGithubHomepage();
  await probeCollabLocalhost();

  const passed = findings.filter((f) => f.verdict === 'pass').length;
  const failed = findings.filter((f) => f.verdict === 'fail').length;
  const manual = findings.filter((f) => f.verdict === 'needs_manual').length;
  const skipped = findings.filter((f) => f.verdict === 'skip').length;

  const report = {
    meta: {
      api: API,
      web: WEB,
      marketing: MARKETING,
      at: new Date().toISOString(),
      passed,
      failed,
      needs_manual: manual,
      skipped,
      total: findings.length,
    },
    findings,
  };

  const text = JSON.stringify(report, null, 2);
  const abs = path.resolve(OUT);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf8');
  console.log(`Wrote ${abs}`);
  console.log(`Summary: ${passed} pass / ${failed} fail / ${manual} manual / ${skipped} skip`);
  for (const f of findings.filter((x) => x.verdict === 'fail')) {
    console.log(`  FAIL [${f.severity}] ${f.id} — ${f.title} (HTTP ${f.evidence?.status ?? f.evidence?.htmlStatus ?? '?'})`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
