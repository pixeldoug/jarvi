import { getDatabase, getPool, isPostgreSQL } from '../../database';
import { capitalizeTaskTitle } from '../../utils/taskTitle';
import { sanitizeTimeString } from '../../utils/taskTime';
import { generateNextOccurrenceIfRecurring } from '../recurrenceService';
import { cancelPendingRemindersForTask, rescheduleRemindersForTask } from '../reminderService';
import { emitTaskEvent, insertTask } from '../taskInsert';
import { prepareDescriptionForStorage } from '../agent/core/prepareDescriptionForStorage';
import {
  getTaskById,
  getUserCategories,
  resolveExistingCategoryName,
  searchUserTasks,
} from '../agent/core/tasks';
import type { TaskRow } from '../agent/core/types';

const TIMEZONE = 'America/Sao_Paulo';

export class McpTaskError extends Error {}

export interface TaskInput {
  title?: string;
  description?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  time?: string | null;
  category?: string | null;
}

function notify(userId: string, event: 'task:created' | 'task:changed'): void {
  emitTaskEvent(userId, event, 'mcp');
}

function presentTask(task: TaskRow) {
  const due = task.due_date instanceof Date ? task.due_date.toISOString() : task.due_date;
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    completed: Boolean(task.completed),
    priority: task.priority ?? null,
    category: task.category ?? null,
    due_date: due ? String(due).slice(0, 10) : null,
    time: task.time ?? null,
    recurrence_type: task.recurrence_type ?? 'none',
  };
}

async function resolveCategory(userId: string, category: string | null | undefined): Promise<string | null> {
  if (category == null || category.trim() === '') return null;
  const categories = await getUserCategories(userId);
  const resolved = resolveExistingCategoryName(category, categories);
  if (!resolved) {
    const names = categories.map((item) => item.name).join(', ');
    throw new McpTaskError(
      names
        ? `A categoria "${category}" não existe. Use uma destas: ${names}.`
        : 'Esta conta ainda não tem categorias. Crie a tarefa sem categoria.',
    );
  }
  return resolved;
}

function cleanPriority(priority: string | null | undefined): string | null {
  if (priority == null || priority === '') return null;
  if (priority === 'low' || priority === 'medium' || priority === 'high') return priority;
  throw new McpTaskError('Prioridade deve ser low, medium ou high.');
}

function cleanDueDate(dueDate: string | null | undefined): string | null {
  if (dueDate == null || dueDate === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new McpTaskError('due_date deve estar no formato YYYY-MM-DD.');
  }
  return dueDate;
}

function cleanDescription(description: string | null | undefined): string | null {
  if (description == null) return null;
  const trimmed = description.trim();
  if (!trimmed) return null;
  return prepareDescriptionForStorage(trimmed.slice(0, 8000), TIMEZONE);
}

export async function listTasks(
  userId: string,
  filters: {
    query?: string;
    category?: string;
    priority?: string;
    dueFrom?: string;
    dueTo?: string;
    includeCompleted?: boolean;
    limit?: number;
  },
) {
  const tasks = await searchUserTasks(userId, {
    query: filters.query,
    category: filters.category,
    priority: filters.priority,
    dueFrom: filters.dueFrom,
    dueTo: filters.dueTo,
    includeCompleted: filters.includeCompleted,
    limit: filters.limit,
  });
  return tasks.map(presentTask);
}

export async function readTask(userId: string, taskId: string) {
  const task = await getTaskById(taskId, userId);
  if (!task) throw new McpTaskError('Tarefa não encontrada.');
  return presentTask(task);
}

export async function listCategories(userId: string) {
  const categories = await getUserCategories(userId);
  return categories.map((category) => ({ id: category.id, name: category.name }));
}

export async function createTask(userId: string, input: TaskInput) {
  const title = capitalizeTaskTitle((input.title || '').trim()).slice(0, 300);
  if (!title) throw new McpTaskError('Título é obrigatório.');
  const priority = cleanPriority(input.priority);
  const dueDate = cleanDueDate(input.dueDate);
  const time = input.time == null || input.time === '' ? null : sanitizeTimeString(input.time);
  const category = await resolveCategory(userId, input.category);
  const description = cleanDescription(input.description);
  const taskId = await insertTask(
    userId,
    { title, description, priority, category, dueDate, time },
    { source: 'mcp' },
  );
  return readTask(userId, taskId);
}

export async function updateTask(userId: string, taskId: string, input: TaskInput) {
  const existing = await getTaskById(taskId, userId);
  if (!existing) throw new McpTaskError('Tarefa não encontrada.');

  const title =
    input.title !== undefined ? capitalizeTaskTitle(input.title.trim()).slice(0, 300) : existing.title;
  if (!title) throw new McpTaskError('Título é obrigatório.');
  const description =
    input.description !== undefined ? cleanDescription(input.description) : existing.description ?? null;
  const priority = input.priority !== undefined ? cleanPriority(input.priority) : existing.priority ?? null;
  const dueDate = input.dueDate !== undefined ? cleanDueDate(input.dueDate) : presentTask(existing).due_date;
  const time =
    input.time !== undefined
      ? input.time == null || input.time === ''
        ? null
        : sanitizeTimeString(input.time)
      : existing.time ?? null;
  const category =
    input.category !== undefined ? await resolveCategory(userId, input.category) : existing.category ?? null;
  const now = new Date().toISOString();

  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE tasks
       SET title = $1, description = $2, priority = $3, category = $4, due_date = $5, time = $6, updated_at = $7
       WHERE id = $8 AND user_id = $9`,
      [title, description, priority, category, dueDate, time, now, taskId, userId],
    );
  } else {
    await getDatabase().run(
      `UPDATE tasks
       SET title = ?, description = ?, priority = ?, category = ?, due_date = ?, time = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [title, description, priority, category, dueDate, time, now, taskId, userId],
    );
  }

  if (input.dueDate !== undefined || input.time !== undefined) {
    await rescheduleRemindersForTask(taskId);
  }
  notify(userId, 'task:changed');
  return readTask(userId, taskId);
}

export async function setTaskCompleted(userId: string, taskId: string, completed: boolean) {
  const existing = await getTaskById(taskId, userId);
  if (!existing) throw new McpTaskError('Tarefa não encontrada.');
  const now = new Date().toISOString();
  const flag = completed ? 1 : 0;
  if (isPostgreSQL()) {
    await getPool().query(
      'UPDATE tasks SET completed = $1, updated_at = $2 WHERE id = $3 AND user_id = $4',
      [completed, now, taskId, userId],
    );
  } else {
    await getDatabase().run(
      'UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      [flag, now, taskId, userId],
    );
  }

  let nextOccurrence: string | null = null;
  if (completed && !existing.completed && existing.recurrence_type && existing.recurrence_type !== 'none') {
    const created = await generateNextOccurrenceIfRecurring(taskId);
    nextOccurrence = created?.id ?? null;
  }
  if (completed) await cancelPendingRemindersForTask(taskId);
  else if (existing.completed) await rescheduleRemindersForTask(taskId);
  notify(userId, 'task:changed');
  const task = await readTask(userId, taskId);
  return { ...task, next_occurrence_id: nextOccurrence };
}

export async function removeTask(userId: string, taskId: string) {
  const existing = await getTaskById(taskId, userId);
  if (!existing) throw new McpTaskError('Tarefa não encontrada.');
  await cancelPendingRemindersForTask(taskId);
  if (isPostgreSQL()) {
    await getPool().query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
  } else {
    await getDatabase().run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
  }
  notify(userId, 'task:changed');
  return { deleted: true, id: taskId };
}
