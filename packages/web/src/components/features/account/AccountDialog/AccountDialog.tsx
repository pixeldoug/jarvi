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
  PasswordInput,
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

  // Email change form states
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [isChangingEmail, setIsChangingEmail] = useState(false);

  // Password change form states
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Add password to Google account states
  const [showAddPasswordForm, setShowAddPasswordForm] = useState(false);
  const [googleNewPassword, setGoogleNewPassword] = useState('');
  const [googleConfirmPassword, setGoogleConfirmPassword] = useState('');
  const [googlePasswordStrength, setGooglePasswordStrength] = useState(0);
  const [isAddingPassword, setIsAddingPassword] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const userName = user?.name || 'Usuário';
  const userEmail = user?.email || 'usuario@email.com';
  const userAvatar = user?.avatar;
  const isGoogleUser = user?.authProvider === 'google' && !user?.hasPassword;

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
            ? `Seu período de teste termina em ${formatDate(subscription.trialEndsAt)}.`
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

  const handleToggleEmailForm = () => {
    setShowEmailForm(!showEmailForm);
    setShowPasswordForm(false);
    // Reset form fields
    setNewEmail('');
    setEmailPassword('');
  };

  const handleTogglePasswordForm = () => {
    setShowPasswordForm(!showPasswordForm);
    setShowEmailForm(false);
    // Reset form fields
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEmail.trim()) {
      toast.error('Digite o novo email');
      return;
    }

    if (!emailPassword) {
      toast.error('Digite sua senha atual');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      toast.error('Formato de email inválido');
      return;
    }

    try {
      setIsChangingEmail(true);
      const token = localStorage.getItem('jarvi_token');
      
      const response = await fetch(`${API_BASE_URL}/api/users/email`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          newEmail: newEmail.trim(), 
          currentPassword: emailPassword 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao alterar email');
      }

      toast.success(data.message || 'Email de confirmação enviado!');
      setShowEmailForm(false);
      setNewEmail('');
      setEmailPassword('');
    } catch (error) {
      console.error('Error changing email:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao alterar email');
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentPassword) {
      toast.error('Digite sua senha atual');
      return;
    }

    if (!newPassword) {
      toast.error('Digite a nova senha');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    try {
      setIsChangingPassword(true);
      const token = localStorage.getItem('jarvi_token');
      
      const response = await fetch(`${API_BASE_URL}/api/users/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao alterar senha');
      }

      toast.success(data.message || 'Senha alterada com sucesso!');
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Error changing password:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao alterar senha');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    toast.info('Em breve: Deletar conta');
  };

  const handleAddPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!googleNewPassword || googleNewPassword.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres');
      return;
    }

    if (googlePasswordStrength < 2) {
      toast.error('Por favor, escolha uma senha mais forte');
      return;
    }

    if (googleNewPassword !== googleConfirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    try {
      setIsAddingPassword(true);
      const token = localStorage.getItem('jarvi_token');
      
      const response = await fetch(`${API_BASE_URL}/api/auth/google/add-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ password: googleNewPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar senha');
      }

      // Update user context to reflect that now they have password
      updateUser({ hasPassword: true });
      
      toast.success('Senha criada com sucesso! Sua conta agora usa email/senha.');
      
      // Reset form
      setShowAddPasswordForm(false);
      setGoogleNewPassword('');
      setGoogleConfirmPassword('');
      setGooglePasswordStrength(0);
    } catch (error) {
      console.error('Error adding password:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao criar senha');
    } finally {
      setIsAddingPassword(false);
    }
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

      {/* Email Section - Conditional based on auth provider */}
      <section className={styles.section}>
        <div className={styles.emailInfo}>
          <p className={styles.sectionLabel}>Email</p>
          <p className={styles.emailValue}>{userEmail}</p>
        </div>
        
        {/* Show buttons only for non-Google users */}
        {!isGoogleUser && (
          <>
            <div className={styles.buttonGroup}>
              <Button 
                variant={showEmailForm ? 'primary' : 'secondary'} 
                onClick={handleToggleEmailForm}
              >
                Alterar Email
              </Button>
              <Button 
                variant={showPasswordForm ? 'primary' : 'secondary'} 
                onClick={handleTogglePasswordForm}
              >
                Alterar Senha
              </Button>
            </div>

            {/* Email Change Form */}
            {showEmailForm && (
              <form className={styles.form} onSubmit={handleSubmitEmail}>
                <TextInput
                  id="new-email"
                  label="Novo email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Digite seu novo email"
                  disabled={isChangingEmail}
                />
                <TextInput
                  id="email-password"
                  label="Senha atual"
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="Confirme sua senha"
                  disabled={isChangingEmail}
                />
                <p className={styles.formHelpText}>
                  Você receberá um email de confirmação no novo endereço.
                </p>
                <div className={styles.formActions}>
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={handleToggleEmailForm}
                    disabled={isChangingEmail}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    variant="primary"
                    loading={isChangingEmail}
                    disabled={isChangingEmail}
                  >
                    {isChangingEmail ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            )}

            {/* Password Change Form */}
            {showPasswordForm && (
              <form className={styles.form} onSubmit={handleSubmitPassword}>
                <TextInput
                  id="current-password"
                  label="Senha atual"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Digite sua senha atual"
                  disabled={isChangingPassword}
                />
                <TextInput
                  id="new-password"
                  label="Nova senha"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Digite sua nova senha"
                  disabled={isChangingPassword}
                />
                <TextInput
                  id="confirm-password"
                  label="Confirmar nova senha"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme sua nova senha"
                  disabled={isChangingPassword}
                />
                <div className={styles.formActions}>
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={handleTogglePasswordForm}
                    disabled={isChangingPassword}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    variant="primary"
                    loading={isChangingPassword}
                    disabled={isChangingPassword}
                  >
                    {isChangingPassword ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </section>

      {/* Google Connected Account Section - Only for Google users */}
      {isGoogleUser && (
        <>
          <Divider />
          <section className={styles.section}>
            <p className={styles.sectionLabel}>Conta connectada</p>
            <p className={styles.formHelpText}>
              Você faz login no Jarvi com sua conta do Google {userEmail}
            </p>
            
            {!showAddPasswordForm ? (
              <>
                <p className={styles.formHelpText} style={{ marginTop: '12px' }}>
                  Para desconectar sua conta do Google, primeiro crie uma senha para acessar sua conta com email/senha.
                </p>
                <Button 
                  variant="primary" 
                  onClick={() => setShowAddPasswordForm(true)}
                  style={{ marginTop: '16px' }}
                >
                  Criar Senha
                </Button>
              </>
            ) : (
              <form className={styles.form} onSubmit={handleAddPassword}>
                <PasswordInput
                  id="google-new-password"
                  name="google-new-password"
                  label="Nova senha"
                  autoComplete="new-password"
                  required
                  value={googleNewPassword}
                  onChange={(e) => setGoogleNewPassword(e.target.value)}
                  placeholder="Digite sua nova senha"
                  showStrengthMeter={true}
                  minStrength={2}
                  onStrengthChange={setGooglePasswordStrength}
                  userInputs={[user?.email || '', user?.name || '']}
                  helperText="Mínimo de 8 caracteres"
                  disabled={isAddingPassword}
                />
                <PasswordInput
                  id="google-confirm-password"
                  name="google-confirm-password"
                  label="Confirmar nova senha"
                  autoComplete="new-password"
                  required
                  value={googleConfirmPassword}
                  onChange={(e) => setGoogleConfirmPassword(e.target.value)}
                  placeholder="Confirme sua nova senha"
                  disabled={isAddingPassword}
                />
                <p className={styles.formHelpText}>
                  Após criar uma senha, você poderá fazer login com email/senha e sua conta será desconectada do Google.
                </p>
                <div className={styles.formActions}>
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => {
                      setShowAddPasswordForm(false);
                      setGoogleNewPassword('');
                      setGoogleConfirmPassword('');
                      setGooglePasswordStrength(0);
                    }}
                    disabled={isAddingPassword}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    variant="primary"
                    loading={isAddingPassword}
                    disabled={isAddingPassword}
                  >
                    {isAddingPassword ? 'Criando...' : 'Criar Senha'}
                  </Button>
                </div>
              </form>
            )}
          </section>
        </>
      )}

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
