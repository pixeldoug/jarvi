import { addDays, dateKeyOf, nextMonday, startOfDay, toDateKey } from '@/lib/dates';
import type { Task, TaskList } from '@/types/models';

/**
 * Task grouping and filtering, matching the web "Lista de tarefas" view
 * (packages/web/src/pages/Tasks/index.tsx, `categorizedTasks`).
 */

export type SectionId = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'later' | 'inbox' | 'completed';

/**
 * Key of a section's title in `tasks:sections` (resolved while rendering).
 * The recurring smart view reuses the `later` id but has its own title.
 */
export type SectionTitleKey = SectionId | 'recurring';

const SECTION_ORDER: SectionId[] = ['overdue', 'today', 'tomorrow', 'thisWeek', 'nextWeek', 'later', 'inbox', 'completed'];

/** Sections that start collapsed (web `ALL_SECTIONS_OPEN`). */
export const COLLAPSED_BY_DEFAULT: ReadonlySet<SectionId> = new Set(['overdue', 'thisWeek', 'later', 'completed']);

export interface TaskSection {
  id: SectionId;
  /** Title key in `tasks:sections`, resolved while rendering. */
  titleKey: SectionTitleKey;
  data: Task[];
}

/** Same order as the web: by date, timed before untimed, then creation. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const dateA = dateKeyOf(a.due_date);
    const dateB = dateKeyOf(b.due_date);
    if (dateA && dateB) {
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
    } else if (dateA) {
      return -1;
    } else if (dateB) {
      return 1;
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

export function sectionOf(task: Task, now: Date = new Date()): SectionId {
  const today = startOfDay(now);
  const todayKey = toDateKey(today);
  const key = dateKeyOf(task.due_date);

  // Completed today stays in "Hoje" so the day's progress remains visible.
  if (task.completed) return key === todayKey ? 'today' : 'completed';
  if (!key) return 'inbox';

  const monday = nextMonday(today);
  if (key < todayKey) return 'overdue';
  if (key === todayKey) return 'today';
  if (key === toDateKey(addDays(today, 1))) return 'tomorrow';
  if (key < toDateKey(monday)) return 'thisWeek';
  if (key < toDateKey(addDays(monday, 7))) return 'nextWeek';
  return 'later';
}

/** Non-empty sections in display order; completed tasks sink within "Hoje". */
export function groupTasks(tasks: Task[], now: Date = new Date()): TaskSection[] {
  const buckets = new Map<SectionId, Task[]>();
  for (const task of sortTasks(tasks)) {
    const id = sectionOf(task, now);
    buckets.set(id, [...(buckets.get(id) ?? []), task]);
  }
  const today = buckets.get('today');
  if (today) {
    buckets.set('today', [...today.filter((t) => !t.completed), ...today.filter((t) => t.completed)]);
  }
  return SECTION_ORDER.filter((id) => buckets.has(id)).map((id) => ({
    id,
    titleKey: id,
    data: buckets.get(id)!,
  }));
}

export function isRecurring(task: Task): boolean {
  return !!task.recurrence_type && task.recurrence_type !== 'none';
}

export type TaskView =
  | { kind: 'all' }
  | { kind: 'inbox' }
  | { kind: 'overdue' }
  | { kind: 'recurring' }
  | { kind: 'category'; name: string }
  | { kind: 'list'; list: TaskList };

/** Applies a saved filter's rules (web `visibleTasks`). */
export function applyList(tasks: Task[], list: TaskList): Task[] {
  const allowed = new Set(list.category_names ?? []);
  return tasks.filter((task) => {
    if (allowed.size > 0 && !(task.category && allowed.has(task.category))) return false;
    if (list.priority && task.priority !== list.priority) return false;
    if (list.connected_app === 'whatsapp' && !task.original_whatsapp_content) return false;
    if (list.filter_no_category && task.category) return false;
    if (list.show_completed === false && task.completed) return false;
    return true;
  });
}

/**
 * Sections for a view. "Todas", categories and saved filters keep the
 * date sections; the smart views are a single flat section.
 */
export function sectionsForView(tasks: Task[], view: TaskView, now: Date = new Date()): TaskSection[] {
  const todayKey = toDateKey(startOfDay(now));
  const flat = (id: SectionId, titleKey: SectionTitleKey, data: Task[]): TaskSection[] =>
    data.length > 0 ? [{ id, titleKey, data: sortTasks(data) }] : [];

  switch (view.kind) {
    case 'all':
      return groupTasks(tasks, now);
    case 'inbox':
      return flat('inbox', 'inbox', tasks.filter((t) => !t.completed && !dateKeyOf(t.due_date)));
    case 'overdue':
      return flat(
        'overdue',
        'overdue',
        tasks.filter((t) => {
          const key = dateKeyOf(t.due_date);
          return !t.completed && !!key && key < todayKey;
        }),
      );
    case 'recurring':
      return flat('later', 'recurring', tasks.filter((t) => !t.completed && isRecurring(t)));
    case 'category':
      return groupTasks(
        tasks.filter((t) => t.category === view.name),
        now,
      );
    case 'list':
      return groupTasks(applyList(tasks, view.list), now);
  }
}
