import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { NotePatch } from '@/types/notes';
import { registerNoteSaves } from './summary-generation';
import { saveNotePatch } from './use-notes';

const TITLE_SAVE_DELAY_MS = 600;
const CONTENT_SAVE_DELAY_MS = 1000;

/**
 * Debounced saves of a note's title and notes (same delays as the web).
 * Pending edits are saved when the screen closes and before a summary is
 * generated; a failed save keeps them for the next try.
 */
export function useNoteAutosave(noteId: string) {
  const queryClient = useQueryClient();
  const pending = useRef<NotePatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    try {
      await saveNotePatch(queryClient, noteId, patch);
      setSaveFailed(false);
    } catch (error) {
      // Edits typed meanwhile win over the ones that failed.
      pending.current = { ...patch, ...pending.current };
      setSaveFailed(true);
      throw error;
    }
  }, [queryClient, noteId]);

  const schedule = useCallback(
    (patch: NotePatch, delay: number) => {
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush().catch(() => undefined), delay);
    },
    [flush],
  );

  useEffect(() => registerNoteSaves(noteId, flush), [noteId, flush]);
  useEffect(() => () => void flush().catch(() => undefined), [flush]);

  return {
    setTitle: useCallback((title: string) => schedule({ title }, TITLE_SAVE_DELAY_MS), [schedule]),
    setContent: useCallback((content: string) => schedule({ content }, CONTENT_SAVE_DELAY_MS), [schedule]),
    flush,
    saveFailed,
  };
}
