/**
 * Google Login Component - Jarvi Web
 * 
 * Custom Google Sign-In button following JarviDS Web design system
 * using Google Identity Services with full account chooser
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import googleLogo from '../../../assets/google-logo.svg';
import styles from './GoogleLogin.module.css';

declare global {
  interface Window {
    google: any;
  }
}

interface GoogleLoginProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  buttonText?: string;
  onClick?: () => void | Promise<void>;
  /** When provided, the raw Google credential is passed here instead of calling loginWithGoogle */
  onCredential?: (idToken: string) => void | Promise<void>;
}

export const GoogleLogin: React.FC<GoogleLoginProps> = ({ 
  onSuccess, 
  onError,
  buttonText = 'Entrar com Google',
  onClick,
  onCredential,
}) => {
  const { loginWithGoogle } = useAuth();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  // Keep refs always pointing to the latest prop values so the Google
  // callback (registered once) never holds stale closures.
  const onCredentialRef = useRef(onCredential);
  const loginWithGoogleRef = useRef(loginWithGoogle);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => { onCredentialRef.current = onCredential; }, [onCredential]);
  useEffect(() => { loginWithGoogleRef.current = loginWithGoogle; }, [loginWithGoogle]);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Stable callback registered with Google — reads from refs at call time.
  const handleCredentialResponse = useCallback(async (response: any) => {
    try {
      setIsLoading(true);
      if (response.credential) {
        if (onCredentialRef.current) {
          await onCredentialRef.current(response.credential);
        } else {
          await loginWithGoogleRef.current(response.credential);
        }
        onSuccessRef.current?.();
      } else {
        throw new Error('No credential received from Google');
      }
    } catch (error) {
      console.error('Google login error:', error);
      onErrorRef.current?.(error instanceof Error ? error.message : 'Google login failed');
    } finally {
      setIsLoading(false);
    }
  }, []); // empty deps — intentional, reads from refs

  useEffect(() => {
    if (!clientId) {
      console.error('❌ Client ID não encontrado!');
      return;
    }

    let attempts = 0;
    const maxAttempts = 50; // 5 segundos máximo

    const initializeGoogle = () => {
      attempts++;

      // Verifica se Google APIs estão disponíveis
      if (window.google?.accounts?.id) {
        try {
          // Inicializa o Google Sign-In
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          });
          
          // Renderiza um botão invisível do Google que sempre abre o account chooser
          if (buttonRef.current) {
            window.google.accounts.id.renderButton(
              buttonRef.current,
              {
                type: 'standard',
                theme: 'outline',
                size: 'large',
                text: 'continue_with',
                width: 250,
              }
            );
          }
          
          setIsReady(true);
        } catch (error) {
          console.error('Google Sign-In initialization failed:', error);
          setHasError(true);
        }
      } else if (attempts < maxAttempts) {
        // Tenta novamente em 100ms
        setTimeout(initializeGoogle, 100);
      } else {
        // Deu timeout - mostra erro
        console.error('Google Sign-In script failed to load after timeout');
        setHasError(true);
      }
    };

    // Inicia a verificação
    initializeGoogle();
  }, [clientId, handleCredentialResponse]);

  const handleClick = async () => {
    // If custom onClick is provided, use it instead of default Google login flow
    if (onClick) {
      try {
        setIsLoading(true);
        await onClick();
      } catch (error) {
        console.error('Custom onClick error:', error);
        onError?.(error instanceof Error ? error.message : 'Action failed');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Default Google login flow
    if (isReady && buttonRef.current && !isLoading) {
      // Clica no botão invisível do Google que abre o account chooser
      const googleButton = buttonRef.current.querySelector('div[role="button"]') as HTMLElement;
      if (googleButton) {
        googleButton.click();
      }
    }
  };

  if (!clientId) {
    return (
      <div className={styles.error}>
        ⚠️ Google Client ID não configurado. Verifique o arquivo .env
      </div>
    );
  }

  if (hasError) {
    return (
      <div className={styles.error}>
        Failed to load Google Sign-In
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* Botão invisível do Google (renderizado pela API) - only if no custom onClick */}
      {!onClick && (
        <div 
          ref={buttonRef} 
          style={{ 
            position: 'absolute', 
            left: '-9999px',
            visibility: 'hidden'
          }} 
        />
      )}
      
      {/* Botão customizado visível */}
      <button
        type="button"
        className={styles.button}
        onClick={handleClick}
        disabled={(!isReady && !onClick) || isLoading}
      >
        {isLoading ? (
          <div className={styles.loading} />
        ) : (
          <img 
            src={googleLogo} 
            alt="Google logo" 
            className={styles.logo}
          />
        )}
        <div className={styles.text}>
          <p>{buttonText}</p>
        </div>
      </button>
    </div>
  );
};
