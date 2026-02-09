import { useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Logo, OtpInput } from '../../components/ui';
import { useForceTheme } from '../../hooks/useForceTheme';
import styles from './VerifyPending.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const VerifyPending: React.FC = () => {
  useForceTheme('light');

  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const lastSubmittedCodeRef = useRef<string | null>(null);
  
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || '';

  const handleVerifyCode = async (overrideCode?: string) => {
    if (!email) {
      setError('Email não encontrado. Por favor, faça o cadastro novamente.');
      return;
    }

    const normalizedCode = (overrideCode ?? code).replace(/\D/g, '').slice(0, 6);
    if (normalizedCode.length !== 6) {
      setError('Digite o código de 6 dígitos');
      return;
    }

    if (isVerifying) return;
    if (lastSubmittedCodeRef.current === normalizedCode) return;
    lastSubmittedCodeRef.current = normalizedCode;

    setIsVerifying(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`${API_URL}/api/auth/verify-email-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, code: normalizedCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao verificar código');
      }

      // Auto-login: salva token e redireciona para a home
      if (data.token) {
        localStorage.setItem('jarvi_token', data.token);
        window.location.href = '/';
        return;
      }

      // Fallback (não esperado): mantém comportamento anterior
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao verificar código');
      // Allow retry with the same code if request failed
      lastSubmittedCodeRef.current = null;
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendEmail = async () => {
    if (!email) {
      setError('Email não encontrado. Por favor, faça o cadastro novamente.');
      return;
    }

    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao reenviar email');
      }

      setMessage('Código de verificação reenviado com sucesso!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao reenviar email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigate('/login');
  };

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <Logo className={styles.logo} />
        
        <div className={styles.content}>
          <h1 className={styles.title}>Verifique seu email</h1>
          
          <p className={styles.description}>
            Enviamos um código de verificação para{' '}
            {email ? (
              <span className={styles.email}>{email}</span>
            ) : (
              'seu email'
            )}
            . Digite o código abaixo para ativar sua conta.
          </p>

          {message && <div className={styles.success}>{message}</div>}
          {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              {!verified && (
                <OtpInput
                  value={code}
                  onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                  length={6}
                  disabled={isVerifying}
                  error={!!error}
                  onComplete={(v) => handleVerifyCode(v)}
                />
              )}

              {verified && (
                <Button
                  variant="primary"
                  size="medium"
                  fullWidth
                  onClick={handleBackToLogin}
                >
                  Ir para o login
                </Button>
              )}

              <Button
                variant="secondary"
                size="medium"
                fullWidth
                onClick={handleResendEmail}
                disabled={isLoading || isVerifying}
                loading={isLoading}
              >
                Reenviar código
              </Button>

              <div className={styles.inlineLink}>
                <button
                  type="button"
                  className={styles.footerLink}
                  onClick={handleBackToLogin}
                >
                  Voltar ao login
                </button>
              </div>
            </div>

          <div className={styles.footer}>
            <span>Não recebeu o email? Verifique sua pasta de spam.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyPending;
