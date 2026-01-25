/**
 * AccountDialog Component - Jarvi Web
 * 
 * Dialog for managing user account settings
 * Following JarviDS design system from Figma
 * 
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-Web
 * Node: 40000506-20916
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import { useSubscription } from '../../../../contexts/SubscriptionContext';
import {
  Dialog,
  Avatar,
  Button,
  Divider,
  TextInput,
  toast,
} from '../../../ui';
import styles from './AccountDialog.module.css';

export interface AccountDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when the dialog should close */
  onClose: () => void;
}

export function AccountDialog({ isOpen, onClose }: AccountDialogProps) {
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const navigate = useNavigate();
  
  const [name, setName] = useState(user?.name || '');

  const userName = user?.name || 'Usuário';
  const userEmail = user?.email || 'usuario@email.com';
  const userAvatar = user?.avatar;

  // Format trial end date
  const formatTrialEndDate = () => {
    if (!subscription?.trialEndsAt) return null;
    const date = new Date(subscription.trialEndsAt);
    return date.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Get plan display info
  const getPlanInfo = () => {
    switch (subscription?.status) {
      case 'active':
        return { name: 'Pro', description: null };
      case 'trialing':
        return {
          name: 'Gratuito',
          description: `Seu plano gratuito expira em ${formatTrialEndDate()}.`,
        };
      case 'past_due':
        return { name: 'Pagamento pendente', description: 'Atualize seu método de pagamento.' };
      case 'canceled':
        return { name: 'Cancelado', description: null };
      default:
        return { name: 'Gratuito', description: null };
    }
  };

  const planInfo = getPlanInfo();

  // Handlers
  const handleManagePlan = () => {
    onClose();
    navigate('/subscribe');
  };

  const handleUpdateImage = () => {
    toast.info('Em breve: Upload de imagem');
  };

  const handleRemoveImage = () => {
    toast.info('Em breve: Remover imagem');
  };

  const handleChangeEmail = () => {
    toast.info('Em breve: Alterar email');
  };

  const handleChangePassword = () => {
    toast.info('Em breve: Alterar senha');
  };

  const handleDeleteAccount = () => {
    toast.info('Em breve: Deletar conta');
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Minha Conta"
      width="lg"
    >
      {/* Plan Section */}
      <section className={styles.section}>
        <div className={styles.planHeader}>
          <div className={styles.planInfo}>
            <p className={styles.sectionLabel}>Plano</p>
            <p className={styles.planName}>{planInfo.name}</p>
            {planInfo.description && (
              <p className={styles.planDescription}>{planInfo.description}</p>
            )}
          </div>
          <div className={styles.actions}>
            <Button variant="primary" onClick={handleManagePlan}>
              Gerenciar Plano
            </Button>
          </div>
        </div>
      </section>

      <Divider />

      {/* Profile Section */}
      <section className={styles.section}>
        <p className={styles.sectionLabel}>Meu perfil</p>
        
        <div className={styles.profileInfo}>
          <div className={styles.profileDetails}>
            <Avatar src={userAvatar} name={userName} size="large" />
            
            <div className={styles.profileActions}>
              <div className={styles.buttonGroup}>
                <Button variant="secondary" onClick={handleUpdateImage}>
                  Atualizar Imagem
                </Button>
                <Button variant="secondary" onClick={handleRemoveImage}>
                  Remover
                </Button>
              </div>
              <p className={styles.helpText}>Escolha uma imagem de até 4MB.</p>
            </div>
          </div>

          <div className={styles.nameInput}>
            <TextInput
              id="account-name"
              label="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>
        </div>
      </section>

      <Divider />

      {/* Email Section */}
      <section className={styles.section}>
        <div className={styles.emailInfo}>
          <p className={styles.sectionLabel}>Email</p>
          <p className={styles.emailValue}>{userEmail}</p>
        </div>
        
        <div className={styles.buttonGroup}>
          <Button variant="secondary" onClick={handleChangeEmail}>
            Alterar Email
          </Button>
          <Button variant="secondary" onClick={handleChangePassword}>
            Alterar Senha
          </Button>
        </div>
      </section>

      <Divider />

      {/* Delete Account Section */}
      <section className={styles.section}>
        <p className={styles.sectionLabel}>Deletar Conta</p>
        
        <div className={styles.deleteInfo}>
          <Button variant="destructive" onClick={handleDeleteAccount}>
            Deletar Conta
          </Button>
          <p className={styles.deleteWarning}>
            Excluir sua conta é permanente. Você perderá imediatamente o acesso a todos os seus dados.
          </p>
        </div>
      </section>
    </Dialog>
  );
}
