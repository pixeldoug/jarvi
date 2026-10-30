/**
 * Notes data hooks (react-query).
 *
 * Keys: `['notes']` for the list, `['notes', id]` for a note. The cache
 * helpers below take a QueryClient so modules that outlive the page (the
 * transcription queue, auto summaries) can keep the caches in sync too.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../lib/apiClient';
import {
  notesApi,
  type NoteDetail,
  type NoteListItem,
  type NotePatch,
  type NotePatchResponse,
  type NoteSummaryResponse,
  type NoteTranscriptSegment,
} from '../lib/notesApi';

export const notesKeys = {
  all: ['notes'] as const,
  detail: (id: string) => ['notes', id] as const,
};

function sortByUpdatedDesc(list: NoteListItem[]): NoteListItem[] {
  return [...list].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

function compareSegments(a: NoteTranscriptSegment, b: NoteTranscriptSegment): number {
  const diff = Date.parse(a.recorded_at) - Date.parse(b.recorded_at);
  return diff !== 0 ? diff : a.seq - b.seq;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

export function toListItem(note: NoteDetail, preview = ''): NoteListItem {
  return {
    id: note.id,
    title: note.title,
    preview,
    has_summary: !!note.summary,
    has_transcript: note.segments.length > 0,
    category: note.category,
    note_date: note.note_date,
    date_removed: note.date_removed,
    is_owner: note.access_level === 'owner',
    pinned_at: note.pinned_at,
    created_at: note.created_at,
    updated_at: note.updated_at,
  };
}

/** Seeds both caches with a freshly created note. */
export function cacheCreatedNote(queryClient: QueryClient, note: NoteDetail): void {
  queryClient.setQueryData<NoteDetail>(notesKeys.detail(note.id), note);
  queryClient.setQueryData<NoteListItem[]>(notesKeys.all, (old) =>
    old ? sortByUpdatedDesc([toListItem(note), ...old.filter((n) => n.id !== note.id)]) : old,
  );
}

/** Applies a local patch (optimistic) and, when given, the server response. */
export function cacheNotePatch(
  queryClient: QueryClient,
  id: string,
  patch: NotePatch & {
    /** Restores the flag as it was (rollback); else `note_date: null` removes the date */
    date_removed?: boolean;
  },
  response?: NotePatchResponse,
): void {
  const dateFields =
    patch.note_date !== undefined
      ? { note_date: patch.note_date, date_removed: patch.date_removed ?? patch.note_date === null }
      : {};
  queryClient.setQueryData<NoteDetail>(notesKeys.detail(id), (old) => {
    if (!old) return old;
    return {
      ...old,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...dateFields,
      ...(response ? { updated_at: response.updated_at } : {}),
    };
  });

  queryClient.setQueryData<NoteListItem[]>(notesKeys.all, (old) => {
    if (!old) return old;
    const next = old.map((n) => {
      if (n.id !== id) return n;
      return {
        ...n,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.summary !== undefined ? { has_summary: !!patch.summary } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...dateFields,
        // The title comes from the patch above: an older response arriving
        // late must not overwrite what the user typed since.
        ...(response ? { preview: response.preview, updated_at: response.updated_at } : {}),
      };
    });
    return response ? sortByUpdatedDesc(next) : next;
  });
}

export function cacheSummary(queryClient: QueryClient, id: string, res: NoteSummaryResponse): void {
  queryClient.setQueryData<NoteDetail>(notesKeys.detail(id), (old) =>
    old
      ? {
          ...old,
          summary: res.summary,
          summary_updated_at: res.summary_updated_at,
          summary_notes_fingerprint: res.summary_notes_fingerprint,
          title: res.title,
        }
      : old,
  );
  queryClient.setQueryData<NoteListItem[]>(notesKeys.all, (old) =>
    old?.map((n) =>
      n.id === id ? { ...n, has_summary: true, title: res.title, preview: res.preview } : n,
    ),
  );
}

export function cacheSegment(
  queryClient: QueryClient,
  noteId: string,
  segment: NoteTranscriptSegment,
): void {
  queryClient.setQueryData<NoteDetail>(notesKeys.detail(noteId), (old) => {
    if (!old || old.segments.some((s) => s.id === segment.id)) return old;
    return { ...old, segments: [...old.segments, segment].sort(compareSegments) };
  });
  queryClient.setQueryData<NoteListItem[]>(notesKeys.all, (old) =>
    old?.map((n) => (n.id === noteId && !n.has_transcript ? { ...n, has_transcript: true } : n)),
  );
}

export function removeNoteFromCache(queryClient: QueryClient, id: string): void {
  queryClient.removeQueries({ queryKey: notesKeys.detail(id), exact: true });
  queryClient.setQueryData<NoteListItem[]>(notesKeys.all, (old) => old?.filter((n) => n.id !== id));
}

// ── Queries ───────────────────────────────────────────────────────────────────

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function useNotesList() {
  const { token } = useAuth();
  return useQuery<NoteListItem[]>({
    queryKey: notesKeys.all,
    queryFn: () => notesApi.list(),
    enabled: !!token,
    select: sortByUpdatedDesc,
    retry: shouldRetry,
  });
}

export function useNote(id: string | undefined) {
  const { token } = useAuth();
  return useQuery<NoteDetail>({
    queryKey: notesKeys.detail(id ?? ''),
    queryFn: () => notesApi.get(id as string),
    enabled: !!token && !!id,
    retry: shouldRetry,
  });
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 403);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useNoteMutations() {
  const queryClient = useQueryClient();

  const createNote = useCallback(async (body: { title?: string; content?: string } = {}) => {
    const note = await notesApi.create(body);
    cacheCreatedNote(queryClient, note);
    return note;
  }, [queryClient]);

  /**
   * Category / date: discrete changes saved right away (not through the
   * autosave queue). Optimistic, rolled back if the request fails.
   */
  const updateNoteMeta = useCallback(
    async (id: string, patch: Pick<NotePatch, 'category' | 'note_date'>) => {
      const before = queryClient.getQueryData<NoteDetail>(notesKeys.detail(id))
        ?? queryClient.getQueryData<NoteListItem[]>(notesKeys.all)?.find((n) => n.id === id);
      cacheNotePatch(queryClient, id, patch);
      try {
        const response = await notesApi.update(id, patch);
        cacheNotePatch(queryClient, id, {}, response);
      } catch (error) {
        if (before) {
          cacheNotePatch(queryClient, id, {
            ...(patch.category !== undefined ? { category: before.category } : {}),
            ...(patch.note_date !== undefined
              ? { note_date: before.note_date, date_removed: before.date_removed }
              : {}),
          });
        }
        throw error;
      }
    },
    [queryClient],
  );

  /** Pin / unpin (optimistic, rolled back if the request fails). */
  const setNotePinned = useCallback(
    async (id: string, pinned: boolean) => {
      const listed = queryClient.getQueryData<NoteListItem[]>(notesKeys.all)?.find((n) => n.id === id);
      const before = listed?.pinned_at ?? queryClient.getQueryData<NoteDetail>(notesKeys.detail(id))?.pinned_at ?? null;
      const apply = (pinnedAt: string | null) => {
        queryClient.setQueryData<NoteDetail>(notesKeys.detail(id), (old) => (old ? { ...old, pinned_at: pinnedAt } : old));
        queryClient.setQueryData<NoteListItem[]>(notesKeys.all, (old) =>
          old?.map((n) => (n.id === id ? { ...n, pinned_at: pinnedAt } : n)),
        );
      };
      apply(pinned ? before ?? new Date().toISOString() : null);
      try {
        const { pinned_at: pinnedAt } = await notesApi.setPinned(id, pinned);
        apply(pinnedAt);
      } catch (error) {
        apply(before);
        throw error;
      }
    },
    [queryClient],
  );

  return { createNote, updateNoteMeta, setNotePinned };
}
