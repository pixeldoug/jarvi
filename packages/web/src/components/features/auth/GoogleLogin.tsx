/**
 * Google Login Component - Jarvi Web
 * 
 * Custom Google Sign-In button following JarviDS Web design system
 * using Google Identity Services with full account chooser
 */

import { useEffect, useState, useRef } from 'react';
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
}

export const GoogleLogin: React.FC<GoogleLoginProps> = ({ 
  onSuccess, 
  onError,
  buttonText = 'Entrar com Google'
}) => {
  const { loginWithGoogle } = useAuth();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

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
  }, [clientId]);

  const handleCredentialResponse = async (response: any) => {
    try {
      setIsLoading(true);
      if (response.credential) {
        await loginWithGoogle(response.credential);
        onSuccess?.();
      } else {
        throw new Error('No credential received from Google');
      }
    } catch (error) {
      console.error('Google login error:', error);
      onError?.(error instanceof Error ? error.message : 'Google login failed');
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = () => {
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
      {/* Botão invisível do Google (renderizado pela API) */}
      <div 
        ref={buttonRef} 
        style={{ 
          position: 'absolute', 
          left: '-9999px',
          visibility: 'hidden'
        }} 
      />
      
      {/* Botão customizado visível */}
      <button
        type="button"
        className={styles.button}
        onClick={handleClick}
        disabled={!isReady || isLoading}
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
