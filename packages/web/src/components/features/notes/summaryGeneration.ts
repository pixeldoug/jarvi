/**
 * AI summary generation (module-level, so an automatic summary started after
 * a recording finishes even if the user already left the Notes page).
 */

import { useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../lib/apiClient';
import { notesApi, type NoteDetail } from '../../../lib/notesApi';
import { cacheSummary, notesKeys } from '../../../hooks/useNotes';
import { captureProductEvent } from '../../../lib/productAnalytics';
import { toast } from '../../ui/Sonner';
import { flushNoteSaves } from './noteAutosave';
import { transcriptionQueue } from './transcriptionQueue';

export type SummarySource = 'manual' | 'auto';

const inFlight = new Map<string, Promise<boolean>>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Saves pending edits, then asks the server for a summary and stores it in
 * the cache. Concurrent calls for the same note share one request.
 * Resolves `true` on success.
 */
export function generateNoteSummary(
  queryClient: QueryClient,
  noteId: string,
  source: SummarySource,
): Promise<boolean> {
  const existing = inFlight.get(noteId);
  if (existing) return existing;

  const run = (async () => {
    try {
      await flushNoteSaves(queryClient, noteId);
      const res = await notesApi.generateSummary(noteId);
      cacheSummary(queryClient, noteId, res);
      captureProductEvent('note_summary_generated', { source });
      return true;
    } catch (error) {
      console.error('Failed to generate note summary:', error);
      if (error instanceof ApiError && error.status === 422) {
        toast.error('Escreva algumas notas ou grave um áudio primeiro.');
      } else if (!(error instanceof ApiError && error.status === 404)) {
        toast.error('Não foi possível gerar o resumo.');
      }
      return false;
    } finally {
      inFlight.delete(noteId);
      notify();
    }
  })();

  inFlight.set(noteId, run);
  notify();
  return run;
}

export function isGeneratingSummary(noteId: string): boolean {
  return inFlight.has(noteId);
}

export function useIsGeneratingSummary(noteId: string | undefined): boolean {
  return useSyncExternalStore(subscribe, () => (noteId ? inFlight.has(noteId) : false));
}

export interface AutoSummaryOptions {
  /** Checked once uploads drain — e.g. a new recording started on the note. */
  shouldSkip?: () => boolean;
  /** Called after the summary is stored. */
  onReady?: () => void;
}

/**
 * After a recording stops: once its segments are uploaded, generate the
 * summary if the note has a transcript and no summary yet.
 */
export async function scheduleAutoSummary(
  queryClient: QueryClient,
  noteId: string,
  options: AutoSummaryOptions = {},
): Promise<void> {
  await transcriptionQueue.whenIdle(noteId);
  if (options.shouldSkip?.()) return;

  let note = queryClient.getQueryData<NoteDetail>(notesKeys.detail(noteId));
  if (!note) {
    try {
      note = await notesApi.get(noteId);
      queryClient.setQueryData<NoteDetail>(notesKeys.detail(noteId), note);
    } catch {
      return;
    }
  }
  if (note.summary || note.segments.length === 0 || note.access_level === 'read') return;

  const ok = await generateNoteSummary(queryClient, noteId, 'auto');
  if (ok) options.onReady?.();
}
