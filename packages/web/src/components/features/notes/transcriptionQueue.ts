/**
 * Transcription upload queue (module singleton).
 *
 * Uploads recorded segments one at a time — order matters for Whisper
 * continuity — with a couple of retries, and holds them while the connection
 * is down. It never touches React state, so it
 * keeps draining after the Notes page unmounts; results go straight into the
 * react-query cache.
 */

import { useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../lib/apiClient';
import { notesApi, type NoteDetail } from '../../../lib/notesApi';
import { cacheSegment, notesKeys } from '../../../hooks/useNotes';
import { toast } from '../../ui/Sonner';

export interface TranscriptionJob {
  noteId: string;
  blob: Blob;
  mimeType: string;
  /** ISO wall-clock start of the segment */
  recordedAt: string;
  durationMs: number;
}

interface QueueItem extends TranscriptionJob {
  queryClient: QueryClient;
  /** Sent on every attempt, so a retry never appends the segment twice. */
  segmentId?: string;
}

function newSegmentId(): string | undefined {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : undefined;
}

const RETRY_DELAYS_MS = [1500, 4000];
/**
 * 429 from the per-user limiter (fixed 60 s window): retrying within seconds
 * would fail again, so wait long enough for the window to reset.
 */
const RATE_LIMIT_RETRY_DELAYS_MS = [20_000, 45_000];
/**
 * No connection (offline, or the backend unreachable mid-deploy): a short
 * Wi-Fi drop must not lose audio, so the segment stays queued and is retried
 * until the connection is back, for up to OFFLINE_GIVE_UP_MS.
 */
const OFFLINE_RETRY_DELAYS_MS = [2000, 5000, 10_000, 20_000, 30_000];
const OFFLINE_GIVE_UP_MS = 10 * 60 * 1000;

const items: QueueItem[] = [];
/**
 * Segments whose upload failed for good, kept (with their place in the
 * transcript and their id) until `retryFailed` sends them again.
 */
const failedItems: QueueItem[] = [];
const deletedNoteIds = new Set<string>();
/** Wall-clock end of the latest segment queued per note this session */
const queuedAudioEnd = new Map<string, number>();
const listeners = new Set<() => void>();
const idleWaiters = new Map<string, Array<() => void>>();
let processing = false;

/** Where the note's audio ends so far: transcribed (cached) or queued. */
function audioEndMs(queryClient: QueryClient, noteId: string): number {
  let end = queuedAudioEnd.get(noteId) ?? 0;
  const note = queryClient.getQueryData<NoteDetail>(notesKeys.detail(noteId));
  for (const segment of note?.segments ?? []) {
    const segmentEnd = Date.parse(segment.recorded_at) + segment.duration_ms;
    if (Number.isFinite(segmentEnd)) end = Math.max(end, segmentEnd);
  }
  return end;
}

/**
 * The transcript is ordered by `recorded_at`, so audio added to a note lands
 * after what it already has: a file imported right after a recording (its
 * past timestamps) or a recording right after a long import would interleave.
 */
function placeAfterExistingAudio(queryClient: QueryClient, job: TranscriptionJob): string {
  const requested = Date.parse(job.recordedAt);
  if (!Number.isFinite(requested)) return job.recordedAt;
  const start = Math.max(requested, audioEndMs(queryClient, job.noteId));
  queuedAudioEnd.set(job.noteId, start + job.durationMs);
  return new Date(start).toISOString();
}

function pendingCount(noteId?: string): number {
  return noteId ? items.filter((item) => item.noteId === noteId).length : items.length;
}

function notify() {
  listeners.forEach((listener) => listener());
  // Resolve whenIdle() waiters for notes with nothing left.
  idleWaiters.forEach((waiters, noteId) => {
    if (pendingCount(noteId) > 0) return;
    idleWaiters.delete(noteId);
    waiters.forEach((resolve) => resolve());
  });
  syncBeforeUnloadGuard();
}

// Ask before closing the tab while audio is still being uploaded.
let guardInstalled = false;
function handleBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = '';
}
function syncBeforeUnloadGuard() {
  const shouldGuard = items.length > 0;
  if (shouldGuard && !guardInstalled) {
    window.addEventListener('beforeunload', handleBeforeUnload);
    guardInstalled = true;
  } else if (!shouldGuard && guardInstalled) {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    guardInstalled = false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Resolves after `ms`, or as soon as the browser is back online. */
function waitForConnection(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', done);
      resolve();
    };
    const timer = window.setTimeout(done, ms);
    window.addEventListener('online', done);
  });
}

function isConnectionError(error: unknown): boolean {
  // fetch rejects (TypeError) when the request never reached a server.
  if (!(error instanceof ApiError)) return true;
  return error.status === 502 || error.status === 503 || error.status === 504;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) {
    // Client errors will fail the same way again (rate limits excepted).
    if (error.status >= 400 && error.status < 500) return error.status === 408 || error.status === 429;
    return true;
  }
  // Network failures (fetch TypeError) and unknown errors.
  return true;
}

async function upload(item: QueueItem): Promise<void> {
  const audio = await blobToBase64(item.blob);
  let attempt = 0;
  let offlineSince: number | null = null;
  let offlineAttempt = 0;
  for (;;) {
    if (deletedNoteIds.has(item.noteId)) return;
    try {
      const { segment } = await notesApi.transcribe(item.noteId, {
        segmentId: item.segmentId,
        audio,
        mimeType: item.mimeType,
        recordedAt: item.recordedAt,
        durationMs: Math.round(item.durationMs),
      });
      if (segment) cacheSegment(item.queryClient, item.noteId, segment);
      return;
    } catch (error) {
      if (deletedNoteIds.has(item.noteId)) return;
      if (error instanceof ApiError && error.status === 404) return; // note is gone
      if (isConnectionError(error)) {
        // Waiting for the connection does not use up the retries.
        if (offlineSince === null) offlineSince = Date.now();
        if (Date.now() - offlineSince >= OFFLINE_GIVE_UP_MS) throw error;
        const lastDelay = OFFLINE_RETRY_DELAYS_MS.length - 1;
        await waitForConnection(OFFLINE_RETRY_DELAYS_MS[Math.min(offlineAttempt, lastDelay)]);
        offlineAttempt += 1;
        continue;
      }
      offlineSince = null;
      offlineAttempt = 0;
      if (attempt >= RETRY_DELAYS_MS.length || !isRetryable(error)) throw error;
      const isRateLimited = error instanceof ApiError && error.status === 429;
      await wait((isRateLimited ? RATE_LIMIT_RETRY_DELAYS_MS : RETRY_DELAYS_MS)[attempt]);
      attempt += 1;
    }
  }
}

async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    while (items.length > 0) {
      const item = items[0];
      try {
        await upload(item);
      } catch (error) {
        console.error('Transcription upload failed:', error);
        toast.error('Não foi possível transcrever um trecho do áudio.');
        if (!deletedNoteIds.has(item.noteId)) failedItems.push(item);
      }
      // Remove by identity: dropNote() may already have spliced it out.
      const index = items.indexOf(item);
      if (index >= 0) items.splice(index, 1);
      notify();
    }
  } finally {
    processing = false;
  }
}

export const transcriptionQueue = {
  enqueue(queryClient: QueryClient, job: TranscriptionJob): void {
    if (deletedNoteIds.has(job.noteId)) return;
    const recordedAt = placeAfterExistingAudio(queryClient, job);
    items.push({ ...job, recordedAt, queryClient, segmentId: newSegmentId() });
    notify();
    void processQueue();
  },

  /** Discards queued segments of a deleted note (an in-flight one is ignored). */
  dropNote(noteId: string): void {
    deletedNoteIds.add(noteId);
    // items[0] is the in-flight upload while processing; upload() skips it.
    const firstRemovable = processing ? 1 : 0;
    for (let i = items.length - 1; i >= firstRemovable; i -= 1) {
      if (items[i].noteId === noteId) items.splice(i, 1);
    }
    for (let i = failedItems.length - 1; i >= 0; i -= 1) {
      if (failedItems[i].noteId === noteId) failedItems.splice(i, 1);
    }
    notify();
  },

  pendingCount,

  /** Segments of `noteId` whose upload failed for good (missing from its transcript). */
  failedCount(noteId: string): number {
    return failedItems.filter((item) => item.noteId === noteId).length;
  },

  /**
   * Queues the failed segments of `noteId` again, at their original place in
   * the transcript and with the same id (never appended twice).
   */
  retryFailed(noteId: string): void {
    if (deletedNoteIds.has(noteId)) return;
    for (let i = 0; i < failedItems.length; ) {
      if (failedItems[i].noteId === noteId) items.push(...failedItems.splice(i, 1));
      else i += 1;
    }
    notify();
    void processQueue();
  },

  /** Resolves once no segment of `noteId` is queued or uploading. */
  whenIdle(noteId: string): Promise<void> {
    if (pendingCount(noteId) === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const waiters = idleWaiters.get(noteId) ?? [];
      waiters.push(resolve);
      idleWaiters.set(noteId, waiters);
    });
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Number of segments of `noteId` still queued or uploading. */
export function usePendingTranscriptions(noteId: string | undefined): number {
  return useSyncExternalStore(
    transcriptionQueue.subscribe,
    () => (noteId ? transcriptionQueue.pendingCount(noteId) : 0),
  );
}
