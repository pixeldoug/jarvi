/**
 * Empty notes are not kept. "Nova nota" creates the note right away (the
 * recorder, autosave and chat need its id); leaving it with no title, notes,
 * attachments, transcript or summary deletes it, so the list never fills with
 * "Nova nota · Sem conteúdo".
 *
 * Runs after the view unmounted: pending edits are flushed first, and a note
 * that was reopened meanwhile (StrictMode's effect replay, back/forward) is
 * left alone.
 */

import type { QueryClient } from '@tanstack/react-query';
import { notesApi, type NoteDetail } from '../../../lib/notesApi';
import { notesKeys, removeNoteFromCache } from '../../../hooks/useNotes';
import { flushNoteSaves } from './noteAutosave';
import { docHasAttachments, isDocEmpty } from './noteText';
import { noteRecorder } from './useNoteRecorder';
import { transcriptionQueue } from './transcriptionQueue';
import { audioFileImport } from './audioFileImport';
import { isGeneratingSummary } from './summaryGeneration';

const openNoteIds = new Set<string>();

export function isNoteEmpty(note: NoteDetail): boolean {
  return (
    !note.title.trim()
    && isDocEmpty(note.content)
    && !docHasAttachments(note.content)
    && isDocEmpty(note.summary)
    && note.segments.length === 0
  );
}

/** Audio or a summary may still land in the note. */
function isNoteBusy(noteId: string): boolean {
  const recorder = noteRecorder.getSnapshot();
  return (
    (recorder.status !== 'idle' && recorder.noteId === noteId)
    || transcriptionQueue.pendingCount(noteId) > 0
    || audioFileImport.getSnapshot()?.noteId === noteId
    || isGeneratingSummary(noteId)
  );
}

export function markNoteOpen(noteId: string): void {
  openNoteIds.add(noteId);
}

/** Call when the note's view closes; deletes the note if nothing was added. */
export async function closeNote(queryClient: QueryClient, noteId: string): Promise<void> {
  openNoteIds.delete(noteId);
  await flushNoteSaves(queryClient, noteId);
  if (openNoteIds.has(noteId) || isNoteBusy(noteId)) return;

  const note = queryClient.getQueryData<NoteDetail>(notesKeys.detail(noteId));
  if (!note || note.access_level !== 'owner' || !isNoteEmpty(note)) return;

  // Off the list first, so going back to it never shows the empty note.
  removeNoteFromCache(queryClient, noteId);
  try {
    await notesApi.remove(noteId);
  } catch (error) {
    console.error('Failed to discard empty note:', error);
    void queryClient.invalidateQueries({ queryKey: notesKeys.all, exact: true });
  }
}
