/**
 * AccountDialog Component - Jarvi Web
 * 
 * Dialog for managing user account settings
 * Following JarviDS design system from Figma
 * 
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-Web
 * Node: 40000506-20916
 */

import { useState, useRef } from 'react';
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

// Constants for validation
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface AccountDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when the dialog should close */
  onClose: () => void;
}

export function AccountDialog({ isOpen, onClose }: AccountDialogProps) {
  const { user, updateUser } = useAuth();
  const { subscription } = useSubscription();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [name, setName] = useState(user?.name || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const userName = user?.name || 'Usuário';
  const userEmail = user?.email || 'usuario@email.com';
  const userAvatar = user?.avatar;

  // Format date to Brazilian Portuguese
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return null;
    const date = new Date(dateString);
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
        return {
          name: 'Jarvi Plus',
          description: subscription?.currentPeriodEnd
            ? `Seu plano renovará automaticamente em ${formatDate(subscription.currentPeriodEnd)}.`
            : null,
        };
      case 'trialing':
        return {
          name: 'Gratuito',
          description: subscription?.trialEndsAt
            ? `Seu plano gratuito expira em ${formatDate(subscription.trialEndsAt)}.`
            : null,
        };
      case 'past_due':
        return { name: 'Pagamento pendente', description: 'Atualize seu método de pagamento.' };
      case 'canceled':
        return { name: 'Cancelado', description: 'Seu plano foi cancelado.' };
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
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value to allow selecting the same file again
    e.target.value = '';

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Formato inválido. Use JPG, PNG ou WebP.');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Imagem muito grande. Máximo 4MB.');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      
      try {
        setIsUploading(true);
        const token = localStorage.getItem('jarvi_token');
        
        const response = await fetch(`${API_BASE_URL}/api/users/avatar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ avatar: base64 }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Erro ao atualizar avatar');
        }

        const data = await response.json();
        updateUser({ avatar: data.avatar });
        toast.success('Avatar atualizado com sucesso!');
      } catch (error) {
        console.error('Error uploading avatar:', error);
        toast.error(error instanceof Error ? error.message : 'Erro ao atualizar avatar');
      } finally {
        setIsUploading(false);
      }
    };

    reader.onerror = () => {
      toast.error('Erro ao ler o arquivo');
    };

    reader.readAsDataURL(file);
  };

  const handleRemoveImage = async () => {
    if (!user?.avatar) {
      toast.info('Você não tem uma imagem de perfil para remover.');
      return;
    }

    try {
      setIsRemoving(true);
      const token = localStorage.getItem('jarvi_token');
      
      const response = await fetch(`${API_BASE_URL}/api/users/avatar`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao remover avatar');
      }

      updateUser({ avatar: undefined });
      toast.success('Avatar removido com sucesso!');
    } catch (error) {
      console.error('Error removing avatar:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao remover avatar');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleNameBlur = async () => {
    const trimmedName = name.trim();
    
    // Don't save if empty or unchanged
    if (!trimmedName || trimmedName === user?.name) {
      // Reset to original if empty
      if (!trimmedName) {
        setName(user?.name || '');
      }
      return;
    }

    try {
      setIsSavingName(true);
      const token = localStorage.getItem('jarvi_token');
      
      const response = await fetch(`${API_BASE_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao atualizar nome');
      }

      updateUser({ name: trimmedName });
      toast.success('Nome atualizado com sucesso!');
    } catch (error) {
      console.error('Error updating name:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar nome');
      // Reset to original name on error
      setName(user?.name || '');
    } finally {
      setIsSavingName(false);
    }
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
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <Button 
                  variant="secondary" 
                  onClick={handleUpdateImage}
                  loading={isUploading}
                  disabled={isUploading || isRemoving}
                >
                  {isUploading ? 'Enviando...' : 'Atualizar Imagem'}
                </Button>
                <Button 
                  variant="secondary" 
                  onClick={handleRemoveImage}
                  loading={isRemoving}
                  disabled={isUploading || isRemoving || !userAvatar}
                >
                  {isRemoving ? 'Removendo...' : 'Remover'}
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
              onBlur={handleNameBlur}
              placeholder="Seu nome"
              disabled={isSavingName}
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
