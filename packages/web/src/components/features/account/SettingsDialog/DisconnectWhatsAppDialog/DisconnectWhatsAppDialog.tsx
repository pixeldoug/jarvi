/**
 * DisconnectWhatsAppDialog
 *
 * Confirms unlinking WhatsApp. Requires a real email on the account.
 */

import { useState } from 'react';
import { WhatsappLogo } from '@phosphor-icons/react';
import { Button, Dialog, toast } from '../../../../ui';
import { useAuth } from '../../../../../contexts/AuthContext';
import styles from '../ChangePasswordDialog/ChangePasswordDialog.module.css';

export interface DisconnectWhatsAppDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DisconnectWhatsAppDialog({ isOpen, onClose }: DisconnectWhatsAppDialogProps) {
  const { unlinkWhatsApp } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setError('');
    try {
      setIsSubmitting(true);
      await unlinkWhatsApp();
      toast.success('WhatsApp desconectado.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao desconectar o WhatsApp.');
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
          <WhatsappLogo size={24} weight="regular" />
        </div>

        <div className={styles.textBlock}>
          <h2 className={styles.title}>Desconectar WhatsApp</h2>
          <p className={styles.description}>
            Você deixa de conversar com a Jarvi neste número e passa a entrar só com email.
            Pode conectar de novo depois em Apps.
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
