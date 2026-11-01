/**
 * Notas → tarefas: the AI summary's "Próximos passos" (TipTap task items)
 * become Jarvi tasks. Pure helpers; the writes live in noteService.
 *
 * - `parseNextStep`: item text → task title, due date and time, with the
 *   deterministic rules of agent/core/dateExpressions.ts. Only ONE concrete
 *   day becomes the due date: a period ("semana que vem") never does (ADR
 *   0002, item 4), and neither do two different days. The words that became
 *   the due date are cut from the title ("… até quinta-feira" → "…"). Days
 *   resolve against the note's day (the meeting), not the conversion day.
 * - Next step identity: every summary task item carries `attrs.stepId`, an id
 *   the server (or the client, for an item typed by the user) generates —
 *   never the model. The step → task link lives in `note_step_tasks`;
 *   `attrs.taskId` is a mirror the server rewrites from it on every summary
 *   write (`normalizeSummarySteps`), so the client's completion sync keeps
 *   reading it.
 * - `reconcileRegeneratedSteps`: a regenerated summary keeps the identity of
 *   the steps it repeats — same text (or a wording the step is known by), or
 *   a rewording the model marks with the step's alias AND that the texts
 *   back up (see "Same-step evidence"). A linked step it drops is kept as it
 *   was; a new item that may be the same as a step with a task is flagged
 *   (`attrs.reviewOf`) instead of being linked or offered, until the user
 *   answers (`applyStepDecision`).
 */

import type { PMDoc, PMNode } from '../utils/markdownToTiptapDoc';
import { extractTimeFromText } from '../utils/taskTime';
import { capitalizeTaskTitle } from '../utils/taskTitle';
import { detectDateExpressions, isPeriodKind, type DateExpression } from './agent/core/dateExpressions';
import { addDaysToIsoDate } from './agent/core/tasks';
import { getDateTimeForTimezone } from './agent/core/time';

const TASK_TITLE_MAX_CHARS = 300;

export interface ParsedNextStep {
  title: string;
  /** YYYY-MM-DD */
  dueDate: string | null;
  /** HH:MM, only alongside a due date */
  time: string | null;
}

type Range = { start: number; end: number };

/**
 * "segunda versão", "quarta etapa": ordinals, not weekdays. A bare weekday
 * (no "-feira", no "próxima"/"que vem") counts as a day only when what follows
 * is the end of the item, punctuation, a time, or one of these words. An
 * unknown word means no due date — the safe miss.
 */
const WORDS_AFTER_WEEKDAY = new Set([
  'que', 'da', 'de', 'do', 'das', 'dos', 'às', 'as', 'à', 'a', 'ao', 'o', 'os', 'um', 'uma',
  'pela', 'pelo', 'cedo', 'e', 'ou', 'para', 'pra', 'com', 'no', 'na', 'em', 'até', 'ate',
  'antes', 'depois', 'logo', 'mesmo', 'sem', 'já', 'eu', 'ele', 'ela', 'eles', 'elas',
  'você', 'vocês', 'nós', 'feira',
]);

function isWeekdayAsDay(text: string, expr: DateExpression): boolean {
  if (expr.kind !== 'weekday') return true;
  // A bare weekday right before "-" is "sexta-feira passada" cut short.
  if (text.charAt(expr.index + expr.text.length) === '-') return false;
  if (expr.nextWeekQualifier || /-feira$/i.test(expr.text)) return true;
  // sábado / domingo are never ordinals; "até sexta" is a deadline.
  if (expr.weekday === 0 || expr.weekday === 6) return true;
  const before = text.slice(0, expr.index);
  if (/(?:^|\s)at[ée]\s+$/iu.test(before)) return true;
  const next = /^\s+([\p{L}]+)/u.exec(text.slice(expr.index + expr.text.length));
  // "a segunda e a terceira versão": after a lone article, a weekday followed
  // by more words is an ordinal ("até a sexta", "para a segunda" stay days).
  if (
    next &&
    /(?:^|\s)(?:a|o|as|os)\s+$/iu.test(before) &&
    !/(?:^|\s)(?:at[ée]|para|pra)\s+(?:a|o|as|os)\s+$/iu.test(before)
  ) {
    return false;
  }
  return !next || WORDS_AFTER_WEEKDAY.has(next[1].toLowerCase());
}

/** The preposition left hanging once the date is cut ("até", "no dia", "para o"). */
const DANGLING_BEFORE_DATE =
  /(?:^|\s)(?:(?:(?:at[ée]|para|pra|em)(?:\s+(?:o|a|os|as))?|no|na|nos|nas|pro|de|do|da|antes\s+d[eoa]|a\s+partir\s+d[eoa])(?:\s+dia)?|dia)\s*$/iu;

/** The span cut from the title for a date expression, with its preposition. */
function dateRange(text: string, expr: DateExpression): Range {
  let end = expr.index + expr.text.length;
  // "segunda feira" (no hyphen): the weekday matcher stops before "feira".
  const feira = expr.kind === 'weekday' ? /^\s+feira(?![\p{L}\p{N}])/iu.exec(text.slice(end)) : null;
  if (feira) end += feira[0].length;
  const dangling = DANGLING_BEFORE_DATE.exec(text.slice(0, expr.index));
  return { start: dangling ? dangling.index : expr.index, end };
}

/**
 * Clock times written next to a day: "às 14h", "pelas 9h30", "a partir das
 * 10:00", or a bare "14h30" / "14:30". A bare "14h" is ambiguous ("3h de
 * vídeo") and is left alone.
 */
const TIME_TOKEN =
  /(?:(?<![\p{L}\p{N}])(?:(?:at[ée]\s+)?[àa]s|pelas|a\s+partir\s+das)\s+)?(?<![\p{L}\p{N}])(\d{1,2})(?:\s*:\s*(\d{2})|\s*h(?:\s*(\d{2}))?(?:\s*min)?)(?![\p{L}\p{N}])/giu;

/** The time `extractTimeFromText` reads, when its token can be located (and cut). */
function locateTime(text: string, taken: Range[]): { time: string; range: Range } | null {
  const expected = extractTimeFromText(text);
  if (!expected) return null;
  TIME_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_TOKEN.exec(text)) !== null) {
    const minutes = m[2] ?? m[3];
    const anchored = /^\D/.test(m[0]);
    if (!anchored && minutes === undefined) continue;
    // "workshop de 2h30", "reunião de 1h30": a duration, not the clock time.
    if (!anchored && /(?:^|\s)de\s*$/iu.test(text.slice(0, m.index))) continue;
    const time = `${m[1].padStart(2, '0')}:${minutes ?? '00'}`;
    if (time !== expected) continue;
    const range = { start: m.index, end: m.index + m[0].length };
    if (taken.some((r) => range.start < r.end && r.start < range.end)) continue;
    return { time, range };
  }
  return null;
}

function cutRanges(text: string, ranges: Range[]): string {
  let out = text;
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  let floor = Infinity;
  for (const range of sorted) {
    // Overlapping ranges: cut each character once.
    const end = Math.min(range.end, floor);
    if (end > range.start) out = `${out.slice(0, range.start)} ${out.slice(end)}`;
    floor = Math.min(floor, range.start);
  }
  return out;
}

/** Trimmed, whitespace collapsed, no dangling separators or trailing period. */
function tidyTitle(text: string): string {
  return text
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+([,.;:!?)\]])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s,;:–—-]+/u, '')
    .replace(/[\s.,;:–—-]+$/u, '')
    .trim();
}

/**
 * A next step as a task: the date words that became the due date (and the
 * time next to them) are cut from the title. Days resolve against
 * `referenceIso` (YYYY-MM-DD, the note's day: the next steps were said in
 * that meeting), else today in `timezone`. A deadline that already passed
 * stays in the past (overdue) instead of rolling forward.
 */
export function parseNextStep(raw: string, timezone: string, referenceIso?: string): ParsedNextStep {
  const text = raw.replace(/\s+/g, ' ').trim();
  const today =
    referenceIso && /^\d{4}-\d{2}-\d{2}$/.test(referenceIso)
      ? referenceIso
      : getDateTimeForTimezone(timezone).isoDate;
  const expressions = detectDateExpressions(text, timezone, { todayIso: today })
    .filter(
      // "ontem" is narrative ("o e-mail de ontem"), never the deadline.
      (expr) => expr.kind !== 'yesterday' && isWeekdayAsDay(text, expr),
    )
    .map((expr) => {
      // A bare weekday named on that same day ("até quinta" in a Thursday
      // meeting) means next week's: that day would be "hoje".
      if (expr.kind === 'weekday' && !expr.nextWeekQualifier && expr.resolved && expr.resolved === today) {
        return { ...expr, resolved: addDaysToIsoDate(expr.resolved, 7) };
      }
      return expr;
    });

  let dueDate: string | null = null;
  const ranges: Range[] = [];
  const days = expressions.filter((expr) => !isPeriodKind(expr.kind) && expr.resolved);
  const single = days.length > 0 && days.every((expr) => expr.resolved === days[0].resolved);
  if (single && !expressions.some((expr) => isPeriodKind(expr.kind))) {
    dueDate = days[0].resolved ?? null;
    ranges.push(...days.map((expr) => dateRange(text, expr)));
  }

  let time: string | null = null;
  if (dueDate) {
    const located = locateTime(text, ranges);
    if (located) {
      time = located.time;
      ranges.push(located.range);
    }
  }

  let title = tidyTitle(cutRanges(text, ranges));
  // Nothing but the date ("Amanhã."): keep the words as they were.
  if (!/[\p{L}\p{N}]/u.test(title)) title = tidyTitle(text);
  return { title: capitalizeTaskTitle(title).slice(0, TASK_TITLE_MAX_CHARS), dueDate, time };
}

/** "Criada a partir da nota “…”." — the task's description. */
export function noteTaskDescription(noteTitle: string | null | undefined): string {
  const title = (noteTitle ?? '').replace(/\s+/g, ' ').trim() || 'Nova nota';
  return `Criada a partir da nota “${title}”.`;
}

// ---------------------------------------------------------------------------
// Summary regeneration
// ---------------------------------------------------------------------------

/** Lowercase, accents folded, punctuation and whitespace collapsed. */
export function normalizeTaskItemText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LIST_TYPES = new Set(['taskList', 'bulletList', 'orderedList']);

/** The item's own text; a nested list is made of items of its own. */
function taskItemText(item: PMNode): string {
  const parts: string[] = [];
  const walk = (node: PMNode) => {
    if (node.type === 'text') {
      parts.push(node.text ?? '');
      return;
    }
    if (node.type === 'hardBreak') {
      parts.push(' ');
      return;
    }
    if (LIST_TYPES.has(node.type)) return;
    (node.content ?? []).forEach(walk);
    parts.push(' ');
  };
  (item.content ?? []).forEach(walk);
  return parts.join('');
}

function collectTaskItems(node: PMNode, out: PMNode[]): PMNode[] {
  if (node.type === 'taskItem') out.push(node);
  (Array.isArray(node.content) ? node.content : []).forEach((child) => collectTaskItems(child, out));
  return out;
}

function parseDoc(raw: string | null | undefined): PMNode | null {
  if (!raw || !raw.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.type === 'doc' ? (parsed as PMNode) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Next step identity
// ---------------------------------------------------------------------------

/** A step id: a UUID from the server or the client (`crypto.randomUUID`). */
const STEP_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function isValidStepId(value: unknown): value is string {
  return typeof value === 'string' && STEP_ID_RE.test(value);
}

/** A step → task link (`note_step_tasks`), with the step's last known text. */
export interface StepLink {
  stepId: string;
  taskId: string;
  text: string;
}

function readStepId(item: PMNode): string | null {
  const value = item.attrs?.stepId;
  return isValidStepId(value) ? value : null;
}

function readTaskId(item: PMNode): string | null {
  const value = item.attrs?.taskId;
  return typeof value === 'string' && value !== '' ? value : null;
}

function setAttrs(item: PMNode, patch: Record<string, unknown>): boolean {
  const attrs = { ...(item.attrs ?? {}) };
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      if (key in attrs) {
        delete attrs[key];
        changed = true;
      }
    } else if (attrs[key] !== value) {
      attrs[key] = value;
      changed = true;
    }
  }
  if (changed) item.attrs = attrs;
  return changed;
}

export function parseSummaryDoc(raw: string | null | undefined): PMDoc | null {
  return parseDoc(raw) as PMDoc | null;
}

/** Plain text of every task item, in document order. */
export function summaryStepTexts(doc: PMDoc): Array<{ stepId: string | null; taskId: string | null; text: string }> {
  return collectTaskItems(doc as PMNode, []).map((item) => ({
    stepId: readStepId(item),
    taskId: readTaskId(item),
    text: taskItemText(item).replace(/\s+/g, ' ').trim(),
  }));
}

/** Task ids of items with no step id yet: summaries saved before step ids. */
export function legacyLinkedTaskIds(doc: PMDoc): string[] {
  const ids = new Set<string>();
  for (const item of collectTaskItems(doc as PMNode, [])) {
    const taskId = readTaskId(item);
    if (taskId && !readStepId(item)) ids.add(taskId);
  }
  return [...ids];
}

/**
 * Makes the doc agree with the server links (mutates `doc`):
 * - a step id seen twice (an item copied in the editor) is dropped from the
 *   later copies, with their link;
 * - an item with no step id but a `taskId` takes the step of that task's link
 *   (a summary from before step ids), else loses the `taskId`;
 * - `assignMissing` gives the remaining items a new id (`newId`);
 * - `attrs.taskId` is set from the links, and removed where there is none.
 * Returns whether anything changed.
 */
export function normalizeSummarySteps(
  doc: PMDoc,
  links: StepLink[],
  options: { assignMissing: boolean; newId: () => string },
): boolean {
  const linkByStep = new Map(links.map((link) => [link.stepId, link]));
  const linkByTask = new Map(links.map((link) => [link.taskId, link]));
  const seen = new Set<string>();
  let changed = false;

  for (const item of collectTaskItems(doc as PMNode, [])) {
    let stepId = readStepId(item);
    if (stepId && seen.has(stepId)) {
      stepId = null;
      changed = setAttrs(item, { stepId: undefined, taskId: undefined, reviewOf: undefined }) || changed;
    }
    if (!stepId) {
      const legacy = readTaskId(item);
      const link = legacy ? linkByTask.get(legacy) : undefined;
      if (link && !seen.has(link.stepId)) stepId = link.stepId;
      else if (options.assignMissing) stepId = options.newId();
    }
    if (!stepId) {
      changed = setAttrs(item, { taskId: undefined }) || changed;
      continue;
    }
    seen.add(stepId);
    changed = setAttrs(item, { stepId, taskId: linkByStep.get(stepId)?.taskId }) || changed;
  }
  return changed;
}

/** Unchecks the items of these steps (their tasks were just created, open). */
export function uncheckSteps(doc: PMDoc, stepIds: ReadonlySet<string>): boolean {
  let changed = false;
  for (const item of collectTaskItems(doc as PMNode, [])) {
    const stepId = readStepId(item);
    if (stepId && stepIds.has(stepId)) changed = setAttrs(item, { checked: false }) || changed;
  }
  return changed;
}

/**
 * What the user set on a next step that is not a task yet (the note shows it
 * with the task row's date and category controls): `attrs.dueDate`
 * (YYYY-MM-DD), `attrs.time` (HH:MM), `attrs.category`. Used when the step
 * becomes a task, and kept by regenerations.
 */
export interface StepPlan {
  dueDate: string | null;
  time: string | null;
  category: string | null;
}

function readStepPlan(item: PMNode): StepPlan {
  const attrs = item.attrs ?? {};
  const dueDate = typeof attrs.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(attrs.dueDate) ? attrs.dueDate : null;
  const time = typeof attrs.time === 'string' && /^\d{2}:\d{2}$/.test(attrs.time) ? attrs.time : null;
  const category =
    typeof attrs.category === 'string' && attrs.category.trim() && attrs.category.length <= 100
      ? attrs.category.trim()
      : null;
  return { dueDate, time, category };
}

/** The plan of every step that has one, by step id. */
export function stepPlans(doc: PMDoc | null): Map<string, StepPlan> {
  const plans = new Map<string, StepPlan>();
  if (!doc) return plans;
  for (const item of collectTaskItems(doc as PMNode, [])) {
    const stepId = readStepId(item);
    const plan = readStepPlan(item);
    if (stepId && (plan.dueDate || plan.time || plan.category)) plans.set(stepId, plan);
  }
  return plans;
}

/** Step ids flagged by a regeneration as maybe the same as a linked step. */
export function stepsUnderReview(doc: PMDoc | null): Set<string> {
  const ids = new Set<string>();
  if (!doc) return ids;
  for (const item of collectTaskItems(doc as PMNode, [])) {
    const stepId = readStepId(item);
    if (stepId && isValidStepId(item.attrs?.reviewOf)) ids.add(stepId);
  }
  return ids;
}

/** Some item has no step id yet (typed by the user, or saved before step ids). */
export function hasStepsWithoutId(doc: PMDoc): boolean {
  return collectTaskItems(doc as PMNode, []).some((item) => !readStepId(item));
}

// ---------------------------------------------------------------------------
// Summary regeneration
// ---------------------------------------------------------------------------

/** What the model sees of the previous next steps: `[p1] texto`. */
export interface PromptStep {
  alias: string;
  stepId: string;
  text: string;
}

/** The previous summary's next steps, with the aliases the model may cite. */
export function promptStepsFor(doc: PMDoc | null): PromptStep[] {
  if (!doc) return [];
  const steps: PromptStep[] = [];
  for (const item of collectTaskItems(doc as PMNode, [])) {
    const stepId = readStepId(item);
    const text = taskItemText(item).replace(/\s+/g, ' ').trim();
    if (stepId && text) steps.push({ alias: `p${steps.length + 1}`, stepId, text });
  }
  return steps;
}

/** "[p3] " the model puts in front of a step that continues a previous one. */
const STEP_ALIAS_RE = /^\s*\[(p\d{1,3})\]\s*/i;

/** Removes the alias marker from the item's first text, returning the alias. */
function takeStepAlias(item: PMNode): string | null {
  const paragraph = (item.content ?? []).find((child) => child.type === 'paragraph');
  const first = paragraph?.content?.[0];
  if (!paragraph || first?.type !== 'text' || !first.text) return null;
  const match = STEP_ALIAS_RE.exec(first.text);
  if (!match) return null;
  const rest = first.text.slice(match[0].length);
  if (rest) first.text = rest;
  else paragraph.content = paragraph.content!.slice(1);
  return match[1].toLowerCase();
}

/** A wording a step is known by (`note_step_wordings`). */
export interface StepWording {
  stepId: string;
  /** As written */
  text: string;
  /** "É outro passo": the step with a task the user said this one is not */
  distinctFrom: string | null;
}

// ---------------------------------------------------------------------------
// Same-step evidence
//
// Shared words alone never make two items the same step. A step is matched by
// its exact text (or a wording it is known by), or by the model's claim when
// the texts back it up: most of their words agree, nothing contradicts — the
// owner ("Ana: …"), the action, its object ("proposta comercial" is not
// "proposta técnica"), the people or products named, numbers and codes,
// dates — and no other step is closer. Anything weaker on a step with a task
// is asked to the user instead.
// ---------------------------------------------------------------------------

const STEP_STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma',
  'para', 'pra', 'por', 'com', 'que', 'ao', 'aos', 'se', 'ou', 'sobre', 'ate', 'sem', 'mais', 'muito',
  'feira',
]);

/** Words that end the action's object ("enviar a proposta | para a Acme"). */
const OBJECT_ENDS = new Set([
  'para', 'pra', 'com', 'ate', 'no', 'na', 'nos', 'nas', 'em', 'de', 'da', 'do', 'das', 'dos', 'ao', 'aos', 'a',
  'por', 'pelo', 'pela', 'sobre', 'antes', 'depois', 'durante', 'entre', 'sem', 'via', 'e', 'ou', 'que', 'se',
]);
const LEADING_ARTICLES = new Set(['a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas']);

const WHEN_WORDS = new Set([
  'hoje', 'amanha', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo',
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro',
  'outubro', 'novembro', 'dezembro',
]);

/**
 * Leading verbs grouped by action, matched by root. Two known actions that
 * differ ("enviar" / "revisar") contradict; an unknown verb says nothing.
 */
const ACTION_ROOTS: ReadonlyArray<[root: string, action: string]> = (
  [
    ['envi', 'enviar'], ['mand', 'enviar'], ['encaminh', 'enviar'], ['remet', 'enviar'], ['submet', 'enviar'],
    ['ligar', 'ligar'], ['ligue', 'ligar'], ['telefon', 'ligar'],
    ['revis', 'revisar'], ['rever', 'revisar'], ['revej', 'revisar'],
    ['verific', 'verificar'], ['checa', 'verificar'], ['chequ', 'verificar'], ['confer', 'verificar'],
    ['valid', 'verificar'], ['test', 'verificar'],
    ['agend', 'agendar'], ['marca', 'agendar'], ['marqu', 'agendar'],
    ['cria', 'criar'], ['crie', 'criar'], ['elabor', 'criar'], ['prepar', 'criar'], ['redig', 'criar'],
    ['escrev', 'criar'], ['mont', 'criar'], ['produz', 'criar'],
    ['defin', 'definir'], ['decid', 'definir'], ['escolh', 'definir'],
    ['apresent', 'apresentar'], ['mostr', 'apresentar'], ['demonstr', 'apresentar'],
    ['atualiz', 'atualizar'],
    ['contrat', 'contratar'],
    ['falar', 'falar'], ['fale', 'falar'], ['convers', 'falar'], ['alinh', 'falar'], ['contat', 'falar'],
    ['compr', 'comprar'], ['adquir', 'comprar'],
    ['pag', 'pagar'],
    ['public', 'publicar'], ['divulg', 'publicar'], ['lanc', 'publicar'],
    ['corrig', 'corrigir'], ['consert', 'corrigir'], ['arrum', 'corrigir'], ['resolv', 'corrigir'],
    ['pesquis', 'investigar'], ['investig', 'investigar'], ['analis', 'investigar'], ['avali', 'investigar'],
    ['estud', 'investigar'],
    ['implement', 'implementar'], ['desenvolv', 'implementar'], ['constru', 'implementar'],
    ['document', 'documentar'], ['registr', 'documentar'], ['anot', 'documentar'],
    ['organiz', 'organizar'],
    ['cancel', 'cancelar'],
    ['remov', 'remover'], ['exclu', 'remover'], ['apag', 'remover'],
  ] as Array<[string, string]>
).sort((a, b) => b[0].length - a[0].length);

/** "Ana: …", "Ana e Diego: …" — the owner the model puts in front of a step. */
const OWNER_RE = /^\s*(\p{Lu}[\p{L}'’.-]*(?:\s+[\p{L}'’.-]+){0,3})\s*:\s+/u;
const DATE_RE = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g;

interface StepSignals {
  norm: string;
  /**
   * Content words, cut to a 5-letter stem ("revisar" / "revisão" → "revis");
   * a recognized leading verb is left out (compared as `action`)
   */
  stems: Set<string>;
  owner: string | null;
  action: string | null;
  /** Capitalized words after the first one: people, products ("Google", "API") */
  names: Set<string>;
  /** Numbers, codes and lone capital letters ("Q3", "v2", "cliente A") */
  marks: Set<string>;
  /** Weekdays, months and dates */
  when: Set<string>;
  /** The words right after the leading verb, up to a preposition ("proposta comercial") */
  object: Set<string>;
}

function stepSignals(text: string): StepSignals {
  const clean = text.replace(/\s+/g, ' ').trim();
  const ownerMatch = OWNER_RE.exec(clean);
  const body = ownerMatch ? clean.slice(ownerMatch[0].length) : clean;
  const words = body.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const signals: StepSignals = {
    norm: normalizeTaskItemText(clean),
    stems: new Set(),
    owner: ownerMatch ? normalizeTaskItemText(ownerMatch[1]) : null,
    action: null,
    names: new Set(),
    marks: new Set(),
    when: new Set(body.match(DATE_RE) ?? []),
    object: new Set(),
  };
  words.forEach((word, index) => {
    const folded = normalizeTaskItemText(word);
    if (!folded) return;
    if (/\d/.test(folded)) {
      signals.marks.add(folded);
      return;
    }
    if (WHEN_WORDS.has(folded)) signals.when.add(folded);
    else if (index > 0 && /^\p{Lu}/u.test(word)) {
      if (word.length === 1) {
        signals.marks.add(folded);
        return;
      }
      signals.names.add(folded);
    }
    if (folded.length >= 3 && !STEP_STOPWORDS.has(folded)) signals.stems.add(folded.slice(0, 5));
  });
  const first = words.length > 0 ? normalizeTaskItemText(words[0]) : '';
  signals.action = ACTION_ROOTS.find(([root]) => first.startsWith(root))?.[1] ?? null;
  // "enviar" / "mandar" are one action: the verb is not a content word.
  if (signals.action) signals.stems.delete(first.slice(0, 5));
  for (let i = 1; i < words.length; i += 1) {
    const folded = normalizeTaskItemText(words[i]);
    if (signals.object.size === 0 && LEADING_ARTICLES.has(folded)) continue;
    if (OBJECT_ENDS.has(folded) || /\d/.test(folded) || WHEN_WORDS.has(folded)) break;
    if (folded.length >= 3) signals.object.add(folded.slice(0, 5));
  }
  return signals;
}

function differs(a: string | null, b: string | null): boolean {
  return !!a && !!b && a !== b;
}

/** Both name something, and nothing in common. */
function disjoint(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  for (const value of a) if (b.has(value)) return false;
  return true;
}

/** Both have an object and neither contains the other ("proposta" fits "proposta comercial"). */
function differentObjects(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const value of small) if (!large.has(value)) return true;
  return false;
}

function contradicts(a: StepSignals, b: StepSignals): boolean {
  return (
    differs(a.owner, b.owner) ||
    differs(a.action, b.action) ||
    differentObjects(a.object, b.object) ||
    disjoint(a.names, b.names) ||
    disjoint(a.marks, b.marks) ||
    disjoint(a.when, b.when)
  );
}

/** Most of the words must agree (Dice), and at least two when both have them. */
const SAME_STEP_MIN_AGREEMENT = 0.5;

/** How much two wordings agree, 0 when they contradict or share too little. */
function agreement(a: StepSignals, b: StepSignals): number {
  if (contradicts(a, b)) return 0;
  let shared = 0;
  a.stems.forEach((stem) => {
    if (b.stems.has(stem)) shared += 1;
  });
  const total = a.stems.size + b.stems.size;
  if (total === 0) return 0;
  const dice = (2 * shared) / total;
  const needed = Math.max(1, Math.min(2, a.stems.size, b.stems.size));
  return shared >= needed && dice >= SAME_STEP_MIN_AGREEMENT ? dice : 0;
}

// ---------------------------------------------------------------------------
// Regeneration
// ---------------------------------------------------------------------------

interface StepCandidate {
  stepId: string;
  /** Every wording the step is known by: its item, its link, confirmed ones */
  wordings: StepSignals[];
  taskId: string | null;
  checked: boolean;
  /** The item in the previous summary (null: known only by its link or wordings) */
  node: PMNode | null;
  /** Still in doubt: the step with a task it may duplicate */
  reviewOf: string | null;
}

function bestAgreement(signals: StepSignals, candidate: StepCandidate): number {
  let best = 0;
  for (const wording of candidate.wordings) best = Math.max(best, agreement(signals, wording));
  return best;
}

export interface StepReconciliation {
  /** Steps with a task that kept their identity under a new wording */
  reworded: Array<{ stepId: string; text: string }>;
  /** New items flagged as maybe the same as a step with a task */
  review: Array<{ stepId: string; reviewOf: string }>;
  /** Steps with a task the new summary dropped, kept as they were */
  preserved: string[];
}

const NEXT_STEPS_HEADING = 'proximos passos';
const OPEN_QUESTIONS_HEADING = 'perguntas em aberto';

function headingText(node: PMNode): string {
  return node.type === 'heading' ? normalizeTaskItemText(taskItemText(node)) : '';
}

/** The "Próximos passos" task list, created (before "Perguntas em aberto") when missing. */
function nextStepsList(doc: PMDoc): PMNode {
  const blocks = doc.content;
  const headingIndex = blocks.findIndex((node) => headingText(node) === NEXT_STEPS_HEADING);
  if (headingIndex >= 0) {
    for (let i = headingIndex + 1; i < blocks.length && blocks[i].type !== 'heading'; i += 1) {
      if (blocks[i].type === 'taskList') return blocks[i];
    }
    const list: PMNode = { type: 'taskList', content: [] };
    blocks.splice(headingIndex + 1, 0, list);
    return list;
  }
  const list: PMNode = { type: 'taskList', content: [] };
  const heading: PMNode = {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: 'Próximos passos' }],
  };
  const questions = blocks.findIndex((node) => headingText(node) === OPEN_QUESTIONS_HEADING);
  blocks.splice(questions >= 0 ? questions : blocks.length, 0, heading, list);
  return list;
}

/**
 * Gives a regenerated summary's next steps their identity (mutates `doc`,
 * which still holds the model's `[pN]` markers; `previous` must already be
 * normalized). In order:
 * 1. same normalized text as a wording a step is known by → that step (a
 *    user's answer first, then steps with a task);
 * 2. a `[pN]` marker → that step, only when no other item claims it, the
 *    step is still free, the texts agree (`agreement`) and no other step
 *    agrees more. A claim that fails flags the item against the step with a
 *    task its text agrees with most (else the one the model named);
 * 3. an unclaimed item whose closest step has a task (or is still in doubt)
 *    and is not already in this summary is flagged too: words alone never
 *    link;
 * 4. every other item is a new step.
 * A matched item keeps its link, checked state, plan (date, category) and any open doubt; a flagged
 * item gets `reviewOf` and no link; a step with a task that `previous` showed
 * and the new summary dropped is put back as it was in "Próximos passos". A
 * wording the user said is another step is never matched to that step.
 * Tasks are never touched here.
 */
export function reconcileRegeneratedSteps(input: {
  doc: PMDoc;
  previous: PMDoc | null;
  links: StepLink[];
  wordings: StepWording[];
  /** Aliases shown to the model: alias → step id */
  aliases: ReadonlyMap<string, string>;
  newId: () => string;
}): StepReconciliation {
  const { doc, previous, links, wordings, aliases, newId } = input;
  const linkByStep = new Map(links.map((link) => [link.stepId, link]));

  const candidates = new Map<string, StepCandidate>();
  const candidateFor = (stepId: string): StepCandidate => {
    let candidate = candidates.get(stepId);
    if (!candidate) {
      candidate = {
        stepId,
        wordings: [],
        taskId: linkByStep.get(stepId)?.taskId ?? null,
        checked: false,
        node: null,
        reviewOf: null,
      };
      candidates.set(stepId, candidate);
    }
    return candidate;
  };
  for (const item of previous ? collectTaskItems(previous as PMNode, []) : []) {
    const stepId = readStepId(item);
    if (!stepId || candidates.get(stepId)?.node) continue;
    const candidate = candidateFor(stepId);
    candidate.node = item;
    candidate.checked = item.attrs?.checked === true;
    candidate.reviewOf = isValidStepId(item.attrs?.reviewOf) ? item.attrs.reviewOf : null;
    candidate.wordings.push(stepSignals(taskItemText(item)));
  }
  for (const link of links) {
    if (link.text) candidateFor(link.stepId).wordings.push(stepSignals(link.text));
  }
  const knownWordings = new Map<string, StepWording>();
  for (const wording of wordings) {
    candidateFor(wording.stepId).wordings.push(stepSignals(wording.text));
    knownWordings.set(normalizeTaskItemText(wording.text), wording);
  }
  const all = [...candidates.values()];
  const linkedFirst = [...all.filter((c) => c.taskId), ...all.filter((c) => !c.taskId)];
  // An open doubt only counts while its step still has a task.
  const openDoubt = (candidate: StepCandidate): string | null =>
    candidate.reviewOf && candidates.get(candidate.reviewOf)?.taskId ? candidate.reviewOf : null;

  /** The step the wording agrees with most (ties: the first one, steps with a task first). */
  const closestStep = (signals: StepSignals, notStep: string | null) => {
    let best: { candidate: StepCandidate; score: number } | null = null;
    for (const candidate of linkedFirst) {
      if (candidate.stepId === notStep) continue;
      const score = bestAgreement(signals, candidate);
      if (score > 0 && (!best || score > best.score)) best = { candidate, score };
    }
    return best;
  };
  /** The step with a task an item close to `candidate` may duplicate. */
  const doubtOf = (candidate: StepCandidate): string | null =>
    candidate.taskId ? candidate.stepId : openDoubt(candidate);

  const items = collectTaskItems(doc as PMNode, []).map((node) => {
    const alias = takeStepAlias(node);
    const signals = stepSignals(taskItemText(node));
    return { node, alias, signals, notStep: knownWordings.get(signals.norm)?.distinctFrom ?? null };
  });

  const matched = new Set<string>();
  const assigned = new Map<PMNode, { candidate: StepCandidate; claimed: boolean }>();
  const reviewOf = new Map<PMNode, string>();

  // 1. Same text
  for (const item of items) {
    const norm = item.signals.norm;
    if (!norm) continue;
    const known = knownWordings.get(norm);
    let candidate = known && !matched.has(known.stepId) ? candidates.get(known.stepId) : undefined;
    candidate ??= linkedFirst.find(
      (c) => !matched.has(c.stepId) && c.stepId !== item.notStep && c.wordings.some((w) => w.norm === norm),
    );
    if (!candidate) continue;
    matched.add(candidate.stepId);
    assigned.set(item.node, { candidate, claimed: false });
  }

  // 2. Claimed by the model, backed up by the texts
  const claims = new Map<string, number>();
  for (const item of items) {
    if (item.alias && !assigned.has(item.node)) claims.set(item.alias, (claims.get(item.alias) ?? 0) + 1);
  }
  for (const item of items) {
    if (!item.alias || assigned.has(item.node)) continue;
    const stepId = aliases.get(item.alias);
    const target = stepId ? candidates.get(stepId) : undefined;
    if (!target || target.stepId === item.notStep) continue;
    const own = bestAgreement(item.signals, target);
    const closest = closestStep(item.signals, item.notStep);
    if (!matched.has(target.stepId) && claims.get(item.alias) === 1 && own > 0 && closest?.candidate === target) {
      matched.add(target.stepId);
      assigned.set(item.node, { candidate: target, claimed: true });
      continue;
    }
    // Doubtful claim: ask about the step the text agrees with most (the model
    // may have mixed two steps up), else about the one it named.
    const doubt =
      closest && !matched.has(closest.candidate.stepId)
        ? doubtOf(closest.candidate)
        : target.taskId
          ? target.stepId
          : openDoubt(target);
    if (doubt && doubt !== item.notStep) reviewOf.set(item.node, doubt);
  }

  // 3. Unclaimed, but close to a step with a task (or to one still in doubt).
  // Closest to a step this summary already shows: most likely another step.
  for (const item of items) {
    if (assigned.has(item.node) || reviewOf.has(item.node)) continue;
    const closest = closestStep(item.signals, item.notStep);
    const doubt = closest && !matched.has(closest.candidate.stepId) ? doubtOf(closest.candidate) : null;
    if (doubt && doubt !== item.notStep) reviewOf.set(item.node, doubt);
  }

  const result: StepReconciliation = { reworded: [], review: [], preserved: [] };
  for (const { node } of items) {
    const match = assigned.get(node);
    if (match) {
      const { candidate } = match;
      // The step keeps what the user did on it: done, date, category.
      const plan = candidate.node ? readStepPlan(candidate.node) : null;
      setAttrs(node, {
        stepId: candidate.stepId,
        taskId: candidate.taskId ?? undefined,
        reviewOf: openDoubt(candidate) ?? undefined,
        ...(candidate.taskId || candidate.node ? { checked: candidate.checked } : {}),
        dueDate: plan?.dueDate ?? undefined,
        time: plan?.time ?? undefined,
        category: plan?.category ?? undefined,
      });
      if (match.claimed && candidate.taskId) {
        result.reworded.push({ stepId: candidate.stepId, text: taskItemText(node).replace(/\s+/g, ' ').trim() });
      }
      continue;
    }
    const stepId = newId();
    const doubt = reviewOf.get(node);
    setAttrs(node, { stepId, taskId: undefined, reviewOf: doubt });
    if (doubt) result.review.push({ stepId, reviewOf: doubt });
  }

  // Steps with a task the previous summary showed and the new one dropped.
  for (const candidate of all) {
    if (!candidate.taskId || !candidate.node || matched.has(candidate.stepId)) continue;
    const copy = JSON.parse(JSON.stringify(candidate.node)) as PMNode;
    setAttrs(copy, { taskId: candidate.taskId, reviewOf: undefined });
    const list = nextStepsList(doc);
    list.content = [...(list.content ?? []), copy];
    result.preserved.push(candidate.stepId);
  }

  return result;
}

// ---------------------------------------------------------------------------
// The user's answer to a doubtful step
// ---------------------------------------------------------------------------

export type StepDecision = 'same' | 'distinct';

/** The step with a task the item `stepId` may duplicate; null when it is not in doubt. */
export function stepReviewTarget(doc: PMDoc | null, stepId: string): string | null {
  if (!doc) return null;
  const item = collectTaskItems(doc as PMNode, []).find((node) => readStepId(node) === stepId);
  const target = item?.attrs?.reviewOf;
  return item && isValidStepId(target) ? target : null;
}

/** Drops these items, and any task list left empty, from `node`'s descendants. */
function removeTaskItems(node: PMNode, removed: ReadonlySet<PMNode>): void {
  if (!Array.isArray(node.content)) return;
  node.content = node.content.filter((child) => !removed.has(child));
  node.content.forEach((child) => removeTaskItems(child, removed));
  node.content = node.content.filter((child) => child.type !== 'taskList' || (child.content?.length ?? 0) > 0);
}

/**
 * Applies the user's answer to "is this step the one that already has a
 * task?" (mutates `doc`):
 * - `same`: the item takes that step's identity, link and checked state
 *   (`taskCompleted` when the task is known, else the step's other copy);
 *   that other copy leaves the summary — the new wording stays;
 * - `distinct`: the item stays its own step, no longer in doubt.
 * Returns the wording to remember for the step, or null when the item is not
 * in doubt (anymore). Tasks are never touched here.
 */
export function applyStepDecision(
  doc: PMDoc,
  stepId: string,
  decision: StepDecision,
  link: { taskId: string | null; taskCompleted: boolean | null },
): StepWording | null {
  const items = collectTaskItems(doc as PMNode, []);
  const item = items.find((node) => readStepId(node) === stepId);
  const target = item?.attrs?.reviewOf;
  if (!item || !isValidStepId(target)) return null;
  const text = taskItemText(item).replace(/\s+/g, ' ').trim();

  if (decision === 'distinct') {
    setAttrs(item, { reviewOf: undefined });
    return { stepId, text, distinctFrom: target };
  }

  const copies = items.filter((node) => node !== item && readStepId(node) === target);
  const checked =
    link.taskCompleted ?? (copies.length > 0 ? copies[0].attrs?.checked === true : item.attrs?.checked === true);
  removeTaskItems(doc as PMNode, new Set(copies));
  setAttrs(item, { stepId: target, taskId: link.taskId ?? undefined, reviewOf: undefined, checked });
  return { stepId: target, text, distinctFrom: null };
}
