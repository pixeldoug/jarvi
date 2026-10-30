/**
 * Summary next steps ↔ tasks for one note view: "Criar tarefas", the
 * completion sync both ways and the "Tarefa" marker navigation.
 *
 * - Summary → task: every summary change is diffed with the previous one; a
 *   toggled linked item completes / reopens its task through TaskContext, so
 *   the tasks cache stays consistent.
 * - Task → summary: only when the summary editor mounts (`reconcile`, used as
 *   the editor's `prepareContent`), never pushed into a mounted editor. When
 *   it could not run at mount (tasks still loading, summary being generated),
 *   the editor is remounted once it can (only if an item changes).
 *
 * A linked task missing from the user's tasks (deleted, or someone else's on a
 * shared note) leaves its item untouched.
 *
 * Conversion is per step (`attrs.stepId`): an item without an id gets one
 * and is saved first, and the server answers each step once — a repeated
 * request links the item to the task it already has. Items a regeneration
 * flagged (`reviewOf`) are not offered: the user answers "é o mesmo passo?"
 * first (`openReview` → `resolveReview`), which the server remembers.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTasks, type Task } from '../../../contexts/TaskContext';
import {
  notesApi,
  NOTE_TASK_TEXT_MAX_LENGTH,
  NOTE_TASKS_MAX_ITEMS,
  type NoteStepDecision,
} from '../../../lib/notesApi';
import { captureProductEvent } from '../../../lib/productAnalytics';
import type { TasksNavigationState } from '../../layout/Sidebar';
import { toast } from '../../ui/Sonner';
import type { SummaryNextStepsState } from './NoteSummaryTab';
import {
  diffLinkedCheckedItems,
  ensureStepIds,
  isConvertibleStep,
  linkSummaryTasks,
  listStepReviews,
  parseSummaryTasks,
  setSummaryTaskChecked,
  type SummaryStepReview,
  type SummaryTaskItem,
  type SummaryTaskLink,
} from './summaryTasks';

/** TaskContext's query key */
const TASKS_KEY = ['tasks'];

function nextStepsState(items: SummaryTaskItem[]): SummaryNextStepsState {
  const withText = items.filter((item) => item.text !== '');
  if (withText.length === 0) return 'none';
  return withText.some(isConvertibleStep) ? 'available' : 'converted';
}

export interface UseSummaryTasksOptions {
  noteId: string;
  /** Summary doc JSON the editor shows in this render */
  summary: string | null;
  /** The summary editor is shown and editable (Resumo tab, write access, a summary, not generating) */
  isEditorActive: boolean;
  /** Latest summary doc JSON (draft or server value), read at call time */
  readSummary: () => string | null;
  /** Replaces the summary (draft + scheduled save); the hook remounts the editor */
  setSummary: (json: string) => void;
  /** Saves pending note edits now */
  flush: () => Promise<void>;
}

export interface SummaryTasks {
  nextSteps: SummaryNextStepsState;
  /** Part of the summary editor key: bumped to remount it with new content */
  editorEpoch: number;
  /** Task → summary: linked items take their task's completion (same string when nothing changes) */
  reconcile: (json: string) => string;
  /** Summary → task: call with every summary change */
  trackSummaryChange: (json: string) => void;
  openTask: (taskId: string) => void;
  /** Items listed in the dialog; null while it is closed */
  dialogItems: SummaryTaskItem[] | null;
  isCreating: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  createTasks: (items: SummaryTaskItem[]) => Promise<void>;
  /** Next steps that may repeat one with a task, waiting for the user's answer */
  reviews: SummaryStepReview[];
  /** The step being answered; null while the review dialog is closed */
  reviewing: SummaryStepReview | null;
  /** The answer being saved */
  resolving: NoteStepDecision | null;
  /** Opens the review of `stepId` (the first one when omitted) */
  openReview: (stepId?: string) => void;
  closeReview: () => void;
  resolveReview: (decision: NoteStepDecision) => Promise<void>;
}

export function useSummaryTasks({
  noteId,
  summary,
  isEditorActive,
  readSummary,
  setSummary,
  flush,
}: UseSummaryTasksOptions): SummaryTasks {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isLoading: isTasksLoading, toggleTaskCompletion } = useTasks();
  const toggleRef = useRef(toggleTaskCompletion);
  toggleRef.current = toggleTaskCompletion;

  const [editorEpoch, setEditorEpoch] = useState(0);
  const [dialogItems, setDialogItems] = useState<SummaryTaskItem[] | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Items of the last summary seen (rendered or reported by the editor): the
  // baseline the next change is diffed against. Parsed once per value.
  const parsedRef = useRef<{ json: string | null; items: SummaryTaskItem[] }>({
    json: null,
    items: [],
  });
  if (parsedRef.current.json !== summary) {
    parsedRef.current = { json: summary, items: parseSummaryTasks(summary) };
  }
  const nextSteps = nextStepsState(parsedRef.current.items);
  const reviews = listStepReviews(parsedRef.current.items);
  // Typing never re-renders the view: re-render when the CTA state or the
  // number of steps in doubt changes.
  const renderedNextStepsRef = useRef(nextSteps);
  renderedNextStepsRef.current = nextSteps;
  const renderedReviewCountRef = useRef(reviews.length);
  renderedReviewCountRef.current = reviews.length;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const reconcile = useCallback((json: string) => {
    if (!json.includes('"taskId":"')) return json;
    const tasks = queryClient.getQueryData<Task[]>(TASKS_KEY);
    if (!tasks) return json;
    // SQLite rows carry completed as 0 / 1.
    return setSummaryTaskChecked(json, new Map(tasks.map((task) => [task.id, !!task.completed])));
  }, [queryClient]);

  const trackSummaryChange = useCallback((json: string) => {
    const prev = parsedRef.current.items;
    const next = parseSummaryTasks(json);
    parsedRef.current = { json, items: next };
    const changes = diffLinkedCheckedItems(prev, next);
    if (changes.length > 0) {
      const tasks = queryClient.getQueryData<Task[]>(TASKS_KEY) ?? [];
      changes.forEach(({ taskId, checked }) => {
        const task = tasks.find((t) => t.id === taskId);
        if (task && !!task.completed !== checked) void toggleRef.current(taskId);
      });
    }
    if (
      nextStepsState(next) !== renderedNextStepsRef.current ||
      listStepReviews(next).length !== renderedReviewCountRef.current
    ) {
      forceRender();
    }
  }, [queryClient]);

  // The editor mounted without reconciling — tasks still loading, or a new
  // summary arriving while generation was ending (read-only, no
  // `prepareContent`): reconcile once it can, remounting only on a change.
  const wasTasksLoadingRef = useRef(isTasksLoading);
  const wasEditorActiveRef = useRef(isEditorActive);
  useEffect(() => {
    const wasLoading = wasTasksLoadingRef.current;
    const wasActive = wasEditorActiveRef.current;
    wasTasksLoadingRef.current = isTasksLoading;
    wasEditorActiveRef.current = isEditorActive;
    if (!isEditorActive || isTasksLoading || (wasActive && !wasLoading)) return;
    const current = readSummary();
    if (!current) return;
    const next = reconcile(current);
    if (next === current) return;
    setSummary(next);
    setEditorEpoch((epoch) => epoch + 1);
  }, [isTasksLoading, isEditorActive, readSummary, reconcile, setSummary]);

  const openTask = useCallback((taskId: string) => {
    const state: TasksNavigationState = { openTaskId: taskId };
    navigate('/tasks', { state });
  }, [navigate]);

  const openDialog = useCallback(() => {
    setDialogItems(parseSummaryTasks(readSummary()).filter((item) => item.text !== '' && !item.reviewOf));
  }, [readSummary]);

  const closeDialog = useCallback(() => setDialogItems(null), []);

  /** Links the tasks to their steps, saves now and remounts the editor. */
  const linkSteps = useCallback((links: SummaryTaskLink[], createdTaskIds: string[]) => {
    const current = readSummary();
    if (!current) return;
    // The new tasks are open: a linked item mirrors its task, so an item that
    // was checked comes back unchecked. A step that already had a task keeps
    // its state (reconciled with the task on the next mount).
    const linked = setSummaryTaskChecked(
      linkSummaryTasks(current, links),
      new Map(createdTaskIds.map((taskId) => [taskId, false])),
    );
    if (linked === current) return;
    setSummary(linked);
    void flush();
    setEditorEpoch((epoch) => epoch + 1);
  }, [readSummary, setSummary, flush]);

  const createTasks = useCallback(async (picked: SummaryTaskItem[]) => {
    if (picked.length === 0) return;
    setIsCreating(true);

    // Every step needs its id on the server before it is converted.
    const current = readSummary();
    const withIds = current ? ensureStepIds(current) : null;
    if (current && withIds && withIds !== current) {
      setSummary(withIds);
      setEditorEpoch((epoch) => epoch + 1);
    }
    let failed = false;
    try {
      await flush();
    } catch {
      failed = true;
    }
    // Only items still holding the text the dialog showed.
    const items = parseSummaryTasks(withIds);
    const steps = failed
      ? []
      : picked.flatMap((item) => {
          const stepId = items[item.index]?.text === item.text ? items[item.index].stepId : null;
          return stepId ? [{ stepId, text: item.text }] : [];
        });

    const links: SummaryTaskLink[] = [];
    const createdTaskIds: string[] = [];
    let skipped = 0;
    try {
      for (let start = 0; start < steps.length; start += NOTE_TASKS_MAX_ITEMS) {
        const chunk = steps.slice(start, start + NOTE_TASKS_MAX_ITEMS);
        const { tasks } = await notesApi.createTasksFromNote(
          noteId,
          chunk.map((step) => ({ text: step.text.slice(0, NOTE_TASK_TEXT_MAX_LENGTH), step_id: step.stepId })),
        );
        tasks.forEach((task) => {
          if (task.status === 'stale' || task.status === 'needs_review') skipped += 1;
          if (!task.id || task.status === 'stale' || task.status === 'needs_review') return;
          links.push({ stepId: task.step_id, taskId: task.id });
          if (task.status === 'created') createdTaskIds.push(task.id);
        });
      }
    } catch (error) {
      console.error('Failed to create tasks from note:', error);
      failed = true;
    }
    setIsCreating(false);

    if (links.length > 0) {
      void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      linkSteps(links, createdTaskIds);
    }
    if (createdTaskIds.length > 0) {
      captureProductEvent('note_tasks_created', { count: createdTaskIds.length });
      toast.success(createdTaskIds.length === 1 ? '1 tarefa sincronizada' : `${createdTaskIds.length} tarefas sincronizadas`, {
        hasButton: true,
        duration: 6000,
        action: { label: 'Ver', onClick: () => navigate('/tasks') },
      });
    }
    if (failed) toast.error('Não foi possível criar as tarefas.');
    else if (skipped > 0) {
      toast.error(
        skipped === 1
          ? 'Um passo mudou e não virou tarefa. Atualize a página e tente de novo.'
          : `${skipped} passos mudaram e não viraram tarefas. Atualize a página e tente de novo.`,
      );
    }
    // Kept open for a retry only when nothing was linked.
    if (!failed || links.length > 0) setDialogItems(null);
  }, [noteId, queryClient, readSummary, setSummary, flush, linkSteps, navigate]);

  const [reviewing, setReviewing] = useState<SummaryStepReview | null>(null);
  const [resolving, setResolving] = useState<NoteStepDecision | null>(null);

  const openReview = useCallback((stepId?: string) => {
    const open = listStepReviews(parseSummaryTasks(readSummary()));
    const review = stepId ? open.find((item) => item.stepId === stepId) : open[0];
    if (review) setReviewing(review);
  }, [readSummary]);

  const closeReview = useCallback(() => setReviewing(null), []);

  /** Saves the answer (pending edits first) and shows the summary the server kept. */
  const resolveReview = useCallback(async (decision: NoteStepDecision) => {
    const review = reviewing;
    if (!review) return;
    setResolving(decision);
    try {
      await flush();
      const result = await notesApi.reviewStep(noteId, review.stepId, decision);
      if (result.summary && result.summary !== readSummary()) {
        setSummary(result.summary);
        setEditorEpoch((epoch) => epoch + 1);
      }
      if (result.status === 'resolved') captureProductEvent('note_step_reviewed', { decision });
      else toast.info('Esse passo já foi revisado.');
      setReviewing(null);
    } catch (error) {
      console.error('Failed to save the step review:', error);
      toast.error('Não foi possível salvar sua escolha.');
    } finally {
      setResolving(null);
    }
  }, [reviewing, flush, noteId, readSummary, setSummary]);

  return {
    nextSteps,
    editorEpoch,
    reconcile,
    trackSummaryChange,
    openTask,
    dialogItems,
    isCreating,
    openDialog,
    closeDialog,
    createTasks,
    reviews,
    reviewing,
    resolving,
    openReview,
    closeReview,
    resolveReview,
  };
}
