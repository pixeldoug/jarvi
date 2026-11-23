/**
 * What the chat wrote in a note (the agent's `update_note` tool).
 *
 * The backend already saved it. The open note keeps its own drafts, though
 * (see NoteDetailView), so the same edit is applied to them here: the text
 * shows up right away, and what the user typed while the chat was answering
 * stays (the view saves its doc again, with both). An edit that would replace
 * or remove a line typed over meanwhile is skipped there: the typing wins.
 *
 * For that the view has to know which text the agent read, so the chat also
 * tells it when a turn starts and when the agent is shown the note again.
 *
 * Module-level, like the transcription queue: the chat panel and the note
 * view are siblings under the page, not parent and child.
 */

import { useEffect, useRef } from 'react';
import type { DocEdit } from '../../../utils/docEdits';

export interface ChatNoteEdit {
  /**
   * The edits the chat made to the notes, as it sent them (none: only the
   * title changed). Applied with applyDocEditsToRaw (utils/docEdits.ts), the
   * same code the server ran.
   */
  edits: DocEdit[];
  /** The note's new title, when the chat set it */
  title?: string;
}

export interface ChatNoteHandlers {
  /** The chat wrote in the note */
  onEdit: (edit: ChatNoteEdit) => void;
  /** A chat turn about the note is starting: the agent reads it as it is now */
  onTurnStart: () => void;
  /**
   * An edit was held back and the agent was shown the note again, as the
   * server has it: `fingerprint` (notesFingerprint, noteText.ts) is of that text.
   */
  onReread: (fingerprint: string) => void;
}

type ChatNoteEvent =
  | { kind: 'edit'; edit: ChatNoteEdit }
  | { kind: 'turn' }
  | { kind: 'reread'; fingerprint: string };

type Listener = (event: ChatNoteEvent) => void;

const listeners = new Map<string, Set<Listener>>();

function publish(noteId: string, event: ChatNoteEvent): boolean {
  const targets = listeners.get(noteId);
  if (!targets || targets.size === 0) return false;
  targets.forEach((listener) => listener(event));
  return true;
}

/**
 * Hands the edit to the open view of `noteId`. False when the note is not
 * open: the caller refetches it instead.
 */
export function publishChatNoteEdit(noteId: string, edit: ChatNoteEdit): boolean {
  return publish(noteId, { kind: 'edit', edit });
}

/**
 * A chat turn about `noteId` is starting, its pending saves already sent: the
 * agent reads the note as it is now. The open view keeps that text, so an
 * edit that comes back never overwrites what was typed after it.
 */
export function markChatNoteTurn(noteId: string): void {
  publish(noteId, { kind: 'turn' });
}

/**
 * The agent's edit to `noteId` was held back (the user had changed that part)
 * and it was shown the note again. The open view moves on to that text too,
 * or the agent's corrected edit would be skipped there and then overwritten.
 */
export function markChatNoteReread(noteId: string, fingerprint: string): void {
  publish(noteId, { kind: 'reread', fingerprint });
}

/** Subscribes the open view of `noteId` to what the chat does with the note. */
export function useChatNoteEdits(noteId: string, handlers: ChatNoteHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const listener: Listener = (event) => {
      if (event.kind === 'edit') handlersRef.current.onEdit(event.edit);
      else if (event.kind === 'turn') handlersRef.current.onTurnStart();
      else handlersRef.current.onReread(event.fingerprint);
    };
    const targets = listeners.get(noteId) ?? new Set<Listener>();
    targets.add(listener);
    listeners.set(noteId, targets);
    return () => {
      targets.delete(listener);
      if (targets.size === 0) listeners.delete(noteId);
    };
  }, [noteId]);
}
