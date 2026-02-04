import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Input, Logo } from '../../components/ui';
import styles from './ResetPassword.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Token não encontrado. Solicite um novo link.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao redefinir senha');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao redefinir senha');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToLogin = () => {
    navigate('/login');
  };

  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.wrapper}>
          <Logo className={styles.logo} />
          
          <div className={styles.content}>
            <div className={`${styles.icon} ${styles.iconSuccess}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            
            <h1 className={`${styles.title} ${styles.titleCenter}`}>Senha redefinida!</h1>
            
            <p className={`${styles.description} ${styles.descriptionCenter}`}>
              Sua senha foi alterada com sucesso. Você já pode fazer login com sua nova senha.
            </p>

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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <Logo className={styles.logo} />
        
        <div className={styles.content}>
          <h1 className={styles.title}>Nova senha</h1>
          
          <p className={styles.description}>
            Digite sua nova senha abaixo.
          </p>

          {error && <div className={styles.error}>{error}</div>}

          <form className={styles.form} onSubmit={handleSubmit}>
            <Input
              id="password"
              name="password"
              type="password"
              label="Nova senha"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua nova senha"
            />

            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              label="Confirmar senha"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirme sua nova senha"
            />

            <Button
              type="submit"
              variant="primary"
              size="medium"
              fullWidth
              disabled={isLoading}
              loading={isLoading}
            >
              Redefinir senha
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
