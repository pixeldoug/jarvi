/**
 * ChangePasswordDialog
 *
 * Permite que usuários com login manual (email+senha) alterem sua senha.
 * Requer a senha atual para confirmar a identidade antes de aceitar a nova.
 */

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { LockKey } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, PasswordInput, toast } from '../../../../ui';
import { useAuth } from '../../../../../contexts/AuthContext';
import styles from './ChangePasswordDialog.module.css';

const FORGOT_PASSWORD_PATH = '/forgot-password';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ChangePasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChangePasswordDialog({ isOpen, onClose }: ChangePasswordDialogProps) {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStrength(0);
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('A nova senha precisa ter ao menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (passwordStrength < 2) {
      setError('Escolha uma senha mais forte.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`${API_URL}/api/users/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao atualizar senha.');
      toast.success('Senha atualizada com sucesso!');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar senha.');
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
      <form className={styles.body} onSubmit={handleSubmit}>
        <div className={styles.iconBadge}>
          <LockKey size={24} weight="regular" />
        </div>

        <div className={styles.textBlock}>
          <h2 className={styles.title}>Alterar senha</h2>
          <p className={styles.description}>
            Digite sua senha atual e escolha uma nova senha para {user?.email}.
          </p>
        </div>

        <div className={styles.form}>
          <div className={styles.currentPasswordBlock}>
            <PasswordInput
              id="change-password-current"
              name="currentPassword"
              label="Senha atual"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Digite sua senha atual"
            />
            <button
              type="button"
              className={styles.forgotLink}
              onClick={() => {
                onClose();
                navigate(FORGOT_PASSWORD_PATH);
              }}
            >
              Esqueceu sua senha?
            </button>
          </div>
          <PasswordInput
            id="change-password-new"
            name="newPassword"
            label="Nova senha"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Digite a nova senha"
            showStrengthMeter
            minStrength={2}
            onStrengthChange={setPasswordStrength}
            helperText="Mínimo de 8 caracteres"
            userInputs={user ? [user.email, user.name] : []}
          />
          <PasswordInput
            id="change-password-confirm"
            name="confirmPassword"
            label="Confirmar nova senha"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repita a nova senha"
          />
        </div>

        {error && <p className={styles.errorMessage}>{error}</p>}

        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Salvar senha
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
