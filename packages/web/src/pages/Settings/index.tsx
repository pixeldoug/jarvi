import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Input, PasswordInput } from '../../components/ui';
import { GoogleLogin } from '../../components/features/auth';
import styles from './Settings.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const Settings: React.FC = () => {
  const { user, token, logout } = useAuth();
  
  // Email form state
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Google disconnect state
  const [disconnectError, setDisconnectError] = useState('');

  const isGoogleUser = user?.authProvider === 'google';

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailMessage('');
    setEmailLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/users/email`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          newEmail, 
          currentPassword: emailPassword 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar email');
      }

      setEmailMessage(data.message);
      setNewEmail('');
      setEmailPassword('');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Erro ao atualizar email');
    } finally {
      setEmailLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('A nova senha deve ter pelo menos 8 caracteres');
      return;
    }

    if (passwordStrength < 2) {
      setPasswordError('Por favor, escolha uma senha mais forte');
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/users/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar senha');
      }

      setPasswordMessage(data.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStrength(0);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Erro ao atualizar senha');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    const confirmDisconnect = window.confirm(
      'Tem certeza que deseja desconectar sua conta do Google? Isso excluirá permanentemente sua conta e todos os seus dados.'
    );

    if (!confirmDisconnect) {
      return;
    }

    setDisconnectError('');

    try {
      const response = await fetch(`${API_URL}/api/auth/google/disconnect`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao desconectar conta Google');
      }

      // Successfully disconnected, logout user
      logout();
    } catch (err) {
      setDisconnectError(err instanceof Error ? err.message : 'Erro ao desconectar conta Google');
    } finally {
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Configurações</h1>
        <p className={styles.subtitle}>
          {isGoogleUser 
            ? 'Gerencie sua conta Google' 
            : 'Gerencie suas credenciais de acesso'}
        </p>
      </div>

      {/* Email Section - Read-only for Google users */}
      {!isGoogleUser ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Alterar Email</h2>
          <p className={styles.sectionDescription}>
            Após alterar, você receberá um email de confirmação no novo endereço.
          </p>

          <div className={styles.currentInfo}>
            <span className={styles.currentInfoLabel}>Email atual:</span>
            <span className={styles.currentInfoValue}>{user?.email}</span>
          </div>

          {emailMessage && <div className={styles.success}>{emailMessage}</div>}
          {emailError && <div className={styles.error}>{emailError}</div>}

          <form className={styles.form} onSubmit={handleEmailSubmit}>
            <Input
              id="newEmail"
              name="newEmail"
              type="email"
              label="Novo email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Digite seu novo email"
            />

            <Input
              id="emailPassword"
              name="emailPassword"
              type="password"
              label="Senha atual"
              required
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder="Confirme sua senha"
            />

            <div className={styles.formActions}>
              <Button
                type="submit"
                variant="primary"
                size="medium"
                disabled={emailLoading}
                loading={emailLoading}
              >
                Alterar email
              </Button>
            </div>
          </form>
        </section>
      ) : (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Email</h2>
          <div className={styles.currentInfo}>
            <span className={styles.currentInfoValue}>{user?.email}</span>
          </div>
        </section>
      )}

      {/* Password Section - Only for email users */}
      {!isGoogleUser && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Alterar Senha</h2>
          <p className={styles.sectionDescription}>
            Digite sua senha atual e escolha uma nova senha.
          </p>

          {passwordMessage && <div className={styles.success}>{passwordMessage}</div>}
          {passwordError && <div className={styles.error}>{passwordError}</div>}

          <form className={styles.form} onSubmit={handlePasswordSubmit}>
            <PasswordInput
              id="currentPassword"
              name="currentPassword"
              label="Senha atual"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Digite sua senha atual"
            />

            <PasswordInput
              id="newPassword"
              name="newPassword"
              label="Nova senha"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Digite sua nova senha"
              showStrengthMeter={true}
              minStrength={2}
              onStrengthChange={setPasswordStrength}
              userInputs={[user?.email || '', user?.name || '']}
              helperText="Mínimo de 8 caracteres"
            />

            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              label="Confirmar nova senha"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirme sua nova senha"
            />

            <div className={styles.formActions}>
              <Button
                type="submit"
                variant="primary"
                size="medium"
                disabled={passwordLoading}
                loading={passwordLoading}
              >
                Alterar senha
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Google Connected Account Section - Only for Google users */}
      {isGoogleUser && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Conta connectada</h2>
          <p className={styles.sectionDescription}>
            Você pode fazer login no Jarvi com sua conta do Google {user?.email}
          </p>

          {disconnectError && <div className={styles.error}>{disconnectError}</div>}

          <div className={styles.googleButtonWrapper}>
            <GoogleLogin
              buttonText="Desconectar Google"
              onClick={handleDisconnectGoogle}
            />
          </div>
        </section>
      )}
    </div>
  );
};

export default Settings;
