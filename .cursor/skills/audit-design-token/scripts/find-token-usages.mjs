#!/usr/bin/env node
// Uso: node find-token-usages.mjs <token> [--scope=web,marketing]
//   ex.: node find-token-usages.mjs body-lg
//        node find-token-usages.mjs display-lg --scope=web,marketing
// Audita um design token: usos via var(), candidatos hardcoded e inline em .tsx.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Lista arquivos por extensão sob um root, sem depender de ferramentas externas (ex.: ripgrep).
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.git', 'coverage', '.expo']);
const walk = (dir, exts, acc = []) => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), exts, acc);
    } else if (exts.some((ext) => e.name.endsWith(ext))) {
      acc.push(join(dir, e.name));
    }
  }
  return acc;
};

// Roots auditáveis. mobile/shared ficam de fora por enquanto (ver --scope).
const SCOPE_ROOTS = {
  web: 'packages/web/src',
  marketing: 'packages/marketing',
};
const DEFAULT_SCOPES = ['web', 'marketing'];
// Fonte canônica de valores do token (design system do web).
const TOKENS_FILE = `${SCOPE_ROOTS.web}/design-system/tokens/css-variables.css`;
const IGNORE = [
  /css-variables\.css$/,
  /generate-tokens\.js$/,
  /\.tokens\.json$/,
  /\.md$/,
];

const args = process.argv.slice(2);
const token = args.find((a) => !a.startsWith('--'));
const scopeFlag = args.find((a) => a.startsWith('--scope='));
const jsonMode = args.includes('--json');

if (!token) {
  console.error('Informe um token. Ex.: node find-token-usages.mjs body-lg [--scope=web,marketing] [--json]');
  process.exit(1);
}

const scopes = scopeFlag
  ? scopeFlag
      .slice('--scope='.length)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : DEFAULT_SCOPES;

const unknown = scopes.filter((s) => !SCOPE_ROOTS[s]);
if (unknown.length) {
  console.error(`Escopo(s) desconhecido(s): ${unknown.join(', ')}. Disponíveis: ${Object.keys(SCOPE_ROOTS).join(', ')}`);
  process.exit(1);
}
const roots = scopes.map((s) => SCOPE_ROOTS[s]);
const notAudited = Object.keys(SCOPE_ROOTS).filter((s) => !scopes.includes(s));

const norm = (v) => v.replace(/\s+/g, ' ').trim().toLowerCase();
const isIgnored = (file) => IGNORE.some((re) => re.test(file));
const pkgOf = (file) =>
  Object.entries(SCOPE_ROOTS).find(([, root]) => file.startsWith(root))?.[0] ?? 'unknown';

// --- Helpers numéricos para normalizar line-height (px, unitless, %, em) ---
const pxOf = (v) => {
  const m = /^(-?[\d.]+)px$/.exec(v.trim().toLowerCase());
  return m ? parseFloat(m[1]) : null;
};
const unitlessOf = (v) => {
  const m = /^(-?[\d.]+)$/.exec(v.trim());
  return m ? parseFloat(m[1]) : null;
};
// Resolve line-height para px usando o font-size do contexto (px). Retorna null se indeterminável.
const lineHeightPx = (raw, fontSizePx) => {
  if (raw == null) return null;
  const v = raw.trim().toLowerCase();
  const px = pxOf(v);
  if (px != null) return px;
  const ul = unitlessOf(v);
  if (ul != null) return fontSizePx != null ? ul * fontSizePx : null;
  const pct = /^(-?[\d.]+)%$/.exec(v);
  if (pct) return fontSizePx != null ? (parseFloat(pct[1]) / 100) * fontSizePx : null;
  const em = /^(-?[\d.]+)em$/.exec(v);
  if (em) return fontSizePx != null ? parseFloat(em[1]) * fontSizePx : null;
  return null;
};

// 1) Resolver a família de variáveis do token a partir do arquivo de tokens.
const tokensCss = readFileSync(TOKENS_FILE, 'utf8');
const varRe = new RegExp(`--([\\w-]*${token}[\\w-]*):\\s*([^;]+);`, 'g');
// name -> Set de valores distintos (um token pode ser redefinido por tema: light/dark).
const family = {};
for (const m of tokensCss.matchAll(varRe)) (family[`--${m[1]}`] ??= new Set()).add(m[2].trim());
if (!Object.keys(family).length) {
  console.error(`Token "${token}" não encontrado em ${TOKENS_FILE}`);
  process.exit(1);
}

// Propriedades CSS que carregam valor literal comparável -> sufixo do nome do token.
const PROP_SUFFIX = {
  'font-size': 'font-size',
  'line-height': 'line-height',
  'font-weight': 'font-weight',
  'letter-spacing': 'letter-spacing',
};
const valueByProp = {}; // prop -> Set de valores normalizados
for (const [name, vals] of Object.entries(family)) {
  for (const [prop, suffix] of Object.entries(PROP_SUFFIX)) {
    if (name.endsWith(suffix)) {
      const set = (valueByProp[prop] ??= new Set());
      for (const v of vals) set.add(norm(v));
    }
  }
}
// Token de valor único (cor, spacing, radius): casa qualquer propriedade.
const singleValueSet =
  Object.keys(family).length === 1 ? new Set([...Object.values(family)[0]].map(norm)) : null;
const exactPropCount = Object.keys(valueByProp).length;

// font-size do próprio token (px) — usado para resolver line-height por razão.
const tokenFontSizePx = valueByProp['font-size']
  ? ([...valueByProp['font-size']].map(pxOf).find((n) => n != null) ?? null)
  : null;

// Compara line-height de um bloco com o(s) valor(es) do token, normalizando para px.
// Tolerância de 0.6px (px) ou 0.02 (razão) cobre arredondamentos.
const lineHeightMatches = (declRaw, blockFontSizePx) => {
  for (const tokenRaw of valueByProp['line-height']) {
    const tokenPx = lineHeightPx(tokenRaw, tokenFontSizePx);
    const blockPx = lineHeightPx(declRaw, blockFontSizePx ?? tokenFontSizePx);
    if (tokenPx != null && blockPx != null && Math.abs(tokenPx - blockPx) <= 0.6) return true;
    // Fallback por razão (line-height / font-size) quando o px não é resolvível.
    const tokenRatio = tokenPx != null && tokenFontSizePx ? tokenPx / tokenFontSizePx : unitlessOf(tokenRaw);
    const blockRatio = unitlessOf(declRaw);
    if (tokenRatio != null && blockRatio != null && Math.abs(tokenRatio - blockRatio) <= 0.02) return true;
  }
  return false;
};

const getDecl = (decls, prop) => {
  const m = decls.match(new RegExp(`(^|[^-])${prop}:\\s*([^;]+);`, 'i'));
  return m ? m[2].trim() : null;
};

// 2) Listar arquivos CSS dos escopos e parsear blocos { seletor + declarações }.
const cssFiles = roots.flatMap((r) => walk(r, ['.css']));

const direct = [];
const hardcoded = [];
const partial = [];

for (const file of cssFiles) {
  if (isIgnored(file)) continue;
  const src = readFileSync(file, 'utf8');
  const chunks = src.split('}');
  let offset = 0;
  for (const raw of chunks) {
    const chunkStart = offset;
    offset += raw.length + 1; // +1 pelo '}' removido
    const open = raw.lastIndexOf('{');
    if (open === -1) continue;
    const line = src.slice(0, chunkStart + open).split('\n').length;

    // Remove comentários antes de analisar: cobre tanto comentário acima do
    // seletor quanto declarações comentadas (que deixam de ser contadas).
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
    const selector = stripComments(raw.slice(0, open)).replace(/\s+/g, ' ').trim();
    const decls = stripComments(raw.slice(open + 1));

    const usesVar = Object.keys(family).some((v) => decls.includes(`var(${v}`));

    let hits = 0;
    let total = 0;
    if (singleValueSet) {
      const dm = decls.match(/:\s*([^;]+);/g) || [];
      for (const d of dm) {
        total++;
        if (singleValueSet.has(norm(d.replace(/^[^:]*:/, '').replace(';', '')))) hits++;
      }
    } else {
      const blockFontSizePx = pxOf(getDecl(decls, 'font-size') ?? '');
      for (const prop of Object.keys(valueByProp)) {
        const declRaw = getDecl(decls, prop);
        if (declRaw == null) continue;
        total++;
        if (prop === 'line-height') {
          if (lineHeightMatches(declRaw, blockFontSizePx)) hits++;
        } else if (valueByProp[prop].has(norm(declRaw))) {
          hits++;
        }
      }
    }

    const entry = { file, line, selector };
    if (usesVar) direct.push(entry);
    else if (!singleValueSet && hits === exactPropCount && exactPropCount > 0) hardcoded.push(entry);
    else if (singleValueSet && hits > 0) hardcoded.push(entry);
    else if (hits >= 2) partial.push({ ...entry, hits, total });
  }
}

// 3) Estilos inline em .tsx (bônus). Para tipografia, casa só `fontSize: <valor>`
// (evita ruído de padding/gap/borderRadius); para token de valor único, casa o valor.
const inline = [];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Cada padrão é { re, flags }; varremos linha a linha os .tsx dos escopos.
const patterns = [];
if (valueByProp['font-size']) {
  for (const v of valueByProp['font-size']) patterns.push({ re: `fontSize:[ '"]*${escapeRe(v)}`, flags: '' });
} else if (singleValueSet) {
  for (const v of singleValueSet) patterns.push({ re: escapeRe(v), flags: 'i' });
}
if (patterns.length) {
  const compiled = patterns.map((p) => new RegExp(p.re, p.flags));
  for (const file of roots.flatMap((r) => walk(r, ['.tsx']))) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((content, i) => {
      if (compiled.some((re) => re.test(content))) inline.push(`${file}:${i + 1}:${content.trim()}`);
    });
  }
}

// 4) Saída.
// Modo JSON: contrato estável consumido pelo capturador de snapshots (Estágio B).
if (jsonMode) {
  const tag = (rows, bucket) =>
    rows.map((r) => ({
      package: pkgOf(r.file),
      file: r.file,
      line: r.line,
      selector: r.selector,
      bucket,
      ...(r.hits != null ? { hits: r.hits, total: r.total } : {}),
    }));
  const inlineEntries = inline.map((l) => {
    const [file, line] = l.split(':');
    return { package: pkgOf(file), file, line: Number(line) || null, selector: null, bucket: 'inline' };
  });
  const payload = {
    token,
    scopes,
    variables: Object.fromEntries(Object.entries(family).map(([k, v]) => [k, [...v]])),
    matches: [
      ...tag(direct, 'direct'),
      ...tag(hardcoded, 'hardcoded'),
      ...tag(partial, 'partial'),
      ...inlineEntries,
    ],
  };
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const table = (rows, withProps = false) =>
  rows.length
    ? rows
        .map((r) => `| ${r.file}:${r.line} | \`${r.selector}\`${withProps ? ` | ${r.hits}/${r.total}` : ''} |`)
        .join('\n')
    : '_nenhum_';

console.log(`# Auditoria do token: ${token}\n`);
console.log(`Escopo auditado: ${scopes.map((s) => `${s} (${SCOPE_ROOTS[s]})`).join(', ')}`);
if (notAudited.length) {
  console.log(`> Não auditado: ${notAudited.join(', ')} — use --scope para incluir.`);
}
console.log('\nVariáveis resolvidas:');
for (const [k, vals] of Object.entries(family)) console.log(`- ${k}: ${[...vals].join(' | ')}`);
console.log(`\n## Usos diretos (var) — ${direct.length}\n\n| arquivo:linha | seletor |\n|---|---|\n${table(direct)}`);
console.log(`\n## Candidatos hardcoded (match exato) — ${hardcoded.length}\n\n| arquivo:linha | seletor |\n|---|---|\n${table(hardcoded)}`);
console.log(`\n## Matches parciais (revisar) — ${partial.length}\n\n| arquivo:linha | seletor | props |\n|---|---|---|\n${table(partial, true)}`);
console.log(`\n## Inline em .tsx — ${inline.length}\n\n${inline.join('\n') || '_nenhum_'}`);

if (!direct.length && !hardcoded.length && !partial.length && !inline.length) {
  console.log(
    `\n> ⚠️ Nenhuma ocorrência encontrada no escopo \`${scopes.join(', ')}\`. ` +
      `Isso NÃO significa que o token é inutilizado no monorepo — ` +
      `${notAudited.length ? `pacotes não auditados (${notAudited.join(', ')}) podem usá-lo. ` : ''}` +
      `Reveja o escopo antes de tratar o token como morto.`,
  );
}
