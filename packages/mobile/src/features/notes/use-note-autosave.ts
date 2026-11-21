import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { noteSaves } from './note-saves';

const TITLE_SAVE_DELAY_MS = 600;
const CONTENT_SAVE_DELAY_MS = 1000;

/**
 * Debounced saves of a note's title and notes (same delays as the web),
 * through `noteSaves` so they run in order and outlive the screen. Edits a
 * failed save kept are sent again when the note opens and when it closes.
 */
export function useNoteAutosave(noteId: string) {
  const queryClient = useQueryClient();
  const saveFailed = useSyncExternalStore(noteSaves.subscribe, () => noteSaves.isFailed(noteId));

  const flush = useCallback(() => noteSaves.flush(queryClient, noteId), [queryClient, noteId]);

  // Opening the note retries what an earlier visit could not save; closing it saves the rest.
  useEffect(() => {
    void flush().catch(() => undefined);
    return () => void flush().catch(() => undefined);
  }, [flush]);

  return {
    setTitle: useCallback(
      (title: string) => noteSaves.schedule(queryClient, noteId, { title }, TITLE_SAVE_DELAY_MS),
      [queryClient, noteId],
    ),
    setContent: useCallback(
      (content: string) => noteSaves.schedule(queryClient, noteId, { content }, CONTENT_SAVE_DELAY_MS),
      [queryClient, noteId],
    ),
    flush,
    saveFailed,
  };
}
