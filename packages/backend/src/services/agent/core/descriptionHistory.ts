/**
 * A task description is the task's memory: when the agent rewrites it, what
 * was already written must not disappear.
 *
 * The agent sends a description as a whole new text, and a prompt rule alone
 * does not stop it from condensing or dropping older lines. So the write is
 * checked here: every line of the stored description that is missing from the
 * new one is put back under `## Histórico`. Only the lists of pending steps
 * are free to change, since they are meant to be rewritten on every update.
 *
 * A line counts as kept when the new text still carries what it said: its
 * numbers, dates and codes all appear, and most of its words are in one line
 * (or, for a line that was split, spread over the text).
 */

import { markdownToTiptapDoc, type PMNode } from '../../../utils/markdownToTiptapDoc';

const HISTORY_TITLE = 'Histórico';
const HISTORY_SECTION_RE = /^(historico|history)\b/;
/** Sections that list what is still to do: rewritten freely on every update. */
const PENDING_SECTION_RE = /(proximos? passos?|pendencias?|a fazer|to-?do|next steps?|checklist)/;

/** Share of a line's words that one new line must carry for it to count as kept. */
const SAME_LINE_COVERAGE = 0.6;
/** Same, over the whole new text: a line that was split in two. */
const WHOLE_TEXT_COVERAGE = 0.9;
const WHOLE_TEXT_MIN_WORDS = 5;

const STOPWORDS = new Set([
  'que', 'com', 'para', 'por', 'uma', 'uns', 'umas', 'dos', 'das', 'nos', 'nas', 'aos', 'pelo', 'pela',
  'voce', 'sua', 'seu', 'suas', 'seus', 'foi', 'esta', 'este', 'esse', 'essa', 'isso', 'como', 'mais',
  'mas', 'nao', 'sim', 'ser', 'tem', 'ter', 'ate', 'sobre', 'entre', 'quando', 'onde', 'the', 'and',
  'for', 'with', 'you', 'your', 'was', 'that', 'this', 'from',
]);

interface DescriptionLine {
  text: string;
  /** The line's inline nodes, kept as stored (marks, file chips). */
  inline: PMNode[];
}

const kids = (node: PMNode): PMNode[] => (Array.isArray(node.content) ? node.content : []);

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function inlineText(nodes: PMNode[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') out += node.text ?? '';
    else if (node.type === 'hardBreak') out += ' ';
    else if (node.type === 'attachmentRef') out += typeof node.attrs?.label === 'string' ? node.attrs.label : '';
    else out += inlineText(kids(node));
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Words that carry what a line says. Anything with a digit always counts. */
function wordsOf(text: string): string[] {
  const words = normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => /\d/.test(word) || (word.length >= 3 && !STOPWORDS.has(word)));
  return [...new Set(words)];
}

function parseDoc(raw: string | null | undefined): PMNode[] {
  const trimmed = raw?.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { type?: string; content?: PMNode[] };
      if (parsed?.type === 'doc') return Array.isArray(parsed.content) ? parsed.content : [];
    } catch {
      // Legacy plain text
    }
  }
  return markdownToTiptapDoc(trimmed).content;
}

const isTextBlock = (node: PMNode): boolean =>
  node.type === 'paragraph' ||
  node.type === 'codeBlock' ||
  kids(node).some((child) => child.type === 'text');

function splitAtHardBreaks(nodes: PMNode[]): PMNode[][] {
  const parts: PMNode[][] = [[]];
  for (const node of nodes) {
    if (node.type === 'hardBreak') parts.push([]);
    else parts[parts.length - 1].push(node);
  }
  return parts;
}

/**
 * The description's lines, in order. With `factsOnly`, the pending steps
 * (checkboxes, and the sections that list what is still to do) are left out.
 */
function collectLines(blocks: PMNode[], factsOnly: boolean): DescriptionLine[] {
  const lines: DescriptionLine[] = [];
  let inPendingSection = false;

  const visit = (node: PMNode, inTaskItem: boolean): void => {
    if (node.type === 'heading') {
      const title = inlineText(kids(node));
      inPendingSection = PENDING_SECTION_RE.test(normalize(title));
      if (!factsOnly && title) lines.push({ text: title, inline: kids(node) });
      return;
    }
    if (isTextBlock(node)) {
      if (factsOnly && (inTaskItem || inPendingSection)) return;
      // A paragraph written over several lines (hard breaks) is several lines.
      for (const inline of splitAtHardBreaks(kids(node))) {
        const text = inlineText(inline);
        if (text) lines.push({ text, inline });
      }
      return;
    }
    for (const child of kids(node)) visit(child, inTaskItem || node.type === 'taskItem');
  };

  for (const block of blocks) visit(block, false);
  return lines;
}

/** Does the new text still say what `line` said? */
function isKept(line: DescriptionLine, nextLines: Set<string>[], nextWords: Set<string>): boolean {
  const words = wordsOf(line.text);
  if (words.length === 0) return true;
  // A number, date or code that is gone is information that is gone.
  if (words.some((word) => /\d/.test(word) && !nextWords.has(word))) return false;

  const share = (pool: Set<string>): number => words.filter((word) => pool.has(word)).length / words.length;
  if (nextLines.some((pool) => share(pool) >= SAME_LINE_COVERAGE)) return true;
  return words.length >= WHOLE_TEXT_MIN_WORDS && share(nextWords) >= WHOLE_TEXT_COVERAGE;
}

const headingLevel = (node: PMNode): number => {
  const level = Number(node.attrs?.level);
  return Number.isFinite(level) ? level : 1;
};

/** `blocks` with `items` added to its `## Histórico` (created before the pending steps when missing). */
function withHistory(blocks: PMNode[], items: PMNode[]): PMNode[] {
  const titleOf = (node: PMNode): string => normalize(inlineText(kids(node)));
  const start = blocks.findIndex((node) => node.type === 'heading' && HISTORY_SECTION_RE.test(titleOf(node)));

  if (start === -1) {
    const firstHeading = blocks.find((node) => node.type === 'heading');
    const section: PMNode[] = [
      {
        type: 'heading',
        attrs: { level: firstHeading ? headingLevel(firstHeading) : 2 },
        content: [{ type: 'text', text: HISTORY_TITLE }],
      },
      { type: 'bulletList', content: items },
    ];
    const pending = blocks.findIndex((node) => node.type === 'heading' && PENDING_SECTION_RE.test(titleOf(node)));
    const at = pending === -1 ? blocks.length : pending;
    return [...blocks.slice(0, at), ...section, ...blocks.slice(at)];
  }

  let end = start + 1;
  while (end < blocks.length && blocks[end].type !== 'heading') end++;
  let list = -1;
  for (let i = start + 1; i < end; i++) if (blocks[i].type === 'bulletList') list = i;

  if (list === -1) {
    return [...blocks.slice(0, end), { type: 'bulletList', content: items }, ...blocks.slice(end)];
  }
  const next = [...blocks];
  next[list] = { ...blocks[list], content: [...kids(blocks[list]), ...items] };
  return next;
}

export interface DescriptionHistoryResult {
  /** The description to store (the incoming one, plus what it had left out). */
  value: string;
  /** The lines that were put back, as text. */
  preserved: string[];
}

/** True when the stored description has anything the agent must not drop. */
export function hasDescriptionHistory(existingRaw: string | null | undefined): boolean {
  return collectLines(parseDoc(existingRaw), true).length > 0;
}

/**
 * `nextRaw` (a serialized doc the agent is about to store) with every line of
 * `existingRaw` it left out put back under `## Histórico`.
 */
export function keepDescriptionHistory(
  existingRaw: string | null | undefined,
  nextRaw: string,
): DescriptionHistoryResult {
  const unchanged: DescriptionHistoryResult = { value: nextRaw, preserved: [] };
  const before = collectLines(parseDoc(existingRaw), true);
  if (before.length === 0) return unchanged;

  let nextDoc: Record<string, unknown> & { content?: PMNode[] };
  try {
    nextDoc = JSON.parse(nextRaw);
  } catch {
    return unchanged;
  }
  if (!nextDoc || nextDoc.type !== 'doc') return unchanged;
  const nextBlocks = Array.isArray(nextDoc.content) ? nextDoc.content : [];

  const nextLines = collectLines(nextBlocks, false).map((line) => new Set(wordsOf(line.text)));
  const nextWords = new Set(nextLines.flatMap((words) => [...words]));

  const seen = new Set<string>();
  const dropped = before.filter((line) => {
    if (isKept(line, nextLines, nextWords)) return false;
    const key = normalize(line.text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (dropped.length === 0) return unchanged;

  const items: PMNode[] = dropped.map((line) => ({
    type: 'listItem',
    content: [{ type: 'paragraph', content: line.inline }],
  }));
  return {
    value: JSON.stringify({ ...nextDoc, content: withHistory(nextBlocks, items) }),
    preserved: dropped.map((line) => line.text),
  };
}

// The user's own words asking for something to go away or be rewritten
// (pt-BR and en). Stems, matched at the start of a word, accents removed.
const REMOVAL_REQUEST_RE =
  /\b(apag|remov|retir|tira|tire|exclu|delet|limp|reescrev|refa[cz]|resum|encurt|enxug|simplific|substitu|troc|corrig|descart|esquec|zera|erase|rewrite|shorten|clean|replace|drop)/;

/**
 * May this update drop what the description already says? Only when the model
 * says the user asked for it AND the user's message (when the channel passes
 * it) has a word that asks for it.
 */
export function isRemovalRequested(modelFlag: unknown, userMessage: string | undefined): boolean {
  if (modelFlag !== true) return false;
  if (!userMessage?.trim()) return true;
  return REMOVAL_REQUEST_RE.test(normalize(userMessage));
}
