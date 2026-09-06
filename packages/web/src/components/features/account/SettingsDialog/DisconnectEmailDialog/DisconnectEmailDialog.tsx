/**
 * DisconnectEmailDialog
 *
 * Removes email/Google login while WhatsApp stays connected.
 */

import { useState } from 'react';
import { EnvelopeSimple } from '@phosphor-icons/react';
import { Button, Dialog, toast } from '../../../../ui';
import { useAuth } from '../../../../../contexts/AuthContext';
import styles from '../ChangePasswordDialog/ChangePasswordDialog.module.css';

export interface DisconnectEmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DisconnectEmailDialog({ isOpen, onClose }: DisconnectEmailDialogProps) {
  const { user, disconnectEmailLogin } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setError('');
    try {
      setIsSubmitting(true);
      await disconnectEmailLogin();
      toast.success('Email desconectado. Você passa a entrar só com o WhatsApp.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao desconectar o email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      width="md"
      showCloseButton={!isSubmitting}
      contentClassName={styles.dialogContent}
    >
      <div className={styles.body}>
        <div className={styles.iconBadge}>
          <EnvelopeSimple size={24} weight="regular" />
        </div>

        <div className={styles.textBlock}>
          <h2 className={styles.title}>Desconectar email</h2>
          <p className={styles.description}>
            {user?.email
              ? `Você deixa de entrar com ${user.email} e passa a usar só o WhatsApp.`
              : 'Você deixa de entrar com este email e passa a usar só o WhatsApp.'}
          </p>
        </div>

        {error && <p className={styles.errorMessage}>{error}</p>}

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={isSubmitting}
            disabled={isSubmitting}
            onClick={handleConfirm}
          >
            Desconectar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
