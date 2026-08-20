/**
 * Task-creation telemetry — emits one `task_created` PostHog event whenever a
 * live task row is inserted (web form, agent chat, WhatsApp, or confirmed
 * Gmail pending). Recurrence copies are NOT tracked: those are system-
 * generated, not a user creating a task.
 *
 * distinct_id is the user's email, matching `posthogService` / the browser
 * SDK so the same person is not split across profiles.
 */

import { captureServer } from './posthogService';

export type TaskCreatedSource = 'web' | 'agent_web' | 'whatsapp' | 'gmail';

export interface TaskCreatedTelemetryInput {
  email: string;
  source: TaskCreatedSource;
  taskId: string;
  priority?: string | null;
  hasDueDate: boolean;
  hasCategory: boolean;
  isImportant?: boolean;
  hasRecurrence: boolean;
}

export function recordTaskCreated(input: TaskCreatedTelemetryInput): void {
  if (!input.email) return;
  captureServer(input.email, 'task_created', {
    source: input.source,
    task_id: input.taskId,
    priority: input.priority ?? null,
    has_due_date: input.hasDueDate,
    has_category: input.hasCategory,
    is_important: input.isImportant ?? false,
    has_recurrence: input.hasRecurrence,
  });
}

/** Map a pending_tasks.source column onto the analytics `source` property. */
export function pendingSourceToAnalytics(source: string | null): TaskCreatedSource {
  if (source === 'gmail') return 'gmail';
  if (source === 'whatsapp') return 'whatsapp';
  return 'web';
}
