/**
 * DisconnectGoogleDialog
 *
 * Fluxo seguro para desvincular o login do Google:
 * 1. Aviso: explica que o usuário precisa criar uma senha local antes.
 * 2. Criar senha (com medidor de força + confirmação).
 * 3. Confirmação final: desvincula o Google mantendo todos os dados.
 *
 * NÃO deleta dados e NÃO faz logout — o usuário continua logado,
 * apenas passa a usar email+senha para futuros logins.
 */

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Warning, ShieldCheck, CheckCircle } from '@phosphor-icons/react';
import { Button, Dialog, PasswordInput, toast } from '../../../../ui';
import { useAuth } from '../../../../../contexts/AuthContext';
import styles from './DisconnectGoogleDialog.module.css';

type Step = 'intro' | 'create-password' | 'confirm' | 'success';

export interface DisconnectGoogleDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DisconnectGoogleDialog({ isOpen, onClose }: DisconnectGoogleDialogProps) {
  const { user, addPasswordToGoogleAccount, disconnectGoogle } = useAuth();

  const initialStep: Step = user?.hasPassword ? 'confirm' : 'intro';

  const [step, setStep] = useState<Step>(initialStep);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep(user?.hasPassword ? 'confirm' : 'intro');
      setPassword('');
      setConfirmPassword('');
      setPasswordStrength(0);
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen, user?.hasPassword]);

  const closeIfIdle = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleCreatePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

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
      await addPasswordToGoogleAccount(password);
      setPassword('');
      setConfirmPassword('');
      toast.success('Senha criada com sucesso!');
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar senha.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDisconnect = async () => {
    setError('');
    try {
      setIsSubmitting(true);
      await disconnectGoogle();
      toast.success('Google desvinculado. Use email e senha nos próximos logins.');
      setStep('success');
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'PASSWORD_REQUIRED') {
        setStep('create-password');
        setError('Crie uma senha antes de desvincular.');
      } else {
        setError(err instanceof Error ? err.message : 'Erro ao desvincular Google.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinish = () => {
    onClose();
  };

  const renderIntro = () => (
    <div className={styles.stepBody}>
      <div className={styles.iconBadge} data-variant="warning">
        <Warning size={24} weight="regular" />
      </div>
      <div className={styles.textBlock}>
        <h2 className={styles.title}>Desvincular Google</h2>
        <p className={styles.description}>
          Você entra no Jarvi com sua conta do Google{user?.email ? ` (${user.email})` : ''}.
          Para desvincular, primeiro crie uma senha — ela será usada nos seus próximos logins
          com email e senha.
        </p>
        <p className={styles.descriptionMuted}>
          Seus dados, tarefas, categorias e configurações serão preservados.
        </p>
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={() => setStep('create-password')}>
          Criar senha
        </Button>
      </div>
    </div>
  );

  const renderCreatePassword = () => (
    <form className={styles.stepBody} onSubmit={handleCreatePassword}>
      <div className={styles.iconBadge} data-variant="info">
        <ShieldCheck size={24} weight="regular" />
      </div>
      <div className={styles.textBlock}>
        <h2 className={styles.title}>Crie uma senha</h2>
        <p className={styles.description}>
          Esta senha será usada para fazer login com email e senha depois que você desvincular o Google.
        </p>
      </div>

      <div className={styles.form}>
        <PasswordInput
          id="disconnect-google-password"
          name="password"
          label="Nova senha"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Digite uma senha"
          showStrengthMeter
          minStrength={2}
          onStrengthChange={setPasswordStrength}
          helperText="Mínimo de 8 caracteres"
          userInputs={user ? [user.email, user.name] : []}
        />
        <PasswordInput
          id="disconnect-google-password-confirm"
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
        <Button
          type="button"
          variant="secondary"
          onClick={() => setStep('intro')}
          disabled={isSubmitting}
        >
          Voltar
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          Continuar
        </Button>
      </div>
    </form>
  );

  const renderConfirm = () => (
    <div className={styles.stepBody}>
      <div className={styles.iconBadge} data-variant="warning">
        <Warning size={24} weight="regular" />
      </div>
      <div className={styles.textBlock}>
        <h2 className={styles.title}>Confirmar desvinculação</h2>
        <p className={styles.description}>
          Sua senha foi salva. Ao desvincular, você não poderá mais entrar pelo Google —
          use <strong>{user?.email}</strong> e a senha que acabou de criar.
        </p>
        <p className={styles.descriptionMuted}>
          Nenhum dado será apagado. Você pode continuar usando a sessão atual.
        </p>
      </div>

      {error && <p className={styles.errorMessage}>{error}</p>}

      <div className={styles.actions}>
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Manter vinculado
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleConfirmDisconnect}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          Desvincular Google
        </Button>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className={styles.stepBody}>
      <div className={styles.iconBadge} data-variant="success">
        <CheckCircle size={24} weight="regular" />
      </div>
      <div className={styles.textBlock}>
        <h2 className={styles.title}>Pronto!</h2>
        <p className={styles.description}>
          Seu Google foi desvinculado. Da próxima vez, entre com <strong>{user?.email}</strong> e
          sua senha.
        </p>
      </div>
      <div className={styles.actions}>
        <Button variant="primary" onClick={handleFinish}>
          Entendi
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={closeIfIdle}
      width="md"
      showCloseButton={!isSubmitting && step !== 'success'}
      contentClassName={styles.dialogContent}
    >
      {step === 'intro' && renderIntro()}
      {step === 'create-password' && renderCreatePassword()}
      {step === 'confirm' && renderConfirm()}
      {step === 'success' && renderSuccess()}
    </Dialog>
  );
}
