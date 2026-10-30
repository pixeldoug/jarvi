/**
 * StepReviewDialog — "is this next step the one that already has a task?"
 * (DeleteNoteDialog pattern). Shown for a step a regenerated summary could
 * not tell apart from one the user already turned into a task; both stay in
 * the summary until the user answers here.
 */

import { Button, Dialog } from '../../ui';
import type { NoteStepDecision } from '../../../lib/notesApi';
import type { SummaryStepReview } from './summaryTasks';
import styles from './StepReviewDialog.module.css';

export interface StepReviewDialogProps {
  review: SummaryStepReview | null;
  /** The answer being saved */
  resolving: NoteStepDecision | null;
  onClose: () => void;
  onResolve: (decision: NoteStepDecision) => void;
}

export function StepReviewDialog({ review, resolving, onClose, onResolve }: StepReviewDialogProps) {
  const isResolving = resolving !== null;
  return (
    <Dialog
      isOpen={review !== null}
      onClose={isResolving ? () => {} : onClose}
      width="md"
      showCloseButton={!isResolving}
      contentClassName={styles.dialogContent}
    >
      {review && (
        <div className={styles.body}>
          <div className={styles.textBlock}>
            <h2 className={styles.title}>Este passo já é uma tarefa?</h2>
            <p className={styles.description}>
              Ele parece com um passo que você já transformou em tarefa. Se for o mesmo, ele fica ligado a
              essa tarefa. Se for outro, você pode criar uma tarefa só para ele.
            </p>
          </div>

          <dl className={styles.compare}>
            <div className={styles.compareRow}>
              <dt className={styles.label}>No resumo agora</dt>
              <dd className={styles.text}>{review.text}</dd>
            </div>
            <div className={styles.compareRow}>
              <dt className={styles.label}>Já é uma tarefa</dt>
              <dd className={styles.text}>
                {review.existingText ?? 'Um passo desta nota que você já transformou em tarefa'}
              </dd>
            </div>
          </dl>

          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => onResolve('distinct')}
              disabled={isResolving && resolving !== 'distinct'}
              loading={resolving === 'distinct'}
            >
              É outro passo
            </Button>
            <Button
              variant="primary"
              onClick={() => onResolve('same')}
              disabled={isResolving && resolving !== 'same'}
              loading={resolving === 'same'}
            >
              É o mesmo passo
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
