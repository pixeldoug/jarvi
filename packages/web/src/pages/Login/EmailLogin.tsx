import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button, Input, PasswordInput, Divider, Logo } from '../../components/ui';
import { GoogleLogin } from '../../components/features/auth';
import { useForceTheme } from '../../hooks/useForceTheme';
import styles from './Login.module.css';

export const EmailLogin: React.FC = () => {
  useForceTheme('light');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'pendingVerification' in error) {
        const loginError = error as { pendingVerification?: boolean; email?: string; message?: string };
        if (loginError.pendingVerification) {
          navigate('/verify-pending', { state: { email: loginError.email } });
          return;
        }
      }
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginWrapper}>
        <Logo className={styles.logo} />

        <div className={styles.loginContent}>
          <h1 className={styles.title}>Login</h1>

          <div className={styles.formContainer}>
            <GoogleLogin
              buttonText="Entrar com Google"
              onSuccess={() => navigate('/')}
              onError={(error) => setError(error)}
            />

            <div className={styles.dividerContainer}>
              <Divider />
              <span>Ou continue com</span>
              <Divider />
            </div>

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

              <PasswordInput
                id="password"
                name="password"
                label="Senha"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
              />

              <div className={styles.forgotPassword}>
                <button
                  type="button"
                  className={styles.footerLink}
                  onClick={() => navigate('/forgot-password')}
                >
                  Esqueceu a senha?
                </button>
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <Button
                type="submit"
                variant="primary"
                size="medium"
                fullWidth
                disabled={isLoading}
                loading={isLoading}
              >
                Entrar
              </Button>
            </form>

            <div className={styles.footerGroup}>
              <div className={styles.footer}>
                <span>Não tem uma conta?</span>
                <button
                  type="button"
                  className={styles.footerLink}
                  onClick={() => navigate('/criar-conta')}
                >
                  Criar conta
                </button>
              </div>
              <div className={styles.footer}>
                <button type="button" className={styles.footerLink} onClick={() => navigate('/login')}>
                  Fazer login com Whatsapp
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
