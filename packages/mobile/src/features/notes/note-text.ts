/**
 * Text and date helpers for Notas. Ports of packages/web/src/components/features/notes/noteText.ts.
 * Words and dates come from the i18n catalogs and format helpers (`@/i18n`);
 * group labels are resolved at render time from `notes:list.groups.<key>`.
 */
import { formatDate, formatTime, type Locale } from '@/i18n';
import { parseDateKey, startOfDay, toDateKey } from '@/lib/dates';
import type { NoteListItem, NoteTranscriptSegment } from '@/types/notes';

/**
 * Fingerprint of a notes doc's text (every text node, whitespace collapsed;
 * FNV-1a). The server stores it with the summary (`summary_notes_fingerprint`),
 * so a different one means the notes changed since. Same algorithm as
 * notesFingerprint in packages/backend/src/services/noteService.ts — keep them in sync.
 */
export function notesFingerprint(raw: string | null | undefined): string {
  // Inline text joins as is; blocks and line breaks are spaces.
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

/**
 * The summary misses newer notes or transcript: the notes' text changed since
 * it was generated, or a segment was recorded after it.
 */
export function isSummaryOutdated(note: {
  content: string;
  summary: string | null;
  summary_updated_at: string | null;
  summary_notes_fingerprint: string | null;
  segments: NoteTranscriptSegment[];
}): boolean {
  if (!note.summary || !note.summary_updated_at) return false;
  const generatedAt = Date.parse(note.summary_updated_at);
  const notesChanged =
    note.summary_notes_fingerprint !== null && note.summary_notes_fingerprint !== notesFingerprint(note.content);
  return notesChanged || note.segments.some((segment) => Date.parse(segment.created_at) > generatedAt);
}

/** The day a note is about: the chosen `note_date`, else the local day it was created. */
export function noteDay(note: Pick<NoteListItem, 'note_date' | 'created_at'>): Date {
  return parseDateKey(note.note_date) ?? startOfDay(new Date(note.created_at));
}

export type NoteDateGroup = 'upcoming' | 'today' | 'yesterday' | 'week' | 'older';

const GROUP_ORDER: NoteDateGroup[] = ['upcoming', 'today', 'yesterday', 'week', 'older'];

const DAY_MS = 24 * 60 * 60 * 1000;

export function noteDateGroup(day: Date, now: Date): NoteDateGroup {
  const days = Math.round((startOfDay(now).getTime() - startOfDay(day).getTime()) / DAY_MS);
  if (days < 0) return 'upcoming';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'week';
  return 'older';
}

export interface NoteSection {
  /** Also the label key: `notes:list.groups.<key>` */
  key: NoteDateGroup | 'pinned';
  data: NoteListItem[];
}

/** Same grouping as the web list: pinned first, then by day (newest first). */
export function noteSections(notes: NoteListItem[], now: Date): NoteSection[] {
  const pinned = notes
    .filter((note) => note.pinned_at)
    .sort((a, b) => Date.parse(b.pinned_at!) - Date.parse(a.pinned_at!));
  const byGroup = new Map<NoteDateGroup, NoteListItem[]>();
  notes
    .filter((note) => !note.pinned_at)
    .sort((a, b) => noteDay(b).getTime() - noteDay(a).getTime() || Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .forEach((note) => {
      const group = noteDateGroup(noteDay(note), now);
      byGroup.set(group, [...(byGroup.get(group) ?? []), note]);
    });
  return [
    ...(pinned.length > 0 ? [{ key: 'pinned' as const, data: pinned }] : []),
    ...GROUP_ORDER.filter((group) => byGroup.has(group)).map((group) => ({
      key: group,
      data: byGroup.get(group)!,
    })),
  ];
}

/**
 * Today / yesterday: the time it was created, while the note still sits on its
 * creation day ("09:30" / "9:30 AM"). Otherwise the date ("19 Out" / "Oct 19",
 * with the year when it is not this year's).
 */
export function noteTimeLabel(note: NoteListItem, now: Date, options?: { locale?: Locale }): string {
  if (note.date_removed) return '';
  const day = noteDay(note);
  const group = noteDateGroup(day, now);
  const onCreationDay = toDateKey(day) === toDateKey(new Date(note.created_at));
  return (group === 'today' || group === 'yesterday') && onCreationDay
    ? formatTime(note.created_at, 'clock', options)
    : formatDate(day, 'dayMonthAuto', { ...options, now });
}
