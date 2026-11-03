/**
 * NextStepsList — the summary's "Próximos passos" as task rows (the task
 * lists' TaskItem). A step stays in the note until the user adds it to the
 * task list ("Sincronizar com tarefas", next to the title): until then its row
 * edits the step itself — done, date, category, text, delete — and that plan
 * goes with it when it becomes a task. A step that is a task shows that task
 * (complete it, set its date or category, open it). A step that may repeat
 * one with a task waits for the user's answer ("Já é tarefa?"); a step whose
 * task is not in the user's list (deleted, or someone else's on a shared
 * note) shows its text.
 */

import { DndContext, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ListChecks } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useTasks, type Task } from '../../../contexts/TaskContext';
import { Button } from '../../ui';
import { TaskItem } from '../tasks/TaskItem';
import type { TasksNavigationState } from '../../layout/Sidebar';
import type { SummaryStepPatch, SummaryTaskItem } from './summaryTasks';
import styles from './NextStepsList.module.css';

export interface NextStepsListProps {
  /** The section's steps, in order */
  steps: SummaryTaskItem[];
  canEdit: boolean;
  /** Opens "Este passo já é uma tarefa?" for a step in doubt */
  onReviewStep: (stepId: string) => void;
  /** A change made on a step that is not a task yet */
  onUpdateStep: (stepId: string, patch: SummaryStepPatch) => void;
  onRemoveStep: (stepId: string) => void;
  /** Opens the choice of steps to add to the task list (omitted: nothing to add) */
  onAddToTasks?: () => void;
}

/** A step that is not a task yet, shaped as one for TaskItem (its data lives in the note). */
function noteStepTask(step: SummaryTaskItem): Task {
  return {
    id: step.stepId!,
    user_id: '',
    title: step.text,
    completed: step.checked,
    // No priority, like the tasks a note creates (the API returns null there too)
    priority: null as unknown as Task['priority'],
    // Of this note: no app chip (the note is already open)
    source: 'notes',
    category: step.category ?? undefined,
    due_date: step.dueDate ?? undefined,
    time: step.time ?? undefined,
    created_at: '',
    updated_at: '',
  };
}

export function NextStepsList({
  steps,
  canEdit,
  onReviewStep,
  onUpdateStep,
  onRemoveStep,
  onAddToTasks,
}: NextStepsListProps) {
  const { tasks, toggleTaskCompletion, updateTask } = useTasks();
  const navigate = useNavigate();
  // TaskItem is sortable in the task lists; here the order is the summary's.
  const sensors = useSensors();

  const visible = steps.filter((step) => step.text !== '');
  if (visible.length === 0) return null;
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const openTask = (task: Task) => {
    const state: TasksNavigationState = { openTaskId: task.id };
    navigate('/tasks', { state });
  };
  const rowIds = visible.flatMap((step) => (step.stepId ? [step.taskId ?? step.stepId] : []));

  return (
    <section className={styles.nextSteps} aria-labelledby="note-next-steps-title">
      <div className={styles.header}>
        <h2 id="note-next-steps-title" className={styles.title}>Próximos passos</h2>
        {canEdit && onAddToTasks && (
          <Button variant="secondary" size="small" icon={ListChecks} iconPosition="left" onClick={onAddToTasks}>
            Sincronizar com tarefas
          </Button>
        )}
      </div>
      <DndContext sensors={sensors}>
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          <div className={styles.list}>
            {visible.map((step, index) => {
              const key = step.stepId ?? `step-${index}`;
              const task = step.taskId ? taskById.get(step.taskId) : undefined;
              if (task) {
                return (
                  <TaskItem
                    key={key}
                    task={task}
                    section="note-next-steps"
                    onToggleCompletion={(taskId) => void toggleTaskCompletion(taskId)}
                    onUpdateTask={updateTask}
                    onClick={openTask}
                    sortable={false}
                  />
                );
              }
              if (!step.taskId && !step.reviewOf && step.stepId && canEdit) {
                return (
                  <TaskItem
                    key={key}
                    task={noteStepTask(step)}
                    section="note-next-steps"
                    onToggleCompletion={(stepId) => onUpdateStep(stepId, { checked: !step.checked })}
                    onRemove={onRemoveStep}
                    onUpdateTask={async (stepId, data: { title?: string; dueDate?: string; time?: string; category?: string }) => {
                      onUpdateStep(stepId, {
                        text: data.title,
                        dueDate: data.dueDate || null,
                        time: data.dueDate ? data.time || null : null,
                        category: data.category || null,
                      });
                    }}
                    sortable={false}
                  />
                );
              }
              return (
                <div key={key} className={styles.row}>
                  <span className={styles.text}>{step.text}</span>
                  {step.reviewOf && step.stepId && canEdit && (
                    <Button variant="secondary" size="small" onClick={() => onReviewStep(step.stepId!)}>
                      Já é tarefa?
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
