import { useNavigate, useLocation } from 'react-router-dom';
import { Logo } from '../../components/ui';
import { WhatsAppPhoneAuth } from '../../components/features/auth/WhatsAppPhoneAuth';
import { useForceTheme } from '../../hooks/useForceTheme';
import { readOAuthNext } from '../../lib/oauthNext';
import styles from './Login.module.css';

export const Login: React.FC = () => {
  useForceTheme('light');
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className={styles.container}>
      <div className={styles.loginWrapper}>
        <Logo className={styles.logo} />

        <div className={styles.loginContent}>
          <WhatsAppPhoneAuth
            source="login"
            onSuccess={(user) => {
              const next = readOAuthNext(location.search);
              if (next) {
                navigate(next, { replace: true });
                return;
              }
              navigate(user.onboardingCompletedAt ? '/' : '/criar-conta', { replace: true });
            }}
          >
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
                <button
                  type="button"
                  className={styles.footerLink}
                  onClick={() => {
                    const next = readOAuthNext(location.search);
                    navigate(next ? `/login/email?next=${encodeURIComponent(next)}` : '/login/email');
                  }}
                >
                  Fazer login com email
                </button>
              </div>
            </div>
          </WhatsAppPhoneAuth>
        </div>
      </div>
    </div>
  );
};
