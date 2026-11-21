import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/client';
import type { Task } from '@/types/models';
import { useToast } from '@/ui/toast';
import { formatDueLabel } from './due-label';
import { useToggleTask } from './use-tasks';

/** Toggle a task and announce what happened (next occurrence, or a failure). */
export function useToggleWithFeedback() {
  // `mutate` is stable; the mutation object is not, and rows are memoized.
  const { mutate } = useToggleTask();
  const toast = useToast();
  const { t } = useTranslation('tasks');

  return useCallback(
    (task: Task) => {
      mutate(task, {
        onSuccess: ({ next_occurrence: next }) => {
          const when = next ? formatDueLabel(next.due_date, next.time) : null;
          if (when) toast({ message: t('toast.nextOccurrence', { when }) });
        },
        onError: (error) => toast({ message: errorMessage(error, t('toast.updateFailed')) }),
      });
    },
    [mutate, toast, t],
  );
}
