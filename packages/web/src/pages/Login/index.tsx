import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button, Input, PasswordInput, Divider, Logo } from '../../components/ui';
import { GoogleLogin } from '../../components/features/auth';
import { useForceTheme } from '../../hooks/useForceTheme';
import styles from './Login.module.css';

export const Login: React.FC = () => {
  useForceTheme('light');

  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validate password strength for registration
    if (!isLogin && passwordStrength < 2) {
      setError('Por favor, escolha uma senha mais forte');
      return;
    }
    
    setIsLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
        navigate('/');
      } else {
        const result = await register(email, name, password);
        if (result.pendingVerification) {
          // Redirect to verify pending page
          navigate('/verify-pending', { state: { email: result.email } });
        } else {
          navigate('/');
        }
      }
    } catch (error: unknown) {
      // Check if it's a pending verification error from login
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

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setName('');
    setEmail('');
    setPassword('');
    setPasswordStrength(0);
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginWrapper}>
        <Logo className={styles.logo} />
        
        <div className={styles.loginContent}>
          <h1 className={styles.title}>{isLogin ? 'Login' : 'Criar conta'}</h1>
          
          <div className={styles.formContainer}>
            {isLogin && (
              <>
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
              </>
            )}
            
            <form className={styles.form} onSubmit={handleSubmit}>
              {!isLogin && (
                <Input
                  id="name"
                  name="name"
                  type="text"
                  label="Nome"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Como você gostaria de ser chamado?"
                />
              )}

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
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                showStrengthMeter={!isLogin}
                minStrength={2}
                onStrengthChange={setPasswordStrength}
                userInputs={[email, name]}
                helperText={!isLogin ? 'Mínimo de 8 caracteres' : undefined}
              />

              {isLogin && (
                <div style={{ textAlign: 'right', marginTop: '-8px' }}>
                  <button 
                    type="button"
                    className={styles.footerLink}
                    onClick={() => navigate('/forgot-password')}
                  >
                    Esqueceu a senha?
                  </button>
                </div>
              )}

              {error && (
                <div className={styles.error}>
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="medium"
                fullWidth
                disabled={isLoading}
                loading={isLoading}
              >
                {isLogin ? 'Entrar' : 'Criar conta'}
              </Button>
            </form>
            
            <div className={styles.footer}>
              <span>{isLogin ? 'Não tem uma conta?' : 'Já tem uma conta?'} </span>
              <button 
                type="button"
                className={styles.footerLink}
                onClick={toggleMode}
              >
                {isLogin ? 'Criar conta' : 'Entrar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
