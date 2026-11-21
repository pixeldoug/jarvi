/**
 * Uploads recorded segments for transcription, one at a time and in order
 * (the server sends the previous segment's tail to Whisper as context). It
 * outlives the note screen: leaving a note mid-upload finishes the queue.
 *
 * Each segment keeps its client uuid across retries, so the server answers a
 * retried upload with the stored segment instead of a duplicate. The audio
 * file is deleted once the text is saved (docs/decisions/0003: Notas keep the
 * transcript, never the audio).
 *
 * Every segment belongs to the account that recorded it: the queue only runs
 * while that account is signed in (the API client sends the current session),
 * and pauses on sign-out, so another account never gets a 404 for it and
 * deletes the recording.
 */
import type { QueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';

import { ApiError } from '@/api/client';
import { notesApi } from '@/api/endpoints';
import { cacheSegment } from './use-notes';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

interface QueueItem {
  /** The user who recorded it */
  accountId: string;
  segmentId: string;
  noteId: string;
  uri: string;
  mimeType: string;
  recordedAt: string;
  durationMs: number;
  attempts: number;
  failed: boolean;
}

export interface QueueSnapshot {
  /** Waiting or uploading */
  pending: number;
  /** Gave up after the retries (kept for "Tentar de novo") */
  failed: number;
}

const EMPTY: QueueSnapshot = { pending: 0, failed: 0 };

/** RFC 4122 v4 (the server only accepts uuids as segment ids). */
export function uuidV4(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16));
  hex[12] = 4;
  hex[16] = (hex[16]! & 0x3) | 0x8;
  const s = hex.map((n) => n.toString(16)).join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function deleteFile(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // Already gone (the cache directory can be purged by the OS).
  }
}

function createQueue() {
  let items: QueueItem[] = [];
  let running = false;
  let queryClient: QueryClient | null = null;
  /** The signed-in user; null pauses the queue */
  let account: string | null = null;
  const listeners = new Set<() => void>();
  const snapshots = new Map<string, QueueSnapshot>();
  const idleWaiters: { noteId: string; resolve: () => void }[] = [];

  const notify = () => {
    snapshots.clear();
    listeners.forEach((listener) => listener());
    const busy = new Set(items.filter((item) => !item.failed).map((item) => item.noteId));
    for (let i = idleWaiters.length - 1; i >= 0; i -= 1) {
      const waiter = idleWaiters[i]!;
      if (!busy.has(waiter.noteId)) {
        idleWaiters.splice(i, 1);
        waiter.resolve();
      }
    }
  };

  const upload = async (item: QueueItem) => {
    const audio = await new File(item.uri).base64();
    const { segment } = await notesApi.transcribe(item.noteId, {
      segmentId: item.segmentId,
      audio,
      mimeType: item.mimeType,
      recordedAt: item.recordedAt,
      durationMs: item.durationMs,
    });
    if (segment && queryClient) cacheSegment(queryClient, item.noteId, segment);
  };

  const run = async () => {
    if (running) return;
    running = true;
    for (;;) {
      const item = items.find((candidate) => !candidate.failed && candidate.accountId === account);
      if (!item) break;
      try {
        await upload(item);
        items = items.filter((candidate) => candidate !== item);
        deleteFile(item.uri);
      } catch (error) {
        // The session changed mid-request: this answer is not about its account.
        if (account !== item.accountId) {
          notify();
          continue;
        }
        item.attempts += 1;
        // No status: the file could not be read (the OS purged it); retrying will not help.
        const status = error instanceof ApiError ? error.status : null;
        if (status === 404) {
          // The note was deleted.
          items = items.filter((candidate) => candidate !== item);
          deleteFile(item.uri);
        } else if (status === null || status === 403 || item.attempts >= MAX_ATTEMPTS) {
          item.failed = true;
        } else {
          await sleep(RETRY_DELAY_MS * item.attempts);
        }
        console.warn('note transcription failed', error instanceof Error ? error.message : error);
      }
      notify();
    }
    running = false;
  };

  return {
    /** Lets uploads update the note caches (set once by the signed-in layout). */
    setQueryClient(client: QueryClient) {
      queryClient = client;
    },

    /** The signed-in user (the signed-in layout keeps it current); null on sign-out pauses uploads. */
    setAccount(id: string | null) {
      account = id;
      notify();
      if (id) void run();
    },

    /** The signed-in user, to tie a recording to its account when it starts. */
    currentAccount(): string | null {
      return account;
    },

    /**
     * Queues a segment for `accountId` (the recording's account, so the last
     * segment of a recording cut by a sign-out is kept for when it returns).
     */
    enqueue(input: Omit<QueueItem, 'attempts' | 'failed'>) {
      items = [...items, { ...input, attempts: 0, failed: false }];
      notify();
      void run();
    },

    retryFailed(noteId: string) {
      items.forEach((item) => {
        if (item.noteId === noteId && item.failed) {
          item.failed = false;
          item.attempts = 0;
        }
      });
      notify();
      void run();
    },

    /** Resolves once the note has nothing left to upload (failed segments do not count). */
    whenIdle(noteId: string): Promise<void> {
      if (!items.some((item) => item.noteId === noteId && !item.failed)) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push({ noteId, resolve }));
    },

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** Stable per note between changes (for useSyncExternalStore). */
    snapshot(noteId: string): QueueSnapshot {
      const cached = snapshots.get(noteId);
      if (cached) return cached;
      const mine = items.filter((item) => item.noteId === noteId);
      const next = mine.length === 0 ? EMPTY : { pending: mine.filter((i) => !i.failed).length, failed: mine.filter((i) => i.failed).length };
      snapshots.set(noteId, next);
      return next;
    },
  };
}

export const transcriptionQueue = createQueue();
