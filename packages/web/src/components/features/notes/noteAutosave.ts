/**
 * Debounced autosave for a note's title / notes / summary.
 *
 * Unsaved fields live in a module-level map keyed by note id, so they outlive
 * the view: a save that fails on unmount is retried in the background, a
 * reopened note sends what is left, and a `beforeunload` guard stays up while
 * anything is unsaved. Saves of one note run one at a time (a newer PATCH
 * never races an older one), each taking the newest merged fields.
 * Timers live in refs and are flushed (not dropped) on unmount, so a
 * StrictMode re-run or a note switch never loses the last keystrokes and
 * never writes them to the wrong note.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../lib/apiClient';
import { notesApi, type NotePatch } from '../../../lib/notesApi';
import { cacheNotePatch } from '../../../hooks/useNotes';
import { toast } from '../../ui/Sonner';

/** Background retries after a retryable failure (network, 5xx, 408, 429). */
const RETRY_DELAYS_MS = [5_000, 15_000, 60_000];

/** Fields typed but not yet sent, by note id (never holds an empty patch). */
const pendingByNote = new Map<string, NotePatch>();
/** Tail of each note's save chain while a save is queued or in flight. */
const saveChains = new Map<string, Promise<void>>();
const retryTimers = new Map<string, number>();
const retryAttempts = new Map<string, number>();
/** Notes whose current failure streak already showed a toast. */
const errorShown = new Set<string>();
/** Last "too large" toast per note: shown on every failed save, at most one at a time. */
const tooLargeToastAt = new Map<string, number>();
const TOO_LARGE_TOAST_MS = 6000;
/** The app's QueryClient, for saves started outside a hook (beforeunload). */
let lastQueryClient: QueryClient | null = null;

function getPending(noteId: string): NotePatch {
  return pendingByNote.get(noteId) ?? {};
}

function setPending(noteId: string, patch: NotePatch): void {
  if (Object.keys(patch).length > 0) pendingByNote.set(noteId, patch);
  else pendingByNote.delete(noteId);
  syncBeforeUnloadGuard();
}

function hasUnsaved(noteId: string): boolean {
  return pendingByNote.has(noteId) || saveChains.has(noteId);
}

// Ask before closing the tab with unsaved edits (and try to save them).
let guardInstalled = false;
function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (lastQueryClient) {
    for (const noteId of pendingByNote.keys()) {
      if (!saveChains.has(noteId)) void saveNote(lastQueryClient, noteId);
    }
  }
  event.preventDefault();
  event.returnValue = '';
}
function syncBeforeUnloadGuard() {
  const shouldGuard = pendingByNote.size > 0 || saveChains.size > 0;
  if (shouldGuard && !guardInstalled) {
    window.addEventListener('beforeunload', handleBeforeUnload);
    guardInstalled = true;
  } else if (!shouldGuard && guardInstalled) {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    guardInstalled = false;
  }
}

function scheduleRetry(queryClient: QueryClient, noteId: string): void {
  if (retryTimers.has(noteId)) return;
  const attempt = retryAttempts.get(noteId) ?? 0;
  // Out of retries: the fields stay pending (and guarded) until the next
  // edit, flush or reopen of the note.
  if (attempt >= RETRY_DELAYS_MS.length) return;
  retryAttempts.set(noteId, attempt + 1);
  retryTimers.set(
    noteId,
    window.setTimeout(() => {
      retryTimers.delete(noteId);
      void saveNote(queryClient, noteId);
    }, RETRY_DELAYS_MS[attempt]),
  );
}

/** Same rule as the transcription queue: client errors fail the same way again. */
function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  if (error.status >= 400 && error.status < 500) return error.status === 408 || error.status === 429;
  return true;
}

function handleSaveError(
  queryClient: QueryClient,
  noteId: string,
  patch: NotePatch,
  error: unknown,
): void {
  // The note was deleted (e.g. right after typing): nothing left to save.
  if (error instanceof ApiError && error.status === 404) {
    setPending(noteId, {});
    return;
  }
  console.error('Failed to save note:', error);

  if (error instanceof ApiError && error.status === 413) {
    // Drop only the oversized field (it would fail forever and block every
    // later save); the others (e.g. the title) still save.
    const tooLarge: Array<keyof NotePatch> =
      error.message === 'content_too_large'
        ? ['content']
        : error.message === 'summary_too_large'
          ? ['summary']
          : ['content', 'summary'];
    const keep: NotePatch = { ...patch };
    tooLarge.forEach((field) => delete keep[field]);
    setPending(noteId, { ...keep, ...getPending(noteId) });
    const now = Date.now();
    if (now - (tooLargeToastAt.get(noteId) ?? 0) >= TOO_LARGE_TOAST_MS) {
      tooLargeToastAt.set(noteId, now);
      toast.error(
        tooLarge.includes('content')
          ? 'A nota passou do limite de 10 MB. Remova anexos grandes para salvar.'
          : 'O resumo passou do limite de 10 MB. Remova anexos grandes para salvar.',
        { duration: TOO_LARGE_TOAST_MS },
      );
    }
    if (pendingByNote.has(noteId)) void saveNote(queryClient, noteId);
    return;
  }

  // Keep the failed fields unless newer values were typed since. Saves are
  // serialized, so nothing newer can be in flight. A client error (e.g. an
  // expired session or lost write access) would fail the same way again, so
  // it gets no background retry, but its fields stay pending (and guarded)
  // until the next edit, flush or reopen of the note.
  setPending(noteId, { ...patch, ...getPending(noteId) });
  if (isRetryable(error)) scheduleRetry(queryClient, noteId);
  if (!errorShown.has(noteId)) {
    errorShown.add(noteId);
    toast.error('Não foi possível salvar a nota.');
  }
}

/**
 * Queues a save of `noteId`'s pending fields behind any save already queued
 * or in flight. Never rejects; resolves once this save settled.
 */
function saveNote(queryClient: QueryClient, noteId: string): Promise<void> {
  lastQueryClient = queryClient;
  const queued = pendingByNote.get(noteId);
  // Nothing new to send: just wait for the save in flight, if any.
  if (!queued) return saveChains.get(noteId) ?? Promise.resolve();
  // Optimistic, right away: a remount (tab switch, back navigation) reads the
  // latest text even while an older save is still in flight.
  cacheNotePatch(queryClient, noteId, queued);

  const run = async () => {
    const patch = getPending(noteId);
    if (Object.keys(patch).length === 0) return;
    setPending(noteId, {});
    cacheNotePatch(queryClient, noteId, patch);
    try {
      const response = await notesApi.update(noteId, patch);
      cacheNotePatch(queryClient, noteId, {}, response);
      errorShown.delete(noteId);
      retryAttempts.delete(noteId);
    } catch (error) {
      handleSaveError(queryClient, noteId, patch, error);
    }
  };

  const next = (saveChains.get(noteId) ?? Promise.resolve()).then(run, run);
  saveChains.set(noteId, next);
  syncBeforeUnloadGuard();
  void next.finally(() => {
    if (saveChains.get(noteId) === next) saveChains.delete(noteId);
    syncBeforeUnloadGuard();
  });
  return next;
}

/**
 * Saves `noteId`'s pending edits and waits for any save already in flight,
 * so summary generation sees the latest content (even after the view
 * unmounted).
 */
export async function flushNoteSaves(queryClient: QueryClient, noteId: string): Promise<void> {
  await saveNote(queryClient, noteId);
}

export interface NoteAutosave {
  /** Merges `patch` into the pending save and (re)starts the debounce timer. */
  schedule: (patch: NotePatch, delayMs: number) => void;
  /** Saves pending changes right away. Resolves when the request settles. */
  flush: () => Promise<void>;
  /** True while there are unsaved or in-flight changes. */
  hasPending: () => boolean;
  /** True when `field` has a value waiting to be saved. */
  isPending: (field: keyof NotePatch) => boolean;
}

export function useNoteAutosave(noteId: string): NoteAutosave {
  const queryClient = useQueryClient();
  const timerRef = useRef<number | null>(null);

  const flushFor = useCallback((id: string) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return saveNote(queryClient, id);
  }, [queryClient]);

  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;

  const flush = useCallback(() => flushFor(noteIdRef.current), [flushFor]);

  const schedule = useCallback((patch: NotePatch, delayMs: number) => {
    const id = noteIdRef.current;
    lastQueryClient = queryClient;
    setPending(id, { ...getPending(id), ...patch });
    // A new edit starts a fresh retry streak.
    retryAttempts.delete(id);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flushFor(id);
    }, delayMs);
  }, [flushFor, queryClient]);

  const hasPending = useCallback(() => hasUnsaved(noteIdRef.current), []);

  const isPending = useCallback(
    (field: keyof NotePatch) => getPending(noteIdRef.current)[field] !== undefined,
    [],
  );

  // On (re)open, send edits a failed save left behind; on note switch /
  // unmount, save what is left to the note it was typed into.
  useEffect(() => {
    const id = noteId;
    if (pendingByNote.has(id)) void flushFor(id);
    return () => {
      void flushFor(id);
    };
  }, [noteId, flushFor]);

  return { schedule, flush, hasPending, isPending };
}
