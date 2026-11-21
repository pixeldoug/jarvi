import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { errorMessage } from '@/api/client';
import { categoriesApi, listsApi, tasksApi } from '@/api/endpoints';
import { compareText, i18n } from '@/i18n';
import { reminderFromApi, reminderToApi, type ConfiguredReminder } from '@/lib/reminders';
import type { Category, CreateTaskInput, Task, UpdateTaskInput } from '@/types/models';
import { useToast } from '@/ui/toast';

export const queryKeys = {
  tasks: ['tasks'] as const,
  reminders: (taskId: string) => ['reminders', taskId] as const,
  categories: ['categories'] as const,
  lists: ['lists'] as const,
};

/**
 * Optimistic task writes cancel an in-flight list refetch (it would overwrite
 * the optimistic state), so each one refetches once it settles: a change that
 * arrived meanwhile (WhatsApp, the web) is not lost.
 */
const taskList = { queryKey: queryKeys.tasks, exact: true } as const;

function setTasks(queryClient: QueryClient, update: (tasks: Task[]) => Task[]) {
  queryClient.setQueryData<Task[]>(queryKeys.tasks, (old) => update(old ?? []));
}

/** Applies an update payload to a cached task (`dueDate` → `due_date`). */
function applyUpdate(task: Task, input: UpdateTaskInput): Task {
  const { dueDate, ...rest } = input;
  return {
    ...task,
    ...rest,
    ...(dueDate !== undefined ? { due_date: dueDate || null } : {}),
  };
}

export function useTasks() {
  return useQuery({ queryKey: queryKeys.tasks, queryFn: tasksApi.list });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.create(input),
    onSuccess: (task) => setTasks(queryClient, (tasks) => [...tasks.filter((t) => t.id !== task.id), task]),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) => tasksApi.update(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries(taskList);
      setTasks(queryClient, (tasks) => tasks.map((task) => (task.id === id ? applyUpdate(task, input) : task)));
    },
    onSuccess: (saved) => setTasks(queryClient, (tasks) => tasks.map((task) => (task.id === saved.id ? saved : task))),
    onSettled: () => queryClient.invalidateQueries(taskList),
  });
}

/**
 * Completing a recurring task makes the backend spawn the next occurrence,
 * which is returned so the screen can announce it.
 */
export function useToggleTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: Task) => tasksApi.toggle(task.id),
    onMutate: async (task) => {
      await queryClient.cancelQueries(taskList);
      setTasks(queryClient, (tasks) => tasks.map((t) => (t.id === task.id ? { ...t, completed: !task.completed } : t)));
    },
    onSuccess: ({ next_occurrence: next, ...saved }) =>
      setTasks(queryClient, (tasks) => {
        const updated = tasks.map((t) => (t.id === saved.id ? saved : t));
        return next && !updated.some((t) => t.id === next.id) ? [...updated, next] : updated;
      }),
    onError: (_error, task) =>
      setTasks(queryClient, (tasks) => tasks.map((t) => (t.id === task.id ? { ...t, completed: task.completed } : t))),
    // Also picks up a recurrence the server extended without returning it.
    onSettled: () => queryClient.invalidateQueries(taskList),
  });
}

/**
 * Deletes a task; `restore` re-creates it, which is how the web undo works too.
 * Errors are reported here because the screen that started the delete has
 * usually closed by the time the request fails.
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: (task: Task) => tasksApi.remove(task.id),
    onMutate: async (task) => {
      await queryClient.cancelQueries(taskList);
      setTasks(queryClient, (tasks) => tasks.filter((t) => t.id !== task.id));
    },
    onError: (error) => toast({ message: errorMessage(error, i18n.t('tasks:toast.deleteFailed')) }),
    onSettled: () => queryClient.invalidateQueries(taskList),
  });
  const restore = useMutation({
    mutationFn: (task: Task) =>
      tasksApi.create({
        title: task.title,
        description: task.description ?? undefined,
        priority: task.priority ?? undefined,
        category: task.category ?? undefined,
        important: task.important,
        time: task.time ?? undefined,
        dueDate: task.due_date ?? undefined,
      }),
    onSuccess: (task) => setTasks(queryClient, (tasks) => [...tasks, task]),
    onError: (error) => toast({ message: errorMessage(error, i18n.t('tasks:toast.undoFailed')) }),
  });
  return { remove, restore };
}

export function useTaskReminders(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reminders(taskId ?? ''),
    queryFn: async () => (await tasksApi.reminders(taskId!)).map(reminderFromApi),
    enabled: !!taskId,
  });
}

export function useReplaceReminders(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reminders: ConfiguredReminder[]) =>
      (await tasksApi.replaceReminders(taskId, reminders.map(reminderToApi))).map(reminderFromApi),
    onMutate: (reminders) => queryClient.setQueryData(queryKeys.reminders(taskId), reminders),
    onSuccess: (saved) => queryClient.setQueryData(queryKeys.reminders(taskId), saved),
    onError: () => queryClient.invalidateQueries({ queryKey: queryKeys.reminders(taskId) }),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.list,
    select: (categories: Category[]) =>
      categories
        // SQLite returns 0/1 and older rows null; null means visible (web normalizeCategory).
        .map((category) => ({ ...category, visible: category.visible == null ? true : Boolean(category.visible) }))
        .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)),
  });
}

/**
 * Category names to offer as filters and choices: visible categories in the
 * user's order, then names that only exist on tasks (created by the AI or
 * WhatsApp before a category row existed), like the web sidebar.
 */
export function useCategoryNames(): string[] {
  const { data: categories = [] } = useCategories();
  const { data: tasks = [] } = useTasks();
  const known = new Set(categories.map((c) => c.name));
  const visible = categories.filter((c) => c.visible !== false).map((c) => c.name);
  const orphan = [...new Set(tasks.map((t) => t.category).filter((name): name is string => !!name && !known.has(name)))];
  return [...visible, ...orphan.sort((a, b) => compareText(a, b))];
}

export function useLists() {
  return useQuery({ queryKey: queryKeys.lists, queryFn: listsApi.list });
}
