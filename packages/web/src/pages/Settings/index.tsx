import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Input } from '../../components/ui';
import styles from './Settings.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const Settings: React.FC = () => {
  const { user, token } = useAuth();
  
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
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

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

    if (newPassword.length < 6) {
      setPasswordError('A nova senha deve ter pelo menos 6 caracteres');
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
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Erro ao atualizar senha');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Configurações</h1>
        <p className={styles.subtitle}>Gerencie suas credenciais de acesso</p>
      </div>

      {/* Email Section */}
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

      {/* Password Section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Alterar Senha</h2>
        <p className={styles.sectionDescription}>
          Digite sua senha atual e escolha uma nova senha.
        </p>

        {passwordMessage && <div className={styles.success}>{passwordMessage}</div>}
        {passwordError && <div className={styles.error}>{passwordError}</div>}

        <form className={styles.form} onSubmit={handlePasswordSubmit}>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            label="Senha atual"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Digite sua senha atual"
          />

          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            label="Nova senha"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Digite sua nova senha"
          />

          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            label="Confirmar nova senha"
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
    </div>
  );
};

export default Settings;
