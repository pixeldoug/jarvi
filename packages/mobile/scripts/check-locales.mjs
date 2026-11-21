#!/usr/bin/env node
/**
 * npm run check:locales  (packages/mobile)
 *
 * Same rules as packages/web/scripts/check-locales.mjs. Compares every
 * namespace in src/locales/pt-BR (the source) with every other locale folder
 * (en-US today) and fails on:
 *   - a namespace file missing in a locale, or invalid JSON
 *   - a namespace not listed in src/i18n/resources.ts
 *   - keys missing or extra compared with pt-BR
 *   - values that are not strings, or are empty
 *   - plurals without both `_one` and `_other`, or with forms we do not use
 *     (`_two`, `_few`, `_many`; `_zero` is allowed)
 *   - `{{variables}}`, `$t(nesting)` or `<Trans>` tags that differ between
 *     the pt-BR value and the translated one
 *
 *   - src/locales/native/*.json (iOS InfoPlist strings for app.config.ts
 *     `locales`) with different keys, or empty values
 *   - a component (.tsx) that calls `i18n.t(`, `preset.label`, or a text
 *     helper that reads the global language without passing `locale`.
 *     The React Compiler memoizes those calls, so their text would stay in
 *     the old language after a switch (compliance.md › "Textos e idiomas").
 *
 * `--warn-same` also lists translated values identical to pt-BR (a hint of
 * forgotten translations; not an error, brand names are legit).
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(root, 'src', 'locales');
const resourcesFile = join(root, 'src', 'i18n', 'resources.ts');
const SOURCE = 'pt-BR';
const warnSame = process.argv.includes('--warn-same');

const problems = [];
const warnings = [];
const report = (msg) => problems.push(msg);

// Locale folders look like `pt-BR`; `native/` holds iOS strings, checked at the end.
const locales = readdirSync(localesDir).filter(
  (name) => /^[a-z]{2}-[A-Z]{2}$/.test(name) && statSync(join(localesDir, name)).isDirectory(),
);
if (!locales.includes(SOURCE)) {
  console.error(`check:locales: ${SOURCE} folder not found in ${localesDir}`);
  process.exit(1);
}
const targets = locales.filter((l) => l !== SOURCE);

const namespaces = new Set();
for (const locale of locales) {
  for (const file of readdirSync(join(localesDir, locale))) {
    if (file.endsWith('.json')) namespaces.add(file.replace(/\.json$/, ''));
  }
}

// Namespaces wired in resources.ts (NAMESPACES array).
const resourcesSource = existsSync(resourcesFile) ? readFileSync(resourcesFile, 'utf8') : '';
const nsBlock = resourcesSource.match(/NAMESPACES\s*=\s*\[([\s\S]*?)\]/);
const wired = new Set(nsBlock ? [...nsBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []);

function load(locale, ns) {
  const file = join(localesDir, locale, `${ns}.json`);
  if (!existsSync(file)) {
    report(`${locale}/${ns}.json: file missing`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    report(`${locale}/${ns}.json: invalid JSON (${error.message})`);
    return null;
  }
}

/** Flattens nested objects to `a.b.c` → value. */
function flatten(value, prefix, out, where) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out, where);
    }
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => flatten(child, `${prefix}.${index}`, out, where));
    return out;
  }
  if (typeof value !== 'string') {
    report(`${where}: "${prefix}" is ${value === null ? 'null' : typeof value}, expected a string`);
    return out;
  }
  out.set(prefix, value);
  return out;
}

function tokens(text) {
  const vars = [...text.matchAll(/\{\{\s*-?\s*([^,}\s]+)[^}]*\}\}/g)].map((m) => `{{${m[1]}}}`);
  const nesting = [...text.matchAll(/\$t\(\s*([^,)\s]+)/g)].map((m) => `$t(${m[1]})`);
  const tags = [...text.matchAll(/<\/?\s*([A-Za-z0-9]+)[^>]*?\/?>/g)].map((m) => `<${m[1]}>`);
  return [...new Set([...vars, ...nesting, ...tags])].sort();
}

const PLURAL_RE = /_(zero|one|two|few|many|other)$/;
const USED_PLURALS = new Set(['zero', 'one', 'other']);

function checkPlurals(keys, where) {
  const bases = new Map();
  for (const key of keys) {
    const match = key.match(PLURAL_RE);
    if (!match) continue;
    const base = key.slice(0, -match[0].length);
    if (!bases.has(base)) bases.set(base, new Set());
    bases.get(base).add(match[1]);
    if (!USED_PLURALS.has(match[1])) {
      report(`${where}: "${key}" uses plural form _${match[1]}; this app only uses _one/_other (+ optional _zero)`);
    }
  }
  for (const [base, forms] of bases) {
    if (!forms.has('one') || !forms.has('other')) {
      report(`${where}: plural "${base}" needs both ${base}_one and ${base}_other`);
    }
    if (keys.has(base)) {
      report(`${where}: "${base}" exists both as a plain key and as a plural`);
    }
  }
}

let keyCount = 0;
for (const ns of [...namespaces].sort()) {
  if (wired.size && !wired.has(ns)) {
    report(`${ns}: not listed in src/i18n/resources.ts NAMESPACES (and not imported there)`);
  }
  const sourceJson = load(SOURCE, ns);
  if (!sourceJson) continue;
  const source = flatten(sourceJson, '', new Map(), `${SOURCE}/${ns}`);
  keyCount += source.size;
  for (const [key, value] of source) {
    if (value.trim() === '') report(`${SOURCE}/${ns}: "${key}" is empty`);
  }
  checkPlurals(new Set(source.keys()), `${SOURCE}/${ns}`);

  for (const locale of targets) {
    const targetJson = load(locale, ns);
    if (!targetJson) continue;
    const where = `${locale}/${ns}`;
    const target = flatten(targetJson, '', new Map(), where);
    checkPlurals(new Set(target.keys()), where);

    for (const [key, sourceValue] of source) {
      if (!target.has(key)) {
        report(`${where}: missing "${key}" (pt-BR: ${JSON.stringify(sourceValue)})`);
        continue;
      }
      const value = target.get(key);
      if (value.trim() === '') {
        report(`${where}: "${key}" is empty`);
        continue;
      }
      const expected = tokens(sourceValue).join(' ');
      const actual = tokens(value).join(' ');
      if (expected !== actual) {
        report(`${where}: "${key}" placeholders differ — pt-BR [${expected}] vs ${locale} [${actual}]`);
      }
      if (warnSame && value === sourceValue && /[a-zA-Z]{3,}/.test(value)) {
        warnings.push(`${where}: "${key}" same as pt-BR: ${JSON.stringify(value)}`);
      }
    }
    for (const key of target.keys()) {
      if (!source.has(key)) report(`${where}: extra "${key}" (not in pt-BR)`);
    }
  }
}

// Native strings (app.config.ts `locales`): same keys in every language, no empty values.
const nativeDir = join(localesDir, 'native');
if (existsSync(nativeDir)) {
  const files = readdirSync(nativeDir).filter((file) => file.endsWith('.json'));
  const parsed = files.map((file) => {
    try {
      return [file, JSON.parse(readFileSync(join(nativeDir, file), 'utf8'))];
    } catch (error) {
      report(`native/${file}: invalid JSON (${error.message})`);
      return [file, null];
    }
  });
  const reference = parsed.find(([, json]) => json);
  for (const [file, json] of parsed) {
    if (!json || !reference) continue;
    const expected = Object.keys(reference[1]).sort().join(', ');
    const actual = Object.keys(json).sort().join(', ');
    if (expected !== actual) report(`native/${file}: keys [${actual}] differ from native/${reference[0]} [${expected}]`);
    for (const [key, value] of Object.entries(json)) {
      if (typeof value !== 'string' || value.trim() === '') report(`native/${file}: "${key}" is empty or not a string`);
    }
  }
}

// Components: text that must follow a live language switch.
{
  /** Helpers that read the global language unless given `{ locale }`. */
  const LOCALE_HELPERS = [
    'categoryLabel',
    'displayName',
    'formatRecurrence',
    'getRepeatOptionLabel',
    'formatReminder',
    'formatReminderWithChannel',
    'getChannelLabel',
    'getPresetLabel',
  ];
  const tsxFiles = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return tsxFiles(path);
      return entry.name.endsWith('.tsx') ? [path] : [];
    });
  /** Text between the parentheses of the call whose `(` is at `open`. */
  const callArguments = (source, open) => {
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '(') depth += 1;
      if (source[i] === ')') depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
    return source.slice(open + 1);
  };
  const srcDir = join(root, 'src');
  for (const file of tsxFiles(srcDir)) {
    const source = readFileSync(file, 'utf8');
    const name = file.slice(srcDir.length + 1);
    for (const helper of LOCALE_HELPERS) {
      for (const match of source.matchAll(new RegExp(`\\b${helper}\\(`, 'g'))) {
        const args = callArguments(source, match.index + helper.length);
        if (!/\blocale\b/.test(args)) report(`${name}: ${helper}(${args}) needs { locale } from useLocale()`);
      }
    }
    if (/\bi18n\.t\(/.test(source)) report(`${name}: i18n.t( in a component; use t() from useTranslation`);
    if (/\bpreset\.label\b/.test(source)) report(`${name}: preset.label; use getPresetLabel(preset, { locale })`);
  }
}

for (const warning of warnings) console.warn(`warn  ${warning}`);

if (problems.length) {
  for (const problem of problems) console.error(`error ${problem}`);
  console.error(`\ncheck:locales: ${problems.length} problem(s) in ${namespaces.size} namespaces.`);
  process.exit(1);
}

process.stdout.write(
  `check:locales: OK — ${namespaces.size} namespaces, ${keyCount} pt-BR keys, compared with ${targets.join(', ') || 'no other locale'}.\n`,
);
