/**
 * Saves of a note's title and notes, module-level so they outlive the screen.
 *
 * - One save at a time per note, in order: a newer edit is never overwritten
 *   by an older request that reaches the server last.
 * - `flush()` waits for every save already started, so a summary or the note
 *   chat reads what the user typed.
 * - A failed save keeps its edits here (merged under anything typed since).
 *   Reopening the note shows them and sends them again, so leaving a note
 *   offline does not lose them while the app stays open.
 */
import type { QueryClient } from '@tanstack/react-query';

import type { NotePatch } from '@/types/notes';
import { saveNotePatch } from './use-notes';

interface NoteSaveState {
  /** Edits not sent yet (or sent and failed) */
  pending: NotePatch;
  /** The last save started; every new one waits for it */
  chain: Promise<void>;
  timer: ReturnType<typeof setTimeout> | null;
  failed: boolean;
}

const states = new Map<string, NoteSaveState>();
const listeners = new Set<() => void>();

function stateOf(noteId: string): NoteSaveState {
  let state = states.get(noteId);
  if (!state) {
    state = { pending: {}, chain: Promise.resolve(), timer: null, failed: false };
    states.set(noteId, state);
  }
  return state;
}

function setFailed(state: NoteSaveState, failed: boolean) {
  if (state.failed === failed) return;
  state.failed = failed;
  listeners.forEach((listener) => listener());
}

export const noteSaves = {
  /** Queues edits and saves them after `delay` ms without new ones. */
  schedule(queryClient: QueryClient, noteId: string, patch: NotePatch, delay: number) {
    const state = stateOf(noteId);
    state.pending = { ...state.pending, ...patch };
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => void noteSaves.flush(queryClient, noteId).catch(() => undefined), delay);
  },

  /** Saves the pending edits now; resolves once every earlier save is done. Rejects if this one failed. */
  flush(queryClient: QueryClient, noteId: string): Promise<void> {
    const state = stateOf(noteId);
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    const run = state.chain
      .catch(() => undefined)
      .then(async () => {
        const patch = state.pending;
        if (Object.keys(patch).length === 0) return;
        state.pending = {};
        try {
          await saveNotePatch(queryClient, noteId, patch);
          setFailed(state, false);
        } catch (error) {
          // Edits typed meanwhile win over the ones that failed.
          state.pending = { ...patch, ...state.pending };
          setFailed(state, true);
          throw error;
        }
      });
    state.chain = run;
    return run;
  },

  /** Edits of this note the server does not have yet. */
  unsaved(noteId: string): NotePatch {
    return states.get(noteId)?.pending ?? {};
  },

  isFailed(noteId: string): boolean {
    return states.get(noteId)?.failed ?? false;
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
