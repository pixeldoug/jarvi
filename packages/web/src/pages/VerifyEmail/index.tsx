import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Logo } from '../../components/ui';
import styles from './VerifyEmail.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type VerificationStatus = 'loading' | 'success' | 'error';

export const VerifyEmail: React.FC = () => {
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [message, setMessage] = useState('');
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Token de verificação não encontrado.');
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/auth/verify-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Erro ao verificar email');
        }

        setStatus('success');
        setMessage(data.message || 'Email verificado com sucesso!');
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Erro ao verificar email');
      }
    };

    verifyEmail();
  }, [token]);

  const handleGoToLogin = () => {
    navigate('/login');
  };

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <Logo className={styles.logo} />
        
        <div className={styles.content}>
          {status === 'loading' && (
            <>
              <div className={`${styles.icon} ${styles.iconLoading}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </div>
              <h1 className={styles.title}>Verificando...</h1>
              <p className={styles.description}>
                Aguarde enquanto verificamos seu email.
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className={`${styles.icon} ${styles.iconSuccess}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className={styles.title}>Email verificado!</h1>
              <p className={styles.description}>{message}</p>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="medium"
                  fullWidth
                  onClick={handleGoToLogin}
                >
                  Ir para o login
                </Button>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className={`${styles.icon} ${styles.iconError}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h1 className={styles.title}>Erro na verificação</h1>
              <p className={styles.description}>{message}</p>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="medium"
                  fullWidth
                  onClick={handleGoToLogin}
                >
                  Voltar ao login
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
