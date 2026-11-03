/**
 * Summary next steps ↔ tasks — pure helpers over the summary's TipTap doc JSON.
 *
 * A summary task item (`taskItem`) is a next step with a stable
 * `attrs.stepId` (from the server; the client gives one to an item typed by
 * the user before converting it). Converted with "Criar tarefas", it carries
 * `attrs.taskId`, the task created from it — the server keeps that link and
 * rewrites the mirror on every save. `attrs.reviewOf` marks an item a
 * regeneration could not tell apart from a linked step: it is not offered.
 * Items are listed in document order (`index`). Every helper takes and
 * returns the stored doc string; a value that is not a doc has no items and
 * comes back unchanged, and nothing here throws.
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

export interface SummaryTaskCheckChange {
  taskId: string;
  checked: boolean;
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

/** A new step id (same shape the server accepts). */
export function newStepId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
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

const NEXT_STEPS_HEADING = 'proximos passos';

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
 * "Próximos passos" section, shown in the editor; and `section`, that heading
 * and what follows it up to the next heading, shown as a task list. `body` is
 * the stored string itself when there is no such section, and a re-split of
 * `joinNextStepsSection(body, section)` gives `body` back byte for byte (the
 * editor only re-renders content that differs from what it emitted).
 */
export function splitNextStepsSection(raw: string | null | undefined): { body: string; section: DocNode[] } | null {
  const doc = parseDoc(raw);
  if (!doc || !raw) return null;
  const blocks = doc.content ?? [];
  const start = blocks.findIndex((node) => headingKey(node) === NEXT_STEPS_HEADING);
  if (start < 0) return { body: raw, section: [] };
  let end = start + 1;
  while (end < blocks.length && blocks[end].type !== 'heading') end += 1;
  return {
    body: JSON.stringify({ ...doc, content: [...blocks.slice(0, start), ...blocks.slice(end)] }),
    section: blocks.slice(start, end),
  };
}

/** The editor's `body` with the "Próximos passos" section back, at the end. */
export function joinNextStepsSection(body: string, section: DocNode[]): string {
  if (section.length === 0) return body;
  const doc = parseDoc(body);
  if (!doc) return body;
  return JSON.stringify({ ...doc, content: [...(doc.content ?? []), ...section] });
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
 * of an id (an item duplicated in the editor). Returns `raw` itself when every
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

/** Removes the step's item (and a task list left empty). */
export function removeSummaryStep(raw: string, stepId: string): string {
  const doc = parseDoc(raw);
  if (!doc) return raw;
  let removed = false;
  const prune = (node: DocNode) => {
    if (!node.content) return;
    const before = node.content.length;
    node.content = node.content.filter((child) => !(child.type === 'taskItem' && readAttr(child, 'stepId') === stepId));
    if (node.content.length !== before) removed = true;
    node.content.forEach(prune);
    node.content = node.content.filter((child) => child.type !== 'taskList' || (child.content?.length ?? 0) > 0);
  };
  prune(doc);
  return removed ? JSON.stringify(doc) : raw;
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

function checkedStatesById(items: SummaryTaskItem[]): Map<string, boolean[]> {
  const states = new Map<string, boolean[]>();
  items.forEach((item) => {
    if (!item.taskId) return;
    const list = states.get(item.taskId);
    if (list) list.push(item.checked);
    else states.set(item.taskId, [item.checked]);
  });
  return states;
}

/**
 * Linked items whose checkbox the user toggled between two versions of the
 * doc. Items are matched by task id (in order, when a link appears twice);
 * links that appear or disappear are not changes.
 */
export function diffLinkedCheckedItems(
  prev: SummaryTaskItem[],
  next: SummaryTaskItem[],
): SummaryTaskCheckChange[] {
  const before = checkedStatesById(prev);
  const changes: SummaryTaskCheckChange[] = [];
  checkedStatesById(next).forEach((states, taskId) => {
    const previous = before.get(taskId);
    if (!previous) return;
    const length = Math.min(previous.length, states.length);
    for (let i = 0; i < length; i += 1) {
      if (previous[i] !== states[i]) {
        changes.push({ taskId, checked: states[i] });
        return;
      }
    }
  });
  return changes;
}

export function diffLinkedChecked(
  prevRaw: string | null | undefined,
  nextRaw: string | null | undefined,
): SummaryTaskCheckChange[] {
  return diffLinkedCheckedItems(parseSummaryTasks(prevRaw), parseSummaryTasks(nextRaw));
}
