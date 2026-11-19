/**
 * The kept versions of a task's description, and restoring one.
 *
 * The list refetches when the AI changes the task in a chat (the chat sync
 * invalidates `taskDescriptionVersionsQueryKey`) and whenever the task is
 * opened again, which covers changes made elsewhere (WhatsApp, an MCP app).
 */

import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  taskDescriptionVersionsApi,
  taskDescriptionVersionsQueryKey,
} from '../../../../lib/taskDescriptionVersionsApi';
import { toast } from '../../../ui/Sonner';

export function useTaskDescriptionVersions(
  taskId: string | undefined,
  /**
   * The server now holds `description` for that task: the host puts it in the
   * open task and the task list (they keep their own copies). Also called
   * when "Desfazer" on the toast is used, possibly after another task opened.
   */
  onRestored: (taskId: string, description: string) => void,
) {
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const onRestoredRef = useRef(onRestored);
  onRestoredRef.current = onRestored;

  const { data: versions = [] } = useQuery({
    queryKey: taskDescriptionVersionsQueryKey(taskId ?? ''),
    queryFn: () => taskDescriptionVersionsApi.list(taskId!),
    enabled: Boolean(taskId),
    staleTime: 0,
    // Optional UI: a failed load just leaves "Versões anteriores" hidden.
    retry: false,
  });

  /** Puts a version back. Resolves to whether it worked. */
  const restore = useCallback(
    async (versionId: string, options: { undoable?: boolean } = {}): Promise<boolean> => {
      if (!taskId) return false;
      setRestoringId(versionId);
      try {
        const { task, replaced_version_id } = await taskDescriptionVersionsApi.restore(taskId, versionId);
        onRestoredRef.current(taskId, task.description ?? '');
        void queryClient.invalidateQueries({ queryKey: taskDescriptionVersionsQueryKey(taskId) });
        if (options.undoable === false || !replaced_version_id) {
          toast.success('Descrição restaurada');
        } else {
          toast.success('Descrição restaurada', {
            action: { label: 'Desfazer', onClick: () => void restore(replaced_version_id, { undoable: false }) },
          });
        }
        return true;
      } catch (error) {
        console.error('Failed to restore the task description:', error);
        toast.error('Não foi possível restaurar esta versão');
        return false;
      } finally {
        setRestoringId(null);
      }
    },
    [taskId, queryClient],
  );

  return { versions, restore, restoringId };
}
