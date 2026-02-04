import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Logo } from '../../components/ui';
import styles from './ForgotPassword.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar solicitação');
      }

      setMessage(data.message);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar solicitação');
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
          <h1 className={styles.title}>Esqueceu a senha?</h1>
          
          <p className={styles.description}>
            Digite seu email e enviaremos um link para você criar uma nova senha.
          </p>

          {message && <div className={styles.success}>{message}</div>}
          {error && <div className={styles.error}>{error}</div>}

          {!submitted ? (
            <form className={styles.form} onSubmit={handleSubmit}>
              <Input
                id="email"
                name="email"
                type="email"
                label="Email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu email"
              />

              <Button
                type="submit"
                variant="primary"
                size="medium"
                fullWidth
                disabled={isLoading}
                loading={isLoading}
              >
                Enviar link
              </Button>
            </form>
          ) : (
            <Button
              variant="primary"
              size="medium"
              fullWidth
              onClick={handleBackToLogin}
            >
              Voltar ao login
            </Button>
          )}

          <div className={styles.footer}>
            <button 
              type="button"
              className={styles.footerLink}
              onClick={handleBackToLogin}
            >
              Voltar ao login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
