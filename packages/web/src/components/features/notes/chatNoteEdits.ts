/**
 * What the chat wrote in a note (the agent's `update_note` tool).
 *
 * The backend already saved it. The open note keeps its own drafts, though
 * (see NoteDetailView), so the same edit is applied to them here: the text
 * shows up right away, and what the user typed while the chat was answering
 * stays (the view saves its doc again, with both).
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

type Listener = (edit: ChatNoteEdit) => void;

const listeners = new Map<string, Set<Listener>>();

/**
 * Hands the edit to the open view of `noteId`. False when the note is not
 * open: the caller refetches it instead.
 */
export function publishChatNoteEdit(noteId: string, edit: ChatNoteEdit): boolean {
  const targets = listeners.get(noteId);
  if (!targets || targets.size === 0) return false;
  targets.forEach((listener) => listener(edit));
  return true;
}

/** Subscribes the open view of `noteId` to what the chat writes in it. */
export function useChatNoteEdits(noteId: string, onEdit: Listener): void {
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;

  useEffect(() => {
    const listener: Listener = (edit) => onEditRef.current(edit);
    const targets = listeners.get(noteId) ?? new Set<Listener>();
    targets.add(listener);
    listeners.set(noteId, targets);
    return () => {
      targets.delete(listener);
      if (targets.size === 0) listeners.delete(noteId);
    };
  }, [noteId]);
}
