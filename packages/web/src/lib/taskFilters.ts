/**
 * Task filters (the Tasks page "Filtrar" menu).
 *
 * Each facet maps a task to the option values it belongs to. A task passes a
 * facet when one of its values is selected (OR inside a facet), and passes the
 * filters when it passes every facet with a selection (AND across facets).
 */

import type { Task } from '../contexts/TaskContext';

export type TaskStatusFilter = 'overdue' | 'recurring' | 'inbox' | 'completed';
export type TaskPriorityFilter = 'high' | 'medium' | 'low' | 'none';
export type TaskAppFilter = 'whatsapp' | 'gmail';

export interface TaskFilters {
  status: TaskStatusFilter[];
  priority: TaskPriorityFilter[];
  app: TaskAppFilter[];
  /** Category names; `NO_CATEGORY` for tasks without one */
  category: string[];
  /** Ids of the notes the tasks came from */
  note: string[];
}

export type TaskFilterFacet = keyof TaskFilters;

export const EMPTY_TASK_FILTERS: TaskFilters = {
  status: [],
  priority: [],
  app: [],
  category: [],
  note: [],
};

/** Category option for tasks without a category */
export const NO_CATEGORY = '__none__';

const FACETS = Object.keys(EMPTY_TASK_FILTERS) as TaskFilterFacet[];

/** Same "today" as the Tasks page sections (Vencidas, Hoje…) */
function todayKey(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString().split('T')[0];
}

/** The option values `task` belongs to in `facet` */
function facetValues(task: Task, facet: TaskFilterFacet, today: string): string[] {
  switch (facet) {
    case 'status': {
      // Matches the sidebar lists: Vencidas, Recorrentes and Caixa de entrada leave out completed tasks
      if (task.completed) return ['completed'];
      const values: TaskStatusFilter[] = [];
      if (!task.due_date) values.push('inbox');
      else if (task.due_date.split('T')[0] < today) values.push('overdue');
      if (task.recurrence_type && task.recurrence_type !== 'none') values.push('recurring');
      return values;
    }
    case 'priority':
      if (!task.priority) return ['none'];
      return [task.priority === 'urgent' ? 'high' : task.priority];
    case 'app': {
      const values: TaskAppFilter[] = [];
      if (task.source === 'whatsapp' || task.original_whatsapp_content) values.push('whatsapp');
      if (task.source === 'gmail') values.push('gmail');
      return values;
    }
    case 'category':
      return [task.category || NO_CATEGORY];
    case 'note':
      return task.source_note_id ? [task.source_note_id] : [];
  }
}

function matches(task: Task, filters: TaskFilters, today: string, except?: TaskFilterFacet): boolean {
  return FACETS.every((facet) => {
    const selected: string[] = filters[facet];
    if (facet === except || selected.length === 0) return true;
    return facetValues(task, facet, today).some((value) => selected.includes(value));
  });
}

export function applyTaskFilters(tasks: Task[], filters: TaskFilters): Task[] {
  if (countActiveFilters(filters) === 0) return tasks;
  const today = todayKey();
  return tasks.filter((task) => matches(task, filters, today));
}

/**
 * Tasks per option of `facet`, among the tasks that pass the other facets —
 * so a count is what picking that option adds.
 */
export function countFacetOptions(
  tasks: Task[],
  filters: TaskFilters,
  facet: TaskFilterFacet,
): Map<string, number> {
  const today = todayKey();
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!matches(task, filters, today, facet)) continue;
    for (const value of facetValues(task, facet, today)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

/** Selected options across every facet */
export function countActiveFilters(filters: TaskFilters): number {
  return FACETS.reduce((total, facet) => total + filters[facet].length, 0);
}
