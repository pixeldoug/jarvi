/**
 * What a tool result looks like to the model (and to AI observability).
 *
 * A tool's `data` is also what the web client reads, so it may carry a task
 * row as stored: a serialized doc whose `_attachments` hold files as base64.
 * Sent to the model as text, one attached image is hundreds of thousands of
 * tokens, and the next model call fails with "input tokens exceed the limit".
 * Here a description becomes its readable Markdown, and no string goes out
 * with a file inside or longer than a bounded size.
 */

import { tiptapDocToMarkdown } from '../../../utils/tiptapDoc';

/** The longest string a tool result may hand to the model. */
const MAX_STRING_CHARS = 12_000;
const DATA_URL_RE = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[a-z0-9=._-]+)*;base64,[a-z0-9+/=]+/gi;
const MAX_DEPTH = 8;

function boundString(value: string): string {
  const withoutFiles = value.includes(';base64,') ? value.replace(DATA_URL_RE, '[arquivo]') : value;
  if (withoutFiles.length <= MAX_STRING_CHARS) return withoutFiles;
  return `${withoutFiles.slice(0, MAX_STRING_CHARS - 1)}…`;
}

function forModel(value: unknown, key: string | null, depth: number): unknown {
  if (typeof value === 'string') {
    // A stored description: the text the user reads, never the raw doc.
    return boundString(key === 'description' ? tiptapDocToMarkdown(value) : value);
  }
  if (!value || typeof value !== 'object' || depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((item) => forModel(item, null, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, forModel(v, k, depth + 1)]),
  );
}

/** A copy of `value` that is safe to send to the model: no files, no unbounded strings. */
export function toModelVisible<T>(value: T): T {
  return forModel(value, null, 0) as T;
}
