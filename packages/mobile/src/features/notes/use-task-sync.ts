/**
 * "Sincronizar com tarefas" for one note (port of the web's useSummaryTasks
 * dialog flow). Opening it gives every step its id, then asks the server which
 * steps the user already has as open tasks (`POST /notes/:id/task-matches`):
 * those are tied to that task (`link_task_id`) instead of repeating it, unless
 * the user asks for a new one. The existing task is never changed.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { notesApi } from '@/api/endpoints';
import { queryKeys } from '@/features/tasks/use-tasks';
import type { Task } from '@/types/models';
import { NOTE_TASKS_MAX_ITEMS, NOTE_TASK_TEXT_MAX_LENGTH, type NoteDetail, type NoteTaskMatch } from '@/types/notes';
import {
  ensureStepIds,
  linkSummaryTasks,
  parseSectionSteps,
  setSummaryTaskChecked,
  splitNextStepsSection,
  type SummaryTaskItem,
} from './summary-steps';
import { notesKeys, saveNotePatch } from './use-notes';

/** A task the user already has, offered for a step. */
export type ExistingTask = NoteTaskMatch['task'];

/** A step offered for syncing; every one has its `stepId` (saved before the sheet opens). */
export type SyncStep = SummaryTaskItem & { stepId: string };

export interface SyncResult {
  created: number;
  linked: number;
  skipped: number;
  failed: boolean;
}

/** The section's steps with text, minus the ones waiting for "Já é tarefa?". */
function syncSteps(summary: string | null): SyncStep[] {
  return parseSectionSteps(splitNextStepsSection(summary)?.section ?? []).filter(
    (step): step is SyncStep => step.text !== '' && !step.reviewOf && !!step.stepId,
  );
}

export function useTaskSync(note: NoteDetail | undefined) {
  const queryClient = useQueryClient();
  const noteId = note?.id;
  const [steps, setSteps] = useState<SyncStep[] | null>(null);
  /** Tasks the user already has, by `stepId`; null while they are being looked for */
  const [matches, setMatches] = useState<ReadonlyMap<string, ExistingTask> | null>(null);
  const [prepareFailed, setPrepareFailed] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const started = useRef(false);

  // Once per opening: ids first (the server links by them), then the lookup.
  useEffect(() => {
    if (!note || !noteId || started.current) return;
    started.current = true;
    void (async () => {
      const summary = note.summary;
      if (!summary) {
        setSteps([]);
        setMatches(new Map());
        return;
      }
      let withIds = summary;
      try {
        withIds = ensureStepIds(summary);
        if (withIds !== summary) await saveNotePatch(queryClient, noteId, { summary: withIds });
      } catch {
        setPrepareFailed(true);
        return;
      }
      const offered = syncSteps(withIds);
      setSteps(offered);
      // Every step without a task is checked, in batches of the server's limit, so a
      // long summary does not repeat a task from its later steps.
      const pending = offered.filter((step) => !step.taskId);
      const found = new Map<string, ExistingTask>();
      for (let start = 0; start < pending.length; start += NOTE_TASKS_MAX_ITEMS) {
        const chunk = pending.slice(start, start + NOTE_TASKS_MAX_ITEMS);
        try {
          const { matches: chunkMatches } = await notesApi.findTaskMatches(
            noteId,
            chunk.map((step) => step.text.slice(0, NOTE_TASK_TEXT_MAX_LENGTH)),
          );
          chunkMatches.forEach(({ index, task }) => {
            const step = chunk[index];
            if (step) found.set(step.stepId, task);
          });
        } catch (error) {
          // Nothing found is no reason to block: those steps become new tasks, as before.
          console.warn('task matches failed', error instanceof Error ? error.message : error);
        }
      }
      setMatches(found);
    })();
  }, [note, noteId, queryClient]);

  /** Creates (or ties) a task for each picked step. `useExisting`: stepId → the user's task. */
  const sync = async (picked: SyncStep[], useExisting: ReadonlyMap<string, string>): Promise<SyncResult> => {
    const result: SyncResult = { created: 0, linked: 0, skipped: 0, failed: false };
    if (!noteId || picked.length === 0) return result;
    setIsSyncing(true);
    const links: { stepId: string; taskId: string }[] = [];
    // A linked item mirrors its task: a new task is open; a task the user already had keeps its state.
    const checkedByTask = new Map<string, boolean>();
    const cachedTasks = queryClient.getQueryData<Task[]>(queryKeys.tasks) ?? [];
    try {
      for (let start = 0; start < picked.length; start += NOTE_TASKS_MAX_ITEMS) {
        const chunk = picked.slice(start, start + NOTE_TASKS_MAX_ITEMS);
        const { tasks } = await notesApi.createTasks(
          noteId,
          chunk.map((step) => {
            const linkTaskId = useExisting.get(step.stepId);
            return {
              text: step.text.slice(0, NOTE_TASK_TEXT_MAX_LENGTH),
              step_id: step.stepId,
              ...(linkTaskId ? { link_task_id: linkTaskId } : {}),
            };
          }),
        );
        tasks.forEach((task) => {
          if (!task.id || task.status === 'stale' || task.status === 'needs_review') {
            result.skipped += 1;
            return;
          }
          links.push({ stepId: task.step_id, taskId: task.id });
          if (task.status === 'created') {
            result.created += 1;
            checkedByTask.set(task.id, false);
          } else if (task.status === 'linked') {
            result.linked += 1;
            checkedByTask.set(task.id, !!cachedTasks.find((cached) => cached.id === task.id)?.completed);
          }
        });
      }
    } catch (error) {
      console.warn('note tasks failed', error instanceof Error ? error.message : error);
      result.failed = true;
    }

    if (links.length > 0) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      const current = queryClient.getQueryData<NoteDetail>(notesKeys.detail(noteId))?.summary;
      if (current) {
        const linked = setSummaryTaskChecked(linkSummaryTasks(current, links), checkedByTask);
        // The server keeps the links either way; the doc only mirrors them.
        if (linked !== current) await saveNotePatch(queryClient, noteId, { summary: linked }).catch(() => undefined);
      }
    }
    setIsSyncing(false);
    return result;
  };

  return { steps, matches, prepareFailed, isSyncing, sync };
}
