import { useCallback } from 'react';

import { errorMessage } from '@/api/client';
import { formatDueLabel } from '@/lib/dates';
import type { Task } from '@/types/models';
import { useToast } from '@/ui/toast';
import { useToggleTask } from './use-tasks';

/** Toggle a task and announce what happened (next occurrence, or a failure). */
export function useToggleWithFeedback() {
  // `mutate` is stable; the mutation object is not, and rows are memoized.
  const { mutate } = useToggleTask();
  const toast = useToast();

  return useCallback(
    (task: Task) => {
      mutate(task, {
        onSuccess: ({ next_occurrence: next }) => {
          const when = next ? formatDueLabel(next.due_date, next.time) : null;
          if (when) toast({ message: `Próxima repetição: ${when}.` });
        },
        onError: (error) => toast({ message: errorMessage(error, 'Não foi possível atualizar a tarefa.') }),
      });
    },
    [mutate, toast],
  );
}
