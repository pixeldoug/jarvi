import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Logo } from '../../components/ui';
import styles from './VerifyPending.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const VerifyPending: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || '';

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

      setMessage('Email de verificação reenviado com sucesso!');
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
          <div className={styles.icon}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          
          <h1 className={styles.title}>Verifique seu email</h1>
          
          <p className={styles.description}>
            Enviamos um link de verificação para{' '}
            {email ? (
              <span className={styles.email}>{email}</span>
            ) : (
              'seu email'
            )}
            . Clique no link para ativar sua conta.
          </p>

          {message && <div className={styles.success}>{message}</div>}
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <Button
              variant="primary"
              size="medium"
              fullWidth
              onClick={handleResendEmail}
              disabled={isLoading}
              loading={isLoading}
            >
              Reenviar email
            </Button>
            
            <Button
              variant="secondary"
              size="medium"
              fullWidth
              onClick={handleBackToLogin}
            >
              Voltar ao login
            </Button>
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
