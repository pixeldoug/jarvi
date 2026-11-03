/**
 * DeleteNoteDialog — confirm before deleting a note (DeleteAccountDialog pattern).
 */

import { Button, Dialog } from '../../ui';
import styles from './DeleteNoteDialog.module.css';

export interface DeleteNoteDialogProps {
  isOpen: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteNoteDialog({ isOpen, isDeleting, onClose, onConfirm }: DeleteNoteDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={isDeleting ? () => {} : onClose}
      width="md"
      showCloseButton={!isDeleting}
      contentClassName={styles.dialogContent}
    >
      <div className={styles.body}>
        <div className={styles.textBlock}>
          <h2 className={styles.title}>Excluir nota?</h2>
          <p className={styles.description}>
            As notas, o resumo e a transcrição desta nota serão apagados. Essa ação não pode ser
            desfeita.
          </p>
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm} loading={isDeleting}>
            Excluir
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
