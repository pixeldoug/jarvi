/**
 * Task description versions API — typed fetchers for
 * `/api/tasks/:id/description-versions` (mirrors backend
 * services/taskDescriptionVersionService.ts). A version is what the
 * description said before the AI changed it, or before a restore.
 */

import type { Task } from '../contexts/TaskContext';
import { apiClient } from './apiClient';

export type TaskDescriptionVersionSource = 'agent_web' | 'agent_whatsapp' | 'mcp' | 'restore';

export interface TaskDescriptionVersion {
  id: string;
  /** When this text was replaced */
  created_at: string;
  source: TaskDescriptionVersionSource;
  /** The description as it was: a serialized doc, without files */
  description: string;
  /** Its first words */
  preview: string;
  /**
   * What tells it from the text that replaced it: a line it had that is gone
   * there (`had`), else a line that only came after (`lacked`)
   */
  change: { kind: 'had' | 'lacked'; line: string; more: number } | null;
}

export interface RestoredTaskDescription {
  task: Task;
  /** The version now holding the text the restore replaced (to undo it) */
  replaced_version_id: string | null;
}

export const taskDescriptionVersionsQueryKey = (taskId: string) => ['task-description-versions', taskId] as const;

export const taskDescriptionVersionsApi = {
  async list(taskId: string): Promise<TaskDescriptionVersion[]> {
    const { versions } = await apiClient.get<{ versions: TaskDescriptionVersion[] }>(
      `/api/tasks/${encodeURIComponent(taskId)}/description-versions`,
    );
    return versions;
  },

  restore(taskId: string, versionId: string): Promise<RestoredTaskDescription> {
    return apiClient.post<RestoredTaskDescription>(
      `/api/tasks/${encodeURIComponent(taskId)}/description-versions/${encodeURIComponent(versionId)}/restore`,
    );
  },
};
