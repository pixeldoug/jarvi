import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

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
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('🔧 GoogleLogin useEffect triggered');
    console.log('🔑 Client ID:', clientId ? 'Present' : 'Missing');
    
    if (!clientId) {
      console.error('❌ No Google Client ID found');
      return;
    }

    let attempts = 0;
    const maxAttempts = 50; // 5 segundos máximo

    const initializeGoogle = () => {
      attempts++;
      console.log(`🔄 Attempt ${attempts}/${maxAttempts} to initialize Google`);

      // Verifica se Google APIs estão disponíveis
      if (window.google?.accounts?.id) {
        console.log('✅ Google APIs found, initializing...');
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
            console.log('🔍 Looking for button element:', buttonElement ? 'Found' : 'Not found');
            
            if (buttonElement) {
              console.log('🎯 Rendering Google button...');
              window.google.accounts.id.renderButton(buttonElement, {
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'rectangular',
                logo_alignment: 'left',
                width: 350,
              });
              setIsReady(true);
              console.log('🎉 Google Sign-In button ready!');
            } else {
              console.error('❌ Button element not found in DOM');
              // Tenta novamente em mais 200ms
              setTimeout(() => {
                const retryElement = buttonRef.current;
                if (retryElement) {
                  console.log('🎯 Retry: Rendering Google button...');
                  window.google.accounts.id.renderButton(retryElement, {
                    theme: 'outline',
                    size: 'large',
                    text: 'signin_with',
                    shape: 'rectangular',
                    logo_alignment: 'left',
                    width: 350,
                  });
                  setIsReady(true);
                  console.log('🎉 Google Sign-In button ready on retry!');
                } else {
                  console.error('❌ Button element still not found after retry');
                  setHasError(true);
                }
              }, 200);
            }
          }, 150);
        } catch (error) {
          console.error('❌ Google Sign-In initialization failed:', error);
          setHasError(true);
        }
      } else if (attempts < maxAttempts) {
        console.log(`⏳ Google APIs not ready, retrying in 100ms...`);
        // Tenta novamente em 100ms
        setTimeout(initializeGoogle, 100);
      } else {
        // Deu timeout - mostra erro
        console.error('❌ Google Sign-In script failed to load after 5 seconds');
        setHasError(true);
      }
    };

    // Inicia a verificação
    initializeGoogle();
  }, [clientId]);

  const handleCredentialResponse = async (response: any) => {
    try {
      if (response.credential) {
        await loginWithGoogle(response.credential);
        onSuccess?.();
      } else {
        throw new Error('No credential received from Google');
      }
    } catch (error) {
      console.error('Google login error:', error);
      onError?.(error instanceof Error ? error.message : 'Google login failed');
    }
  };

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
        <div className="relative">
          {/* Loading overlay - sempre renderizado quando não está pronto */}
          {!isReady && (
            <div className="flex items-center justify-center py-3 px-4 border border-gray-300 rounded-md w-full max-w-sm">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-gray-700">Loading Sign in with Google...</span>
            </div>
          )}
          
          {/* Button container - sempre renderizado para o useRef funcionar */}
          <div 
            ref={buttonRef} 
            className={!isReady ? "opacity-0 absolute" : "opacity-100"}
          ></div>
        </div>
      )}
    </div>
  );
};



