/**
 * DeleteChatDialog — confirm before deleting a conversation from the history
 * (DeleteNoteDialog pattern). Deletes it, leaves its page when it is the one
 * open, and toasts the result.
 */

import { useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { Button, Dialog } from '../../ui';
import { toast } from '../../ui/Sonner';
import { useChatMutations } from '../../../hooks/useChats';
import styles from './DeleteChatDialog.module.css';

export interface DeleteChatDialogProps {
  /** Id of the conversation to delete; null closes the dialog */
  chatId: string | null;
  onClose: () => void;
}

export function DeleteChatDialog({ chatId, onClose }: DeleteChatDialogProps) {
  const navigate = useNavigate();
  const openChatId = useMatch('/chats/:chatId')?.params.chatId;
  const { deleteChat } = useChatMutations();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (!chatId || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteChat(chatId);
      if (openChatId === chatId) navigate('/chats', { replace: true });
      onClose();
      toast.success('Conversa excluída');
    } catch (error) {
      console.error('Failed to delete chat:', error);
      toast.error('Não foi possível excluir a conversa.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      isOpen={chatId !== null}
      onClose={isDeleting ? () => {} : onClose}
      width="md"
      showCloseButton={!isDeleting}
      contentClassName={styles.dialogContent}
    >
      <div className={styles.body}>
        <div className={styles.textBlock}>
          <h2 className={styles.title}>Excluir conversa?</h2>
          <p className={styles.description}>
            As mensagens desta conversa serão apagadas do seu histórico. As tarefas criadas nela
            continuam. Essa ação não pode ser desfeita.
          </p>
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} loading={isDeleting}>
            Excluir
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
