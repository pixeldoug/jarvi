/**
 * AddEmailDialog
 *
 * WhatsApp-only accounts add email + password, then confirm the email OTP
 * before the address becomes a login method.
 */

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { EnvelopeSimple } from '@phosphor-icons/react';
import { Button, Dialog, OtpInput, PasswordInput, TextInput, toast } from '../../../../ui';
import { useAuth } from '../../../../../contexts/AuthContext';
import styles from '../ChangePasswordDialog/ChangePasswordDialog.module.css';

export interface AddEmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddEmailDialog({ isOpen, onClose }: AddEmailDialogProps) {
  const { user, addEmailToWhatsappAccount, verifyAddedEmail } = useAuth();

  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [code, setCode] = useState('');
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const pendingEmail = user?.email && !user.emailVerified ? user.email : '';
    setStep(pendingEmail ? 'otp' : 'form');
    setEmail(pendingEmail);
    setPassword('');
    setConfirmPassword('');
    setPasswordStrength(0);
    setCode('');
    setLocalCode(null);
    setError('');
    setIsSubmitting(false);
    setIsResending(false);
  }, [isOpen, user?.email, user?.emailVerified]);

  const handleSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.includes('@')) {
      setError('Informe um email válido.');
      return;
    }
    if (password.length < 8) {
      setError('A senha precisa ter ao menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (passwordStrength < 2) {
      setError('Escolha uma senha mais forte.');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await addEmailToWhatsappAccount(trimmedEmail, password);
      setEmail(trimmedEmail);
      setLocalCode(result.devCode || null);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || isResending || isSubmitting) return;
    setError('');
    try {
      setIsResending(true);
      const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível reenviar o código.');
      }
      toast.success('Enviamos um novo código para este email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reenviar o código.');
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyCode = async (overrideCode?: string) => {
    const normalized = (overrideCode ?? code).replace(/\D/g, '').slice(0, 6);
    if (normalized.length !== 6 || isSubmitting) return;
    setError('');
    try {
      setIsSubmitting(true);
      await verifyAddedEmail(email, normalized);
      toast.success('Email confirmado. Agora você também pode entrar com email e senha.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.');
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
      {step === 'form' ? (
        <form className={styles.body} onSubmit={handleSubmitForm}>
          <div className={styles.iconBadge}>
            <EnvelopeSimple size={24} weight="regular" />
          </div>

          <div className={styles.textBlock}>
            <h2 className={styles.title}>Adicionar email</h2>
            <p className={styles.description}>
              Vamos enviar um código para confirmar que o email é seu. Só depois disso ele vira
              uma forma de entrar.
            </p>
          </div>

          <div className={styles.form}>
            <TextInput
              id="add-email-address"
              name="email"
              type="email"
              label="Email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
            />
            <PasswordInput
              id="add-email-password"
              name="password"
              label="Senha"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Crie uma senha"
              showStrengthMeter
              minStrength={2}
              onStrengthChange={setPasswordStrength}
              helperText="Mínimo de 8 caracteres"
              userInputs={user ? [email, user.name] : [email]}
            />
            <PasswordInput
              id="add-email-password-confirm"
              name="confirmPassword"
              label="Confirmar senha"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
            />
          </div>

          {error && <p className={styles.errorMessage}>{error}</p>}

          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting} disabled={isSubmitting}>
              Enviar código
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.body}>
          <div className={styles.iconBadge}>
            <EnvelopeSimple size={24} weight="regular" />
          </div>

          <div className={styles.textBlock}>
            <h2 className={styles.title}>Confirme seu email</h2>
            <p className={styles.description}>
              Digite o código de 6 dígitos enviado para {email}.
              {localCode ? ` Código local: ${localCode}` : ''}
            </p>
          </div>

          <OtpInput
            value={code}
            onChange={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            length={6}
            disabled={isSubmitting}
            error={!!error}
            onComplete={(value) => {
              void handleVerifyCode(value);
            }}
          />

          {error && <p className={styles.errorMessage}>{error}</p>}

          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleResendCode()}
              disabled={isSubmitting || isResending}
              loading={isResending}
            >
              Reenviar código
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={isSubmitting}
              disabled={isSubmitting || code.replace(/\D/g, '').length !== 6}
              onClick={() => {
                void handleVerifyCode();
              }}
            >
              Confirmar
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
