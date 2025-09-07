import React, { useEffect, useState } from 'react';
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
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const waitForGoogleScript = (): Promise<void> => {
    return new Promise((resolve) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }

      const checkGoogle = () => {
        if (window.google?.accounts?.id) {
          resolve();
        } else {
          setTimeout(checkGoogle, 100);
        }
      };

      checkGoogle();
    });
  };

  const initializeGoogleSignIn = async () => {
    try {
      await waitForGoogleScript();
      setIsGoogleLoaded(true);

      if (!clientId) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      const buttonElement = document.getElementById('google-signin-button');
      if (buttonElement) {
        window.google.accounts.id.renderButton(buttonElement, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 350,
        });
        setIsInitialized(true);
      }
    } catch (error) {
      console.error('Failed to initialize Google Sign-In:', error);
      onError?.('Failed to load Google Sign-In');
    }
  };

  useEffect(() => {
    initializeGoogleSignIn();
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
      {!isGoogleLoaded ? (
        <div className="flex items-center justify-center py-3 px-4 border border-gray-300 rounded-md">
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-gray-600">Loading Google Sign-In...</span>
        </div>
      ) : !isInitialized ? (
        <div className="flex items-center justify-center py-3 px-4 border border-gray-300 rounded-md">
          <span className="text-gray-600">Initializing...</span>
        </div>
      ) : (
        <div id="google-signin-button"></div>
      )}
    </div>
  );
};



