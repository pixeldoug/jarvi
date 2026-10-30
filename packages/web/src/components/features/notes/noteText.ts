/**
 * Text and date helpers for notes (pt-BR).
 */

import type { NoteTranscriptSegment } from '../../../lib/notesApi';

// ── TipTap doc → plain text ───────────────────────────────────────────────────

interface DocNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
}

function inlineText(node: DocNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'image') return '[imagem]';
  return (node.content ?? []).map(inlineText).join('');
}

function blockLines(node: DocNode, indent = ''): string[] {
  const children = node.content ?? [];
  switch (node.type) {
    case 'doc':
      return children.flatMap((child) => blockLines(child, indent));
    case 'paragraph':
    case 'heading':
      return [indent + inlineText(node)];
    case 'codeBlock':
      return inlineText(node).split('\n').map((line) => indent + line);
    case 'blockquote':
      return children.flatMap((child) => blockLines(child, `${indent}> `));
    case 'bulletList':
      return children.flatMap((item) => listItemLines(item, `${indent}- `, indent));
    case 'orderedList': {
      const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
      return children.flatMap((item, i) => listItemLines(item, `${indent}${start + i}. `, indent));
    }
    case 'taskList':
      return children.flatMap((item) =>
        listItemLines(item, `${indent}${item.attrs?.checked ? '[x]' : '[ ]'} `, indent),
      );
    case 'horizontalRule':
      return [`${indent}---`];
    case 'image':
      return [`${indent}[imagem]`];
    default:
      return children.length > 0
        ? children.flatMap((child) => blockLines(child, indent))
        : node.text
          ? [indent + node.text]
          : [];
  }
}

function listItemLines(item: DocNode, marker: string, indent: string): string[] {
  const [first, ...rest] = item.content ?? [];
  const firstLines = first ? blockLines(first) : [''];
  const nestedIndent = `${indent}  `;
  return [
    marker + (firstLines[0] ?? ''),
    ...firstLines.slice(1).map((line) => nestedIndent + line),
    ...rest.flatMap((child) => blockLines(child, nestedIndent)),
  ];
}

/** Plain text of a stored TipTap doc string (legacy plain-text rows pass through). */
export function docToPlainText(raw: string | null | undefined): string {
  if (!raw) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw.trim();
  }
  if (!parsed || typeof parsed !== 'object' || (parsed as DocNode).type !== 'doc') {
    return typeof parsed === 'string' ? parsed.trim() : raw.trim();
  }
  return blockLines(parsed as DocNode)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Fingerprint of a notes doc's text (every text node, whitespace collapsed;
 * FNV-1a). The server stores it with the summary (`summary_notes_fingerprint`),
 * so a different one means the notes changed since. Same algorithm as
 * notesFingerprint in packages/backend/src/services/noteService.ts — keep them
 * in sync.
 */
export function notesFingerprint(raw: string | null | undefined): string {
  // Inline text joins as is (bold or a link splits it into nodes); blocks and
  // line breaks are spaces. Formatting alone never changes the fingerprint.
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const { type, text, content } = node as { type?: unknown; text?: unknown; content?: unknown };
    if (typeof text === 'string') {
      parts.push(text);
      return;
    }
    if (type === 'hardBreak') parts.push(' ');
    if (Array.isArray(content)) {
      content.forEach(walk);
      parts.push(' ');
    }
  };
  if (raw) {
    try {
      walk(JSON.parse(raw));
    } catch {
      parts.push(raw);
    }
  }
  const text = parts.join('').replace(/\s+/g, ' ').trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length}:${hash.toString(16)}`;
}

export function isDocEmpty(raw: string | null | undefined): boolean {
  return docToPlainText(raw) === '';
}

/** A pasted or dropped file: `_attachments` at the doc root or an inline chip. */
export function docHasAttachments(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object') return false;
  const attachments = (parsed as { _attachments?: unknown })._attachments;
  if (Array.isArray(attachments) && attachments.length > 0) return true;
  const hasRef = (node: DocNode): boolean =>
    node.type === 'attachmentRef' || (node.content ?? []).some(hasRef);
  return hasRef(parsed as DocNode);
}

export function transcriptToPlainText(segments: NoteTranscriptSegment[]): string {
  return segments
    .filter((segment) => segment.text.trim() !== '')
    .map((segment) => `[${formatClock(segment.recorded_at)}] ${segment.text.trim()}`)
    .join('\n');
}

// ── Dates ─────────────────────────────────────────────────────────────────────

function capitalizedShortMonth(date: Date): string {
  return date
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .replace(/^./, (s) => s.toUpperCase());
}

/** "HH:mm" in local time */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "19 Out" (with the year when it is not the current one), like task chips */
export function formatDateChip(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const label = `${date.getDate()} ${capitalizedShortMonth(date)}`;
  return date.getFullYear() === new Date().getFullYear() ? label : `${label} ${date.getFullYear()}`;
}

function startOfDay(date: Date): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The day a note is about: the user-chosen `note_date` (`YYYY-MM-DD`, read as
 * a local day), else the local day it was created. Local midnight.
 */
export function noteDay(note: { note_date: string | null; created_at: string }): Date {
  const match = note.note_date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(startOfDay(new Date(note.created_at)));
}

/** Local day as the API's `note_date` (`YYYY-MM-DD`) */
export function toNoteDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type NoteDateGroup = 'upcoming' | 'today' | 'yesterday' | 'week' | 'older';

export const NOTE_DATE_GROUP_LABELS: Record<NoteDateGroup, string> = {
  upcoming: 'Próximas',
  today: 'Hoje',
  yesterday: 'Ontem',
  week: 'Últimos 7 dias',
  older: 'Mais antigas',
};

export function noteDateGroup(value: string | Date, now = new Date()): NoteDateGroup {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(value))) / DAY_MS);
  if (days < 0) return 'upcoming';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'week';
  return 'older';
}

/** "Gerado {relative}" helper — e.g. "há 5 minutos", "ontem" */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const diffSeconds = Math.round((time - now) / 1000);
  if (Math.abs(diffSeconds) < 45) return 'agora mesmo';

  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
  const diffDays = Math.round((startOfDay(new Date(time)) - startOfDay(new Date(now))) / DAY_MS);
  if (Math.abs(diffDays) < 7) return rtf.format(diffDays, 'day');
  return `em ${formatDateChip(iso)}`;
}
