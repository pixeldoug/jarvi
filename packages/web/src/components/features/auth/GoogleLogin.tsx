import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
// import { Button } from './ui';

declare global {
  interface Window {
    google: any;
  }
}

interface GoogleLoginProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export const GoogleLogin: React.FC<GoogleLoginProps> = ({ onSuccess, onError }) => {
  const { loginWithGoogle } = useAuth();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  // const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  // const [isLoading, setIsLoading] = useState(false);
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

          // Aguarda um pouco para garantir que está totalmente inicializado
          setTimeout(() => {
            const buttonElement = buttonRef.current;
            
            if (buttonElement) {
              window.google.accounts.id.renderButton(buttonElement, {
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'rectangular',
                logo_alignment: 'left',
                width: 350,
              });
              // setIsReady(true);
            } else {
              // Tenta novamente em mais 200ms
              setTimeout(() => {
                const retryElement = buttonRef.current;
                if (retryElement) {
                  window.google.accounts.id.renderButton(retryElement, {
                    theme: 'outline',
                    size: 'large',
                    text: 'signin_with',
                    shape: 'rectangular',
                    logo_alignment: 'left',
                    width: 350,
                  });
                  // setIsReady(true);
                } else {
                  setHasError(true);
                }
              }, 200);
            }
          }, 150);
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
      // setIsLoading(true);
      if (response.credential) {
        await loginWithGoogle(response.credential);
        onSuccess?.();
      } else {
        throw new Error('No credential received from Google');
      }
    } catch (error) {
      console.error('Google login error:', error);
      onError?.(error instanceof Error ? error.message : 'Google login failed');
    } finally {
      // setIsLoading(false);
    }
  };

  // const handleCustomGoogleLogin = () => {
  //   if (isReady && window.google?.accounts?.id) {
  //     window.google.accounts.id.prompt();
  //   }
  // };

  if (!clientId) {
    return (
      <div className="text-red-600 text-sm">
        ⚠️ Google Client ID não configurado. Verifique o arquivo .env
      </div>
    );
  }


  return (
    <div className="w-full flex justify-center">
      {hasError ? (
        <div className="flex items-center justify-center py-3 px-4 border border-red-300 bg-red-50 rounded-md">
          <span className="text-red-600">Failed to load Google Sign-In</span>
        </div>
      ) : (
        <div className="w-full max-w-sm">
          {/* Botão original do Google Sign-In */}
          <div 
            ref={buttonRef} 
            className="w-full"
          ></div>
        </div>
      )}
    </div>
  );
};



