/**
 * Chat → tasks sync for pages that don't own the task list (Notas, Chats).
 *
 * create_task stores the AI's raw Markdown: persist it as a rich doc, with
 * the files sent in that turn embedded (same as the Tasks page); files sent
 * with a message that updates a task are merged into its description. Tasks
 * refetch once the structured descriptions are stored; categories the AI
 * creates, renames or deletes refetch right away (the Sidebar lists them).
 *
 * In note mode the AI can also write in the note (`update_note`): the open
 * note view applies it to its drafts; a note that is not open is refetched.
 */

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTasks } from '../contexts/TaskContext';
import { publishChatNoteEdit } from '../components/features/notes/chatNoteEdits';
import { parseDocEdits } from '../utils/docEdits';
import { buildAiTaskDescription, mergeAttachmentsIntoDescription } from '../utils/chatAttachments';
import type { ChatAttachment, ToolCallData } from './useChatStream';
import { notesKeys } from './useNotes';

export function useChatTaskSync() {
  const queryClient = useQueryClient();
  const { updateTask } = useTasks();

  // Files sent in a chat message, held until the AI's tool calls for that turn
  // arrive, so they can be attached to a task it creates (as on Tasks).
  const pendingChatAttachmentsRef = useRef<ChatAttachment[]>([]);
  const onAttachmentsSent = useCallback((attachments: ChatAttachment[]) => {
    pendingChatAttachmentsRef.current = attachments;
  }, []);

  const onTaskMutated = useCallback((toolCalls: ToolCallData[]) => {
    const writes: Promise<void>[] = [];
    toolCalls.forEach((tc) => {
      if (!tc.result?.success || !tc.result.data) return;
      const d = tc.result.data;
      const attachments = pendingChatAttachmentsRef.current;

      if (tc.toolName === 'create_category' || tc.toolName === 'update_category' || tc.toolName === 'delete_category') {
        void queryClient.invalidateQueries({ queryKey: ['categories'] });
      } else if (tc.toolName === 'update_note') {
        const noteId = typeof d.note_id === 'string' ? d.note_id : '';
        if (!noteId) return;
        const applied = publishChatNoteEdit(noteId, {
          // The edits as the model sent them: the server applied these same ones
          edits: d.content_changed === true ? parseDocEdits(tc.toolArgs.edits) : [],
          ...(d.title_changed === true && typeof d.note_title === 'string' ? { title: d.note_title } : {}),
        });
        // Not open (e.g. the conversation continued from Chats): the server
        // copy is the only one, so the caches just read it again.
        if (!applied) void queryClient.invalidateQueries({ queryKey: notesKeys.all });
      } else if (tc.toolName === 'create_task') {
        const rawDescription = (d.description as string | undefined) ?? '';
        pendingChatAttachmentsRef.current = [];
        if (rawDescription.trim() === '' && attachments.length === 0) return;
        writes.push(
          updateTask(
            d.id as string,
            { description: buildAiTaskDescription(rawDescription, attachments) },
            false,
          ).catch((err) => console.error('Failed to persist AI task description/attachments:', err)),
        );
      } else if (tc.toolName === 'update_task') {
        const description = d.description as string | undefined;
        if (description === undefined || attachments.length === 0) return;
        pendingChatAttachmentsRef.current = [];
        writes.push(
          updateTask(
            d.id as string,
            { description: mergeAttachmentsIntoDescription(description, attachments) },
            false,
          ).catch((err) => console.error('Failed to persist AI task attachments after update:', err)),
        );
      }
    });
    // Refetch once the structured descriptions are stored.
    void Promise.all(writes).then(() => queryClient.invalidateQueries({ queryKey: ['tasks'] }));
  }, [queryClient, updateTask]);

  return { onTaskMutated, onAttachmentsSent };
}
