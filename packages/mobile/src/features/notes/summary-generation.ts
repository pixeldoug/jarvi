/**
 * AI summary generation, module-level so the automatic summary after a
 * recording still runs when the user already left the note. Port of the web's
 * summaryGeneration.ts.
 */
import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { ApiError } from '@/api/client';
import { notesApi } from '@/api/endpoints';
import type { NoteDetail } from '@/types/notes';
import { transcriptionQueue } from './transcription-queue';
import { applySummary, notesKeys } from './use-notes';

const inFlight = new Map<string, Promise<SummaryResult>>();
const listeners = new Set<() => void>();
/** The open note's pending edits, saved before the server reads the note. */
const pendingSaves = new Map<string, () => Promise<void>>();

export type SummaryResult = 'ok' | 'empty' | 'failed';

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The note screen registers its autosave flush while it is open. */
export function registerNoteSaves(noteId: string, flush: () => Promise<void>): () => void {
  pendingSaves.set(noteId, flush);
  return () => {
    if (pendingSaves.get(noteId) === flush) pendingSaves.delete(noteId);
  };
}

/** Saves pending edits, then stores a new summary. Concurrent calls share one request. */
export function generateNoteSummary(queryClient: QueryClient, noteId: string): Promise<SummaryResult> {
  const existing = inFlight.get(noteId);
  if (existing) return existing;

  const run = (async (): Promise<SummaryResult> => {
    try {
      await pendingSaves.get(noteId)?.();
      applySummary(queryClient, noteId, await notesApi.generateSummary(noteId));
      return 'ok';
    } catch (error) {
      console.warn('note summary failed', error instanceof Error ? error.message : error);
      return error instanceof ApiError && error.status === 422 ? 'empty' : 'failed';
    } finally {
      inFlight.delete(noteId);
      notify();
    }
  })();

  inFlight.set(noteId, run);
  notify();
  return run;
}

export function useIsGeneratingSummary(noteId: string): boolean {
  return useSyncExternalStore(subscribe, () => inFlight.has(noteId));
}

/**
 * After a recording stops: once its segments are uploaded, generate the
 * summary when the note has a transcript and no summary yet (never replaces
 * one the user may have edited).
 */
export async function scheduleAutoSummary(queryClient: QueryClient, noteId: string): Promise<SummaryResult | null> {
  await transcriptionQueue.whenIdle(noteId);
  if (transcriptionQueue.snapshot(noteId).failed > 0) return null;
  const note = queryClient.getQueryData<NoteDetail>(notesKeys.detail(noteId));
  if (!note || note.summary || note.segments.length === 0) return null;
  return generateNoteSummary(queryClient, noteId);
}
