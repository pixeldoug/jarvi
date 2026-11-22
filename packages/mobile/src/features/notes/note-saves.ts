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
 * - Edits belong to the account that typed them: they are kept per account,
 *   sent only while that account is signed in, and never shown to another
 *   one (a shared note has the same id for everyone).
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
/** The signed-in user; null (signed out) holds every save. */
let account: string | null = null;

const keyOf = (accountId: string, noteId: string) => `${accountId}\u0000${noteId}`;

function stateOf(accountId: string, noteId: string): NoteSaveState {
  const key = keyOf(accountId, noteId);
  let state = states.get(key);
  if (!state) {
    state = { pending: {}, chain: Promise.resolve(), timer: null, failed: false };
    states.set(key, state);
  }
  return state;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function setFailed(state: NoteSaveState, failed: boolean) {
  if (state.failed === failed) return;
  state.failed = failed;
  notify();
}

export const noteSaves = {
  /** The signed-in user (the signed-in layout keeps it current). Signing out stops every timer. */
  setAccount(id: string | null) {
    if (id === account) return;
    account = id;
    states.forEach((state) => {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
    });
    notify();
  },

  /** Queues edits and saves them after `delay` ms without new ones. */
  schedule(queryClient: QueryClient, noteId: string, patch: NotePatch, delay: number) {
    if (!account) return;
    const state = stateOf(account, noteId);
    state.pending = { ...state.pending, ...patch };
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => void noteSaves.flush(queryClient, noteId).catch(() => undefined), delay);
  },

  /**
   * Saves the signed-in user's pending edits now; resolves once every earlier
   * save is done. Rejects if this one failed. Signed out, it saves nothing.
   */
  flush(queryClient: QueryClient, noteId: string): Promise<void> {
    if (!account) return Promise.resolve();
    const owner = account;
    const state = stateOf(owner, noteId);
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    const run = state.chain
      .catch(() => undefined)
      .then(async () => {
        // Another account signed in meanwhile: these edits wait for theirs.
        if (account !== owner) return;
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

  /** The signed-in user's edits of this note that the server does not have yet. */
  unsaved(noteId: string): NotePatch {
    return account ? (states.get(keyOf(account, noteId))?.pending ?? {}) : {};
  },

  isFailed(noteId: string): boolean {
    return account ? (states.get(keyOf(account, noteId))?.failed ?? false) : false;
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
