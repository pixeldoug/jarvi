import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { notesApi } from '@/api/endpoints';
import type {
  NoteDetail,
  NoteListItem,
  NotePatch,
  NoteSummaryResponse,
  NoteTranscriptSegment,
} from '@/types/notes';

/** `['notes']` is the list, `['notes', id]` a note (same keys as the web). */
export const notesKeys = {
  all: ['notes'] as const,
  detail: (id: string) => ['notes', id] as const,
};

const listOnly = { queryKey: notesKeys.all, exact: true } as const;

function toListItem(note: NoteDetail): NoteListItem {
  return {
    id: note.id,
    title: note.title,
    preview: '',
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

function updateDetail(queryClient: QueryClient, id: string, update: (note: NoteDetail) => NoteDetail) {
  queryClient.setQueryData<NoteDetail>(notesKeys.detail(id), (old) => (old ? update(old) : old));
}

function updateListItem(queryClient: QueryClient, id: string, update: (note: NoteListItem) => NoteListItem) {
  queryClient.setQueryData<NoteListItem[]>(notesKeys.all, (old) => old?.map((note) => (note.id === id ? update(note) : note)));
}

export function useNotes() {
  return useQuery({ queryKey: notesKeys.all, queryFn: notesApi.list });
}

export function useNote(id: string) {
  return useQuery({ queryKey: notesKeys.detail(id), queryFn: () => notesApi.get(id) });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notesApi.create,
    onSuccess: (note) => {
      queryClient.setQueryData(notesKeys.detail(note.id), note);
      queryClient.setQueryData<NoteListItem[]>(notesKeys.all, (old) =>
        old ? [toListItem(note), ...old.filter((n) => n.id !== note.id)] : old,
      );
    },
  });
}

/** Saves a patch and mirrors the server's answer (title, preview) in both caches. */
export async function saveNotePatch(queryClient: QueryClient, id: string, patch: NotePatch): Promise<void> {
  const saved = await notesApi.update(id, patch);
  updateDetail(queryClient, id, (note) => ({
    ...note,
    ...patch,
    title: saved.title,
    updated_at: saved.updated_at,
    summary_updated_at: saved.summary_updated_at,
  }));
  updateListItem(queryClient, id, (note) => ({
    ...note,
    title: saved.title,
    preview: saved.preview,
    updated_at: saved.updated_at,
    ...(patch.summary !== undefined ? { has_summary: !!patch.summary } : {}),
  }));
}

export function applySummary(queryClient: QueryClient, id: string, result: NoteSummaryResponse) {
  updateDetail(queryClient, id, (note) => ({
    ...note,
    // The server fills an empty title with the AI's suggestion.
    title: result.title,
    summary: result.summary,
    summary_updated_at: result.summary_updated_at,
    summary_notes_fingerprint: result.summary_notes_fingerprint,
  }));
  updateListItem(queryClient, id, (note) => ({ ...note, title: result.title, preview: result.preview, has_summary: true }));
}

export function setNoteSummary(queryClient: QueryClient, id: string, summary: string | null) {
  updateDetail(queryClient, id, (note) => ({ ...note, summary }));
}

/** Adds a transcribed segment in transcript order. */
export function cacheSegment(queryClient: QueryClient, id: string, segment: NoteTranscriptSegment) {
  updateDetail(queryClient, id, (note) => ({
    ...note,
    segments: [...note.segments.filter((s) => s.id !== segment.id), segment].sort(
      (a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at) || a.seq - b.seq,
    ),
  }));
  updateListItem(queryClient, id, (note) => ({ ...note, has_transcript: true }));
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notesApi.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries(listOnly);
      const previous = queryClient.getQueryData<NoteListItem[]>(notesKeys.all);
      queryClient.setQueryData<NoteListItem[]>(notesKeys.all, (old) => old?.filter((note) => note.id !== id));
      return { previous };
    },
    onSuccess: (_result, id) => queryClient.removeQueries({ queryKey: notesKeys.detail(id) }),
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(notesKeys.all, context.previous);
    },
  });
}

export function useSetNotePinned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => notesApi.setPinned(id, pinned),
    onMutate: async ({ id, pinned }) => {
      await queryClient.cancelQueries(listOnly);
      const pinnedAt = pinned ? new Date().toISOString() : null;
      updateListItem(queryClient, id, (note) => ({ ...note, pinned_at: pinnedAt }));
      updateDetail(queryClient, id, (note) => ({ ...note, pinned_at: pinnedAt }));
    },
    onSuccess: ({ pinned_at: pinnedAt }, { id }) => {
      updateListItem(queryClient, id, (note) => ({ ...note, pinned_at: pinnedAt }));
      updateDetail(queryClient, id, (note) => ({ ...note, pinned_at: pinnedAt }));
    },
    onError: () => queryClient.invalidateQueries(listOnly),
  });
}
