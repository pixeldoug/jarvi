/**
 * DeleteAccountDialog
 *
 * Fluxo de confirmação de deleção de conta:
 *  1. Aviso: explica o que será removido.
 *  2. Confirmação: usuário digita "DELETAR" para liberar o botão.
 *
 * Após o sucesso, chama onDeleted() — o pai é responsável por fazer logout
 * e redirecionar para a landing/login.
 */

import { useEffect, useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import { Button, Dialog, TextInput, toast } from '../../../../ui';
import { useAuth } from '../../../../../contexts/AuthContext';
import styles from './DeleteAccountDialog.module.css';

const CONFIRM_WORD = 'DELETAR';
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface DeleteAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteAccountDialog({ isOpen, onClose, onDeleted }: DeleteAccountDialogProps) {
  const { token } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      setError('');
      setIsDeleting(false);
    }
  }, [isOpen]);

  const canConfirm = confirmText === CONFIRM_WORD;

  const handleDelete = async () => {
    if (!canConfirm) return;
    setError('');
    try {
      setIsDeleting(true);
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao deletar conta');
      }
      toast.success('Conta deletada. Até mais!');
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar conta');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isDeleting ? () => {} : onClose}
      width="md"
      showCloseButton={!isDeleting}
      contentClassName={styles.dialogContent}
    >
      <div className={styles.body}>
        <div className={styles.iconBadge}>
          <Trash size={24} weight="regular" />
        </div>

        <div className={styles.textBlock}>
          <h2 className={styles.title}>Deletar Conta</h2>
          <p className={styles.description}>
            Esta ação é <strong>permanente e irreversível</strong>. Ao confirmar:
          </p>
          <ul className={styles.list}>
            <li>Todas as suas tarefas, notas, categorias e listas serão apagadas.</li>
            <li>Sua assinatura no Stripe será cancelada imediatamente.</li>
            <li>Sua conexão com WhatsApp e Google será removida.</li>
            <li>Você perderá acesso ao Jarvi com este email.</li>
          </ul>
          <p className={styles.descriptionMuted}>
            O histórico financeiro é mantido no Stripe para fins de auditoria, mas seus dados
            pessoais serão removidos do app.
          </p>
        </div>

        <div className={styles.confirmField}>
          <TextInput
            id="delete-account-confirm"
            label={`Digite ${CONFIRM_WORD} para confirmar`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder={CONFIRM_WORD}
            disabled={isDeleting}
            autoComplete="off"
          />
        </div>

        {error && <p className={styles.errorMessage}>{error}</p>}

        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            loading={isDeleting}
            disabled={!canConfirm || isDeleting}
          >
            {isDeleting ? 'Deletando...' : 'Deletar Conta'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
