import React, { useEffect } from 'react';
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

  useEffect(() => {
    if (!window.google || !clientId) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    window.google.accounts.id.renderButton(
      document.getElementById('google-signin-button'),
      {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 350,
      }
    );
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
      <div id="google-signin-button"></div>
    </div>
  );
};

