/**
 * Matching and ranking for the CommandPalette (pt-BR).
 *
 * Accents and case are ignored ("reuniao" finds "Reunião"). Every word of the
 * query must appear in one of the item's fields; the title counts the most,
 * then keywords (synonyms the user may type), then the body (previews,
 * descriptions). A one-letter word only matches at the start of a word.
 * The same rules say which parts of a result to highlight.
 */

export interface SearchFields {
  title: string;
  /** Synonyms and related words, never shown */
  keywords?: string;
  /** Longer text (note preview, task description) */
  body?: string;
}

export function foldSearchText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function tokenizeQuery(query: string): string[] {
  return foldSearchText(query).split(/\s+/).filter(Boolean);
}

const isWordChar = (char: string | undefined): boolean => !!char && /[a-z0-9]/.test(char);

type MatchKind = 'prefix' | 'word' | 'inside';

function findMatch(field: string, token: string): MatchKind | null {
  let index = field.indexOf(token);
  if (index < 0) return null;
  if (index === 0) return 'prefix';
  while (index >= 0) {
    if (!isWordChar(field[index - 1])) return 'word';
    index = field.indexOf(token, index + 1);
  }
  return 'inside';
}

const WEIGHTS: Record<keyof SearchFields, Record<MatchKind, number>> = {
  title: { prefix: 100, word: 70, inside: 40 },
  keywords: { prefix: 50, word: 50, inside: 25 },
  body: { prefix: 15, word: 15, inside: 8 },
};

/** `null` when some word of the query matches none of the fields. */
export function matchScore(tokens: string[], fields: SearchFields): number | null {
  const folded: Record<keyof SearchFields, string> = {
    title: foldSearchText(fields.title),
    keywords: fields.keywords ? foldSearchText(fields.keywords) : '',
    body: fields.body ? foldSearchText(fields.body) : '',
  };

  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const field of ['title', 'keywords', 'body'] as const) {
      const kind = findMatch(folded[field], token);
      if (!kind || (token.length === 1 && kind === 'inside')) continue;
      best = Math.max(best, WEIGHTS[field][kind]);
    }
    if (best === 0) return null;
    total += best;
  }

  // The whole query as typed, in the title, beats scattered words.
  const phrase = tokens.join(' ');
  if (folded.title === phrase) total += 60;
  else if (tokens.length > 1 && folded.title.includes(phrase)) total += 40;
  return total;
}

// ── Highlights ────────────────────────────────────────────────────────────────

export type TextRange = [start: number, end: number];

/** Folds `value` char by char, keeping where each folded char came from. */
function foldWithOffsets(value: string): { folded: string; offsets: number[] } {
  let folded = '';
  const offsets: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const piece = foldSearchText(value[index]);
    folded += piece;
    for (let k = 0; k < piece.length; k += 1) offsets.push(index);
  }
  return { folded, offsets };
}

/** Where the query's words appear in `text`: sorted, merged, in `text`'s offsets. */
export function findMatchRanges(text: string, tokens: string[]): TextRange[] {
  if (!text || tokens.length === 0) return [];
  const { folded, offsets } = foldWithOffsets(text);
  const ranges: TextRange[] = [];
  for (const token of tokens) {
    let index = folded.indexOf(token);
    while (index >= 0) {
      if (token.length > 1 || !isWordChar(folded[index - 1])) {
        ranges.push([offsets[index], offsets[index + token.length - 1] + 1]);
      }
      index = folded.indexOf(token, index + token.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: TextRange[] = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Words kept before the first match, so it reads in context */
const SNIPPET_LEAD_CHARS = 24;
const SNIPPET_MAX_CHARS = 200;

/**
 * One line of `text` around its first match ("…the invoice feedback, and"),
 * or its start when nothing in it matches. The row's CSS cuts the end.
 */
export function snippetAround(text: string, tokens: string[]): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const first = findMatchRanges(clean, tokens)[0];
  if (!first || first[0] <= SNIPPET_LEAD_CHARS) return clean.slice(0, SNIPPET_MAX_CHARS);
  // Start at a word boundary a little before the match.
  const space = clean.indexOf(' ', first[0] - SNIPPET_LEAD_CHARS);
  const start = space >= 0 && space < first[0] ? space + 1 : first[0];
  return `…${clean.slice(start, start + SNIPPET_MAX_CHARS)}`;
}
