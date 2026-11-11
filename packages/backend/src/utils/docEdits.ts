/**
 * Targeted edits to a ProseMirror (TipTap) doc — how the AI changes a note or
 * a task description without rewriting it.
 *
 * Each edit names a place by text the doc already has (`anchor`: a section
 * title or a line) and what goes there (`content`, Markdown). Only the nodes
 * an edit touches change; everything else — formatting, checked items, file
 * chips, the doc's other root keys (`_attachments`) — stays as it is.
 *
 * Keep in sync with `packages/web/src/utils/docEdits.ts` (same code below this
 * comment): the server saves the edit and the open note applies the same one
 * to its own draft. Duplicated, not shared, for the same reason as
 * `markdownToTiptapDoc.ts`.
 */

import { markdownToTiptapDoc, type PMNode } from './markdownToTiptapDoc';

export const DOC_EDIT_ACTIONS = [
  /** End of the doc: only when nothing in it relates to the content */
  'append',
  /** End of the section whose title (or label line) is `anchor` */
  'append_to_section',
  /** Right after / before the line `anchor` */
  'insert_after',
  'insert_before',
  /** The line `anchor` becomes `content`; an anchor that is part of a line swaps only that part */
  'replace',
  /** The body of the section `anchor` becomes `content` (no content: the section goes) */
  'replace_section',
  /** The line `anchor` goes */
  'delete',
  /** The whole text becomes `content` */
  'replace_all',
] as const;

export type DocEditAction = (typeof DOC_EDIT_ACTIONS)[number];

export interface DocEdit {
  action: DocEditAction;
  /** Text of an existing line: a heading, a paragraph or a list item */
  anchor?: string;
  /** Markdown */
  content?: string;
}

/** Where an edit landed: a top-level block, or an item of the list at that block. */
export interface DocEditFocus {
  block: number;
  item?: number;
}

export interface DocEditFailure {
  /** Position of the edit in the request */
  index: number;
  anchor: string;
  reason: 'anchor_not_found' | 'anchor_required';
}

export interface DocEditResult {
  blocks: PMNode[];
  /** Edits that could not find their place. The others were applied. */
  failures: DocEditFailure[];
  /** Where the last applied edit landed */
  focus: DocEditFocus | null;
}

export interface RawDocEditResult extends Omit<DocEditResult, 'blocks'> {
  /** The doc, serialized like the editor does */
  doc: string;
  changed: boolean;
  /** No block left */
  empty: boolean;
}

const MAX_EDITS = 20;

/** Edits as a tool call sent them (untrusted): unknown actions are dropped. */
export function parseDocEdits(value: unknown): DocEdit[] {
  if (!Array.isArray(value)) return [];
  const edits: DocEdit[] = [];
  for (const item of value.slice(0, MAX_EDITS)) {
    if (!item || typeof item !== 'object') continue;
    const { action, anchor, content } = item as Record<string, unknown>;
    if (typeof action !== 'string' || !(DOC_EDIT_ACTIONS as readonly string[]).includes(action)) continue;
    const edit: DocEdit = { action: action as DocEditAction };
    if (typeof anchor === 'string' && anchor.trim()) edit.anchor = anchor.trim();
    if (typeof content === 'string' && content.trim()) edit.content = content.trim();
    edits.push(edit);
  }
  return edits;
}

// ---------------------------------------------------------------------------
// Reading the doc
// ---------------------------------------------------------------------------

const LIST_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);

const kids = (node: PMNode): PMNode[] => (Array.isArray(node.content) ? node.content : []);
const isList = (node: PMNode | undefined): boolean => !!node && LIST_TYPES.has(node.type);
const isBlank = (node: PMNode | undefined): boolean =>
  !!node && node.type === 'paragraph' && kids(node).length === 0;
const headingLevel = (node: PMNode): number =>
  node.type === 'heading' ? Number(node.attrs?.level) || 1 : 0;

function nodeText(node: PMNode): string {
  if (typeof node.text === 'string') return node.text;
  if (node.type === 'hardBreak') return ' ';
  const children = kids(node);
  const inline = children.some((child) => typeof child.text === 'string' || child.type === 'hardBreak');
  return children.map(nodeText).join(inline ? '' : ' ');
}

/** A list item is found by its own line, not by the items nested under it. */
const itemLine = (item: PMNode): string => nodeText(kids(item)[0] ?? item);

/**
 * A line as it is compared: its first line, without Markdown markers, accents,
 * case or closing punctuation, so an anchor copied from the Markdown the
 * model read finds the node it came from.
 */
function normalizeLine(value: string): string {
  const line = value.split('\n').find((part) => part.trim() !== '') ?? '';
  return line
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ x]\]\s+)?|\d+[.)]\s+|>\s?)/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.:;,!?…]+$/, '')
    .trim();
}

interface Unit {
  block: number;
  /** Set when the line is an item of the list at `block` */
  item?: number;
  text: string;
  heading: boolean;
}

/** How an anchor matched its line: all of it, its start, or a part inside it. */
type AnchorMatch = 'exact' | 'prefix' | 'inside';

function listUnits(blocks: PMNode[]): Unit[] {
  const units: Unit[] = [];
  blocks.forEach((node, block) => {
    if (isList(node)) {
      kids(node).forEach((item, index) => {
        units.push({ block, item: index, text: normalizeLine(itemLine(item)), heading: false });
      });
    } else {
      units.push({ block, text: normalizeLine(nodeText(node)), heading: node.type === 'heading' });
    }
  });
  return units.filter((unit) => unit.text !== '');
}

/** The line `anchor` names: the same text, else one that starts with or contains it. */
function findUnit(
  blocks: PMNode[],
  anchor: string,
  preferHeading: boolean,
): (Unit & { match: AnchorMatch }) | null {
  const target = normalizeLine(anchor);
  if (!target) return null;
  const units = listUnits(blocks);
  const tiers: Array<[AnchorMatch, (unit: Unit) => boolean]> = [
    ['exact', (unit) => unit.text === target],
    ['prefix', (unit) => target.length >= 3 && unit.text.startsWith(target)],
    ['inside', (unit) => target.length >= 3 && unit.text.includes(target)],
  ];
  for (const [match, matches] of tiers) {
    const hits = units.filter(matches);
    if (hits.length > 0) {
      return { ...((preferHeading && hits.find((unit) => unit.heading)) || hits[0]), match };
    }
  }
  return null;
}

/**
 * First block after the section that starts at `start`: for a heading, the
 * next heading of its level or above; for a label line ("Próximos passos:"),
 * the end of the list(s) under it.
 */
function sectionEnd(blocks: PMNode[], start: number): number {
  const level = headingLevel(blocks[start]);
  let end = start + 1;
  if (level > 0) {
    while (end < blocks.length && !(headingLevel(blocks[end]) > 0 && headingLevel(blocks[end]) <= level)) end += 1;
  } else {
    while (end < blocks.length && isList(blocks[end])) end += 1;
  }
  return end;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function contentNodes(markdown: string | undefined): PMNode[] {
  if (!markdown || !markdown.trim()) return [];
  return markdownToTiptapDoc(markdown).content.filter((node) => !isBlank(node));
}

function toItem(content: PMNode[], listType: string, checked: boolean): PMNode {
  return listType === 'taskList'
    ? { type: 'taskItem', attrs: { checked }, content }
    : { type: 'listItem', content };
}

/**
 * `nodes` as items of a `listType` list, so what enters a list looks like the
 * list (a bullet added to a checklist becomes a checkbox). Null when one of
 * them is not list material (a heading, a quote).
 */
function asItems(nodes: PMNode[], listType: string, checked = false): PMNode[] | null {
  const items: PMNode[] = [];
  for (const node of nodes) {
    if (isList(node)) {
      for (const item of kids(node)) {
        items.push(toItem(kids(item), listType, item.type === 'taskItem' ? item.attrs?.checked === true : checked));
      }
    } else if (node.type === 'paragraph') {
      items.push(toItem([node], listType, checked));
    } else {
      return null;
    }
  }
  return items;
}

interface Applied {
  blocks: PMNode[];
  focus: DocEditFocus;
}

/** Case and accents folded one character at a time, so positions match the original. */
function fold(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const folded = value[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    out += folded.length === 1 ? folded : value[i];
  }
  return out;
}

/** An anchor as it appears inside a line: no Markdown markers around it. */
function anchorText(anchor: string): string {
  const line = anchor.split('\n').find((part) => part.trim() !== '') ?? '';
  return line
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)/, '')
    .replace(/[*_`~]/g, '')
    .trim();
}

/**
 * `line` (a paragraph or heading) with the part `anchor` names swapped for
 * `replacement`, which takes the formatting of the text it replaces. The rest
 * of the line is untouched. Null when that part is not in the line as written.
 */
function replaceInLine(line: PMNode, anchor: string, replacement: PMNode[]): PMNode | null {
  const needle = fold(anchorText(anchor));
  if (!needle) return null;
  const children = kids(line);
  // Non-text inline nodes (a file chip, a line break) count as one character.
  const haystack = children.map((child) => (typeof child.text === 'string' ? fold(child.text) : '\u0000')).join('');
  const from = haystack.indexOf(needle);
  if (from === -1) return null;
  const to = from + needle.length;

  const out: PMNode[] = [];
  let offset = 0;
  let placed = false;
  for (const child of children) {
    const text = typeof child.text === 'string' ? child.text : null;
    const start = offset;
    offset += text === null ? 1 : text.length;
    if (text === null || offset <= from || start >= to) {
      out.push(child);
      continue;
    }
    const before = text.slice(0, Math.max(0, from - start));
    const after = text.slice(Math.max(0, to - start));
    if (before) out.push({ ...child, text: before });
    if (!placed) {
      placed = true;
      out.push(
        ...replacement.map((node) =>
          typeof node.text === 'string' && !node.marks && child.marks ? { ...node, marks: child.marks } : node,
        ),
      );
    }
    if (after) out.push({ ...child, text: after });
  }
  return { ...line, content: out };
}

/**
 * `replace` with an anchor that is only part of its line: swap that part and
 * keep the rest of the line. Null when the edit is not that — the content is
 * a block of its own (a list item, a title, several lines), or it restates the
 * line from its start (an abbreviated anchor: the whole line is meant).
 */
function replacePartOfLine(blocks: PMNode[], unit: Unit & { match: AnchorMatch }, edit: DocEdit, nodes: PMNode[]): Applied | null {
  if (unit.match === 'exact' || !edit.anchor) return null;
  if (nodes.length !== 1 || nodes[0].type !== 'paragraph') return null;
  if (unit.match === 'prefix' && fold(nodeText(nodes[0])).startsWith(fold(anchorText(edit.anchor)))) return null;

  const block = blocks[unit.block];
  const out = [...blocks];
  if (unit.item === undefined) {
    const line = replaceInLine(block, edit.anchor, kids(nodes[0]));
    if (!line) return null;
    out[unit.block] = line;
    return { blocks: out, focus: { block: unit.block } };
  }
  const item = kids(block)[unit.item];
  const first = item ? kids(item)[0] : undefined;
  const line = first ? replaceInLine(first, edit.anchor, kids(nodes[0])) : null;
  if (!item || !line) return null;
  const items = [...kids(block)];
  items[unit.item] = { ...item, content: [line, ...kids(item).slice(1)] };
  out[unit.block] = { ...block, content: items };
  return { blocks: out, focus: { block: unit.block, item: unit.item } };
}

/** Changes the items of the list at `block`; a list left without items goes. */
function spliceItems(blocks: PMNode[], block: number, at: number, remove: number, items: PMNode[]): Applied {
  const next = [...kids(blocks[block])];
  next.splice(at, remove, ...items);
  const out = [...blocks];
  if (next.length === 0) {
    out.splice(block, 1);
    return { blocks: out, focus: { block: Math.max(0, Math.min(block, out.length - 1)) } };
  }
  out[block] = { ...blocks[block], content: next };
  return { blocks: out, focus: { block, item: Math.min(at, next.length - 1) } };
}

/**
 * Puts `nodes` at `index`. A list that lands against a list joins it instead
 * of starting a second one.
 */
function insertBlocks(blocks: PMNode[], index: number, nodes: PMNode[]): Applied {
  const out = [...blocks];
  let rest = nodes;
  let focus: DocEditFocus | null = null;

  const before = out[index - 1];
  if (isList(before) && isList(rest[0])) {
    const items = asItems([rest[0]], before.type) ?? [];
    focus = { block: index - 1, item: kids(before).length };
    out[index - 1] = { ...before, content: [...kids(before), ...items] };
    rest = rest.slice(1);
  }

  const after = out[index];
  const last = rest[rest.length - 1];
  if (isList(after) && isList(last)) {
    const items = asItems([last], after.type) ?? [];
    out[index] = { ...after, content: [...items, ...kids(after)] };
    rest = rest.slice(0, -1);
    if (!focus && rest.length === 0) focus = { block: index, item: 0 };
  }

  out.splice(index, 0, ...rest);
  return { blocks: out, focus: focus ?? { block: Math.min(index, Math.max(0, out.length - 1)) } };
}

function dropTrailingBlanks(blocks: PMNode[]): PMNode[] {
  let end = blocks.length;
  while (end > 0 && isBlank(blocks[end - 1])) end -= 1;
  return blocks.slice(0, end);
}

/** An edit anchored on an item of the list at `unit.block`. */
function editListItem(blocks: PMNode[], unit: Unit, action: DocEditAction, nodes: PMNode[]): Applied {
  const list = blocks[unit.block];
  const index = unit.item ?? 0;
  const old = kids(list)[index];

  if (action === 'delete') return spliceItems(blocks, unit.block, index, 1, []);

  if (action === 'replace' || action === 'replace_section') {
    if (nodes.length === 0) return spliceItems(blocks, unit.block, index, 1, []);
    const items = asItems(nodes, list.type, old?.attrs?.checked === true);
    if (items) {
      // One line for one line: what was nested under the old item stays.
      if (items.length === 1 && kids(items[0]).length === 1 && old) {
        items[0] = { ...items[0], content: [...kids(items[0]), ...kids(old).slice(1)] };
      }
      return spliceItems(blocks, unit.block, index, 1, items);
    }
    // Not list material: it goes below the list, and the item leaves.
    const without = spliceItems(blocks, unit.block, index, 1, []).blocks;
    const listStays = without.length === blocks.length;
    return insertBlocks(without, listStays ? unit.block + 1 : unit.block, nodes);
  }

  const items = asItems(nodes, list.type);
  if (items) {
    const at = action === 'insert_before' ? index : action === 'insert_after' ? index + 1 : kids(list).length;
    return spliceItems(blocks, unit.block, at, 0, items);
  }
  return insertBlocks(blocks, action === 'insert_before' ? unit.block : unit.block + 1, nodes);
}

/** An edit anchored on the top-level block at `index`. */
function editBlock(blocks: PMNode[], index: number, action: DocEditAction, nodes: PMNode[]): Applied {
  const out = [...blocks];
  const clamp = (block: number): DocEditFocus => ({ block: Math.max(0, Math.min(block, out.length - 1)) });

  switch (action) {
    case 'delete':
      out.splice(index, 1);
      return { blocks: out, focus: clamp(index) };

    case 'replace':
      out.splice(index, 1, ...nodes);
      return { blocks: out, focus: clamp(index) };

    case 'insert_before':
      return insertBlocks(blocks, index, nodes);

    case 'insert_after':
      return insertBlocks(blocks, index + 1, nodes);

    case 'replace_section': {
      const end = sectionEnd(blocks, index);
      // Without content the section goes; content that brings its own title
      // replaces the title too.
      const from = nodes.length === 0 || nodes[0].type === 'heading' ? index : index + 1;
      out.splice(from, end - from, ...nodes);
      return { blocks: out, focus: clamp(from) };
    }

    default: {
      // append_to_section
      let at = sectionEnd(blocks, index);
      while (at > index + 1 && isBlank(blocks[at - 1])) at -= 1;
      const body = blocks.slice(index + 1, at);
      // List items go to the section's list, even when a closing line follows
      // it. A section that is only a list (next steps, criteria) takes plain
      // lines as items too; anything else ends the section.
      let listAt = at - 1;
      while (listAt > index && !isList(blocks[listAt])) listAt -= 1;
      if (listAt > index) {
        const onlyLists = body.every((node) => isList(node) || isBlank(node));
        const joins = nodes.every((node) => isList(node)) || (onlyLists && listAt === at - 1);
        const items = joins ? asItems(nodes, blocks[listAt].type) : null;
        if (items) return spliceItems(blocks, listAt, kids(blocks[listAt]).length, 0, items);
      }
      return insertBlocks(blocks, at, nodes);
    }
  }
}

function applyEdit(blocks: PMNode[], edit: DocEdit): Applied | DocEditFailure['reason'] {
  const nodes = contentNodes(edit.content);

  if (edit.action === 'replace_all') return { blocks: nodes, focus: { block: 0 } };
  if (edit.action === 'append') {
    const kept = dropTrailingBlanks(blocks);
    return { blocks: [...kept, ...nodes], focus: { block: kept.length } };
  }

  if (!edit.anchor) return 'anchor_required';
  const sectionEdit = edit.action === 'append_to_section' || edit.action === 'replace_section';
  const unit = findUnit(blocks, edit.anchor, sectionEdit);
  if (!unit) return 'anchor_not_found';

  if (edit.action === 'replace') {
    const part = replacePartOfLine(blocks, unit, edit, nodes);
    if (part) return part;
  }

  return unit.item !== undefined
    ? editListItem(blocks, unit, edit.action, nodes)
    : editBlock(blocks, unit.block, edit.action, nodes);
}

/** Applies `edits` in order. One that cannot find its place is reported and skipped. */
export function applyDocEdits(blocks: PMNode[], edits: DocEdit[]): DocEditResult {
  let current = blocks;
  let focus: DocEditFocus | null = null;
  const failures: DocEditFailure[] = [];

  edits.forEach((edit, index) => {
    const applied = applyEdit(current, edit);
    if (typeof applied === 'string') {
      failures.push({ index, anchor: edit.anchor ?? '', reason: applied });
      return;
    }
    current = applied.blocks;
    focus = applied.focus;
  });

  return { blocks: current, failures, focus };
}

/** The doc's root: the editor's JSON, or text from before it (read as Markdown). */
function parseRoot(raw: string | null | undefined): Record<string, unknown> {
  const text = (raw ?? '').trim();
  if (!text) return { type: 'doc', content: [] };
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && (parsed as { type?: unknown }).type === 'doc') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON
  }
  return { type: 'doc', content: contentNodes(text) };
}

/** `applyDocEdits` on a stored doc (the editor's JSON string), keeping its other root keys. */
export function applyDocEditsToRaw(raw: string | null | undefined, edits: DocEdit[]): RawDocEditResult {
  const root = parseRoot(raw);
  const before = Array.isArray(root.content) ? (root.content as PMNode[]) : [];
  const { blocks, failures, focus } = applyDocEdits(before, edits);
  return {
    doc: JSON.stringify({ ...root, type: 'doc', content: blocks }),
    changed: JSON.stringify(before) !== JSON.stringify(blocks),
    empty: blocks.length === 0,
    failures,
    focus,
  };
}
