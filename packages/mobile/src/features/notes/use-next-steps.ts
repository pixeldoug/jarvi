/**
 * The summary's "Próximos passos" for one note: the steps as task rows and
 * "Já é tarefa?". Same rules as the web (memory notes-next-step-identity):
 * steps stay in the note until the user syncs them ("Sincronizar com tarefas",
 * use-task-sync.ts), each step is converted once (the server links it by
 * `stepId`), and a step a regeneration flagged (`reviewOf`) waits for the
 * user's answer.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { notesApi } from '@/api/endpoints';
import { useTasks } from '@/features/tasks/use-tasks';
import { useToggleWithFeedback } from '@/features/tasks/use-toggle-with-feedback';
import type { NoteDetail, NoteStepDecision } from '@/types/notes';
import { saveNotePatch, setNoteSummary } from './use-notes';
import {
  isConvertibleStep,
  listStepReviews,
  parseSectionSteps,
  parseSummaryTasks,
  splitNextStepsSection,
  updateSummaryStep,
  type SummaryStepReview,
  type SummaryTaskItem,
} from './summary-steps';

export interface NextStep extends SummaryTaskItem {
  /** The linked task's state when it is loaded, else the item's own */
  done: boolean;
}

export function useNextSteps(note: NoteDetail) {
  const queryClient = useQueryClient();
  const tasks = useTasks();
  const toggleTask = useToggleWithFeedback();
  const noteId = note.id;
  const summary = note.summary;

  const split = useMemo(() => splitNextStepsSection(summary), [summary]);
  const steps = useMemo((): NextStep[] => {
    const byId = new Map((tasks.data ?? []).map((task) => [task.id, task]));
    return parseSectionSteps(split?.section ?? [])
      .filter((step) => step.text !== '')
      .map((step) => {
        const task = step.taskId ? byId.get(step.taskId) : undefined;
        return { ...step, done: task ? task.completed : step.checked };
      });
  }, [split, tasks.data]);
  const reviews = useMemo(() => listStepReviews(parseSummaryTasks(summary)), [summary]);

  const saveSummary = (next: string) => saveNotePatch(queryClient, noteId, { summary: next });

  /** A linked step completes its task; a step without one is only checked in the note. */
  const toggleStep = async (step: NextStep) => {
    const task = step.taskId ? tasks.data?.find((candidate) => candidate.id === step.taskId) : undefined;
    if (task) {
      toggleTask(task);
      return;
    }
    if (!summary || !step.stepId) return;
    const next = updateSummaryStep(summary, step.stepId, { checked: !step.checked });
    if (next === summary) return;
    setNoteSummary(queryClient, noteId, next);
    try {
      await saveSummary(next);
    } catch {
      setNoteSummary(queryClient, noteId, summary);
      throw new Error('save_failed');
    }
  };

  /** Saves the answer to "Já é tarefa?" and shows the summary the server kept. */
  const resolveReview = async (review: SummaryStepReview, decision: NoteStepDecision) => {
    const result = await notesApi.reviewStep(noteId, review.stepId, decision);
    if (result.summary !== null) setNoteSummary(queryClient, noteId, result.summary);
    return result.status;
  };

  return {
    /** The summary without its "Próximos passos" section */
    body: split?.body ?? summary,
    steps,
    /** Some step has no task yet: "Sincronizar com tarefas" has something to do */
    canSync: steps.some(isConvertibleStep),
    toggleStep,
    reviews,
    resolveReview,
  };
}
