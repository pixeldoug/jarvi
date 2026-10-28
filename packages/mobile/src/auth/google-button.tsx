import { useState } from 'react';
import { Alert } from 'react-native';

import { errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { useTheme } from '@/theme/theme-provider';
import { Button } from '@/ui/button';
import { GoogleLogoIcon } from '@/ui/icons';
import { useAuth } from './auth-provider';
import { getGoogleIdToken, isGoogleSignInAvailable } from './google';

/** "Continuar com Google". Hidden where the native module is missing (Expo Go). */
export function GoogleButton() {
  const { colors } = useTheme();
  const { acceptSession } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!isGoogleSignInAvailable) return null;

  const signIn = async () => {
    setBusy(true);
    try {
      const idToken = await getGoogleIdToken();
      if (!idToken) return;
      await acceptSession(await authApi.google(idToken));
    } catch (error) {
      Alert.alert('Não foi possível entrar com Google', errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      label="Continuar com Google"
      variant="secondary"
      icon={<GoogleLogoIcon size={18} color={colors.contentPrimary} weight="bold" />}
      loading={busy}
      onPress={() => void signIn()}
    />
  );
}
