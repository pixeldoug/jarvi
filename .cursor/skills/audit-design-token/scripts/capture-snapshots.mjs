#!/usr/bin/env node
// Estágio B — captura visual unificada (web + marketing) de um design token.
// Uso: node .cursor/skills/audit-design-token/scripts/capture-snapshots.mjs <token> [--scope=web,marketing] [--jwt=<token>] [--out=.audit-snapshots]
//
// Pipeline: roda find-token-usages.mjs --json -> descobre os seletores que usam o token,
// visita as rotas do manifesto (audit.capture.json) e, em cada rota, descobre via DOM
// onde os elementos aparecem, destaca-os e tira um screenshot full-page.
//
// Pré-requisitos:
//   - Servidores rodando: `npm run dev:web` (3000) e/ou `npm run dev:marketing` (3002).
//   - Playwright + chromium instalados (npx playwright install chromium).
//   - Para rotas autenticadas do web, forneça um JWT via --jwt=<token> ou env JARVI_AUDIT_TOKEN.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = join(scriptDir, '..');
const repoRoot = join(scriptDir, '..', '..', '..', '..');
const finder = join(scriptDir, 'find-token-usages.mjs');
const manifestPath = join(skillDir, 'audit.capture.json');

const args = process.argv.slice(2);
const token = args.find((a) => !a.startsWith('--'));
const scopeFlag = args.find((a) => a.startsWith('--scope='));
const jwtFlag = args.find((a) => a.startsWith('--jwt='));
const outFlag = args.find((a) => a.startsWith('--out='));

if (!token) {
  console.error('Uso: node capture-snapshots.mjs <token> [--scope=web,marketing] [--jwt=<token>] [--out=dir]');
  process.exit(1);
}

const jwt = jwtFlag ? jwtFlag.slice('--jwt='.length) : process.env.JARVI_AUDIT_TOKEN || null;
const outDir = join(repoRoot, outFlag ? outFlag.slice('--out='.length) : '.audit-snapshots', token);

// Override de baseUrl por pacote (portas alternativas, preview deploys):
// --baseurl=web=http://localhost:3001
const baseOverrides = {};
for (const a of args.filter((x) => x.startsWith('--baseurl='))) {
  const v = a.slice('--baseurl='.length);
  const i = v.indexOf('=');
  if (i > 0) baseOverrides[v.slice(0, i)] = v.slice(i + 1);
}

// Playwright é dependência opcional: erro amigável se faltar.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    'Playwright não encontrado. Instale com:\n' +
      '  npm install -D playwright && npx playwright install chromium',
  );
  process.exit(1);
}

// 1) Inventário (Estágio A) em JSON.
const finderArgs = [finder, token, '--json', ...(scopeFlag ? [scopeFlag] : [])];
let inventory;
try {
  inventory = JSON.parse(execFileSync('node', finderArgs, { cwd: repoRoot, encoding: 'utf8' }));
} catch (e) {
  console.error('Falha ao rodar o inventário (Estágio A):', e.message);
  process.exit(1);
}

// Só seletores CSS dão pra fotografar (inline em .tsx não tem seletor).
const cssMatches = inventory.matches.filter((m) => m.selector);
if (!cssMatches.length) {
  console.error(`Nenhum uso com seletor CSS para "${token}" no escopo ${inventory.scopes.join(', ')}. Nada a capturar.`);
  process.exit(0);
}

// 2) Manifesto de rotas.
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Converte um seletor do Estágio A em algo robusto contra CSS Modules (classes com hash).
// `.heroTitle` -> `[class*="heroTitle"]`; `.ctaCard h2` -> `[class*="ctaCard"] h2`; lida com vírgulas.
const toDomSelector = (sel) =>
  sel
    .split(',')
    .map((group) =>
      group
        .trim()
        .split(/\s+/)
        .map((tok) =>
          tok.startsWith('.')
            ? tok
                .split('.')
                .filter(Boolean)
                .map((c) => `[class*="${c}"]`)
                .join('')
            : tok,
        )
        .join(' '),
    )
    .join(', ');

const slug = (p) => (p === '/' ? 'root' : p.replace(/^\//, '').replace(/\//g, '-'));
const isUp = async (url) => {
  try {
    await fetch(url, { method: 'HEAD' });
    return true;
  } catch {
    return false;
  }
};

const scopes = scopeFlag
  ? scopeFlag.slice('--scope='.length).split(',').map((s) => s.trim()).filter(Boolean)
  : inventory.scopes;

mkdirSync(outDir, { recursive: true });

const report = [];
const browser = await chromium.launch();

for (const pkg of scopes) {
  const cfg = manifest.packages[pkg];
  const pkgMatches = cssMatches.filter((m) => m.package === pkg);
  if (!cfg || !pkgMatches.length) continue;

  const baseUrl = baseOverrides[pkg] || cfg.baseUrl;
  if (!(await isUp(baseUrl))) {
    console.warn(`⚠️  ${pkg}: servidor em ${baseUrl} indisponível — pulei. Rode \`npm run dev:${pkg}\`.`);
    report.push({ pkg, status: `servidor offline (${baseUrl})` });
    continue;
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Injeta o JWT no localStorage antes de qualquer script da página (rotas autenticadas do web).
  if (cfg.authStorageKey && jwt) {
    await context.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [cfg.authStorageKey, jwt],
    );
  }

  for (const route of cfg.routes) {
    if (route.auth && cfg.authStorageKey && !jwt) {
      console.warn(`⚠️  ${pkg}${route.path}: rota autenticada e nenhum JWT fornecido — pulei. Use --jwt=<token>.`);
      report.push({ pkg, route: route.path, status: 'sem auth (JWT ausente)' });
      continue;
    }

    const page = await context.newPage();
    const url = baseUrl + route.path;
    // networkidle é instável com HMR (dev server mantém conexão aberta), então usamos
    // domcontentloaded + load + um settle curto para a hidratação/CSR.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('load').catch(() => {});
    if (route.waitFor) await page.locator(route.waitFor).first().waitFor({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);

    // Descobre, via DOM, quais seletores do token aparecem nesta rota.
    const found = [];
    for (const m of pkgMatches) {
      const domSel = toDomSelector(m.selector);
      const count = await page.locator(domSel).count().catch(() => 0);
      if (count > 0) found.push({ ...m, domSel, count });
    }

    if (!found.length) {
      await page.close();
      continue;
    }

    // Destaca os elementos encontrados.
    await page.evaluate((items) => {
      for (const { domSel, selector, bucket } of items) {
        document.querySelectorAll(domSel).forEach((el) => {
          el.style.outline = bucket === 'partial' ? '3px dashed #f59e0b' : '3px solid #e11d8f';
          el.style.outlineOffset = '2px';
          el.setAttribute('data-token-audit', `${selector} (${bucket})`);
        });
      }
    }, found);

    const file = join(outDir, `${pkg}__${slug(route.path)}.png`);
    await page.screenshot({ path: file, fullPage: true });
    await page.close();

    const rel = file.replace(repoRoot + '/', '');
    console.log(`📸 ${pkg}${route.path} → ${rel} (${found.map((f) => f.selector).join(', ')})`);
    report.push({ pkg, route: route.path, file: rel, selectors: found.map((f) => `${f.selector} [${f.bucket}]`) });
  }

  await context.close();
}

await browser.close();

// 3) Índice em markdown.
const lines = [`# Snapshots: ${token}`, '', `Escopo: ${scopes.join(', ')}`, ''];
for (const r of report) {
  if (r.file) lines.push(`- **${r.pkg}${r.route}** — ${r.selectors.join(', ')}\n  - \`${r.file}\``);
  else lines.push(`- **${r.pkg}${r.route ?? ''}** — ${r.status}`);
}
const indexPath = join(outDir, 'index.md');
writeFileSync(indexPath, lines.join('\n') + '\n');
console.log(`\n📄 Índice: ${indexPath.replace(repoRoot + '/', '')}`);
