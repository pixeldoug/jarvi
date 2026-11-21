/**
 * Summary next steps ↔ tasks — pure helpers over the summary's TipTap doc JSON.
 * Port of packages/web/src/components/features/notes/summaryTasks.ts (keep
 * them in sync; the app only uses the read, link and check helpers).
 *
 * A summary task item (`taskItem`) is a next step with a stable
 * `attrs.stepId`. "Adicionar às tarefas" links it to the task created from it
 * (`attrs.taskId`, mirrored from the server). `attrs.reviewOf` marks an item a
 * regeneration could not tell apart from a linked step: the user answers
 * "Já é tarefa?" before it is offered. Every helper takes and returns the
 * stored doc string; nothing here throws.
 */

export interface DocNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
}

export interface SummaryTaskItem {
  /** Position among the doc's task items (document order) */
  index: number;
  /** Plain text of the item (whitespace collapsed; '' when empty) */
  text: string;
  checked: boolean;
  /** Task created from this item, if any */
  taskId: string | null;
  /** Stable id of the next step (null until it gets one) */
  stepId: string | null;
  /** The linked step this item may duplicate (not offered for conversion) */
  reviewOf: string | null;
  /** Set by the user on a step that is not a task yet (YYYY-MM-DD / HH:MM / category) */
  dueDate: string | null;
  time: string | null;
  category: string | null;
}

/** A change to a step that is not a task yet, made from its task row in the note. */
export interface SummaryStepPatch {
  text?: string;
  checked?: boolean;
  dueDate?: string | null;
  time?: string | null;
  category?: string | null;
}

export interface SummaryTaskLink {
  stepId: string;
  taskId: string;
}

function parseDoc(raw: string | null | undefined): DocNode | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && (parsed as DocNode).type === 'doc'
      ? (parsed as DocNode)
      : null;
  } catch {
    return null;
  }
}

function inlineText(node: DocNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return ' ';
  return (node.content ?? []).map(inlineText).join('');
}

/** Text of an item's own paragraphs (not of nested lists). */
function itemText(item: DocNode): string {
  return (item.content ?? [])
    .filter((child) => child.type === 'paragraph')
    .map(inlineText)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readAttr(item: DocNode, name: string): string | null {
  const value = item.attrs?.[name];
  return typeof value === 'string' && value !== '' ? value : null;
}

function readTaskId(item: DocNode): string | null {
  return readAttr(item, 'taskId');
}

/** A new step id (32 hex chars, a shape the server accepts). */
export function newStepId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/** A next step that may repeat one that already has a task. */
export interface SummaryStepReview {
  stepId: string;
  text: string;
  /** The step that already has a task */
  reviewOf: string;
  /** That step's text in the summary (null when it is not shown) */
  existingText: string | null;
}

/** The items waiting for "é o mesmo passo?", in document order. */
export function listStepReviews(items: SummaryTaskItem[]): SummaryStepReview[] {
  return items.flatMap((item) => {
    if (!item.stepId || !item.reviewOf) return [];
    const existing = items.find((other) => other !== item && other.stepId === item.reviewOf);
    return [{ stepId: item.stepId, text: item.text, reviewOf: item.reviewOf, existingText: existing?.text || null }];
  });
}

/** Not linked, not under review, with text: offered by "Criar tarefas". */
export function isConvertibleStep(item: SummaryTaskItem): boolean {
  return item.text !== '' && !item.taskId && !item.reviewOf;
}

/**
 * The next-steps heading the AI writes, in every summary language (accents
 * and case ignored). A summary keeps the language it was generated in (the
 * old backend always writes "Próximos passos", the new one "Next steps" for
 * en-US users), so both split whatever the UI language is. Same set as the web.
 */
const NEXT_STEPS_HEADINGS: ReadonlySet<string> = new Set(['proximos passos', 'next steps']);

function headingKey(node: DocNode): string {
  if (node.type !== 'heading') return '';
  return inlineText(node)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The summary split in two for the view: `body`, the doc without its
 * "Próximos passos" / "Next steps" section, shown as rich text; and
 * `section`, that heading and what follows it up to the next heading, shown
 * as a task list. `body` is the stored string itself when there is no such
 * section.
 */
export function splitNextStepsSection(raw: string | null | undefined): { body: string; section: DocNode[] } | null {
  const doc = parseDoc(raw);
  if (!doc || !raw) return null;
  const blocks = doc.content ?? [];
  const start = blocks.findIndex((node) => NEXT_STEPS_HEADINGS.has(headingKey(node)));
  if (start < 0) return { body: raw, section: [] };
  let end = start + 1;
  while (end < blocks.length && blocks[end]?.type !== 'heading') end += 1;
  return {
    body: JSON.stringify({ ...doc, content: [...blocks.slice(0, start), ...blocks.slice(end)] }),
    section: blocks.slice(start, end),
  };
}

/** The section's next steps (see `splitNextStepsSection`), in order. */
export function parseSectionSteps(section: DocNode[]): SummaryTaskItem[] {
  return parseSummaryTasks(JSON.stringify({ type: 'doc', content: section }));
}

/** Visits every task item, depth-first in document order. */
function forEachTaskItem(node: DocNode, visit: (item: DocNode, index: number) => void): void {
  let index = 0;
  const walk = (current: DocNode) => {
    if (current.type === 'taskItem') visit(current, index++);
    (current.content ?? []).forEach(walk);
  };
  walk(node);
}

/** The summary's task items, in document order. */
export function parseSummaryTasks(raw: string | null | undefined): SummaryTaskItem[] {
  const doc = parseDoc(raw);
  if (!doc) return [];
  const items: SummaryTaskItem[] = [];
  forEachTaskItem(doc, (item, index) => {
    items.push({
      index,
      text: itemText(item),
      checked: item.attrs?.checked === true,
      taskId: readTaskId(item),
      stepId: readAttr(item, 'stepId'),
      reviewOf: readAttr(item, 'reviewOf'),
      dueDate: readAttr(item, 'dueDate'),
      time: readAttr(item, 'time'),
      category: readAttr(item, 'category'),
    });
  });
  return items;
}

/**
 * Gives a step id to every item without one, and a new one to a later copy
 * of an id (an item duplicated in the web editor). Returns `raw` itself when every
 * item already had its own.
 */
export function ensureStepIds(raw: string, createId: () => string = newStepId): string {
  const doc = parseDoc(raw);
  if (!doc) return raw;
  const seen = new Set<string>();
  let changed = false;
  forEachTaskItem(doc, (item) => {
    const stepId = readAttr(item, 'stepId');
    if (stepId && !seen.has(stepId)) {
      seen.add(stepId);
      return;
    }
    const next = createId();
    seen.add(next);
    const attrs: Record<string, unknown> = { ...item.attrs, stepId: next };
    if (stepId) {
      // A copy is a new step: it has no link of its own.
      delete attrs.taskId;
      delete attrs.reviewOf;
    }
    item.attrs = attrs;
    changed = true;
  });
  return changed ? JSON.stringify(doc) : raw;
}

/**
 * Applies `patch` to the step's item: new text (one paragraph), done, date,
 * time, category (null clears). Returns `raw` itself when nothing changed.
 */
export function updateSummaryStep(raw: string, stepId: string, patch: SummaryStepPatch): string {
  const doc = parseDoc(raw);
  if (!doc) return raw;
  let changed = false;
  forEachTaskItem(doc, (item) => {
    if (readAttr(item, 'stepId') !== stepId) return;
    const attrs: Record<string, unknown> = { ...item.attrs };
    if (patch.checked !== undefined) attrs.checked = patch.checked;
    for (const key of ['dueDate', 'time', 'category'] as const) {
      if (patch[key] === undefined) continue;
      if (patch[key]) attrs[key] = patch[key];
      else delete attrs[key];
    }
    item.attrs = attrs;
    const text = patch.text?.trim();
    if (text && text !== itemText(item)) {
      const nested = (item.content ?? []).filter((child) => child.type !== 'paragraph');
      item.content = [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...nested];
    }
    changed = true;
  });
  const next = changed ? JSON.stringify(doc) : raw;
  return next === raw ? raw : next;
}

/** Sets `attrs.taskId` on the items of the given steps. */
export function linkSummaryTasks(raw: string, links: SummaryTaskLink[]): string {
  const doc = parseDoc(raw);
  if (!doc || links.length === 0) return raw;
  const taskIdByStep = new Map(links.map((link) => [link.stepId, link.taskId]));
  let changed = false;
  forEachTaskItem(doc, (item) => {
    const stepId = readAttr(item, 'stepId');
    const taskId = stepId ? taskIdByStep.get(stepId) : undefined;
    if (!taskId || readTaskId(item) === taskId) return;
    item.attrs = { ...item.attrs, taskId };
    changed = true;
  });
  return changed ? JSON.stringify(doc) : raw;
}

/**
 * Sets the checked state of linked items from `checkedById` (task id →
 * completed). Items whose task is not in the map are left untouched.
 * Returns `raw` itself when nothing changed.
 */
export function setSummaryTaskChecked(
  raw: string,
  checkedById: ReadonlyMap<string, boolean>,
): string {
  const doc = parseDoc(raw);
  if (!doc || checkedById.size === 0) return raw;
  let changed = false;
  forEachTaskItem(doc, (item) => {
    const taskId = readTaskId(item);
    if (!taskId || !checkedById.has(taskId)) return;
    const checked = checkedById.get(taskId) === true;
    if ((item.attrs?.checked === true) === checked) return;
    item.attrs = { ...item.attrs, checked };
    changed = true;
  });
  return changed ? JSON.stringify(doc) : raw;
}

