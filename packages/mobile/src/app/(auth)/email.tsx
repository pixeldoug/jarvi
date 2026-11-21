import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError, errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-provider';
import { GoogleButton } from '@/auth/google-button';
import { useLocale } from '@/i18n';
import { WEB_APP_URL } from '@/lib/links';
import { spacing } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

export default function EmailSignInScreen() {
  const { acceptSession } = useAuth();
  const { t } = useTranslation('auth');
  const locale = useLocale();
  const passwordRef = useRef<TextInputInstance>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) {
      setError(t('email.errors.missingFields'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptSession(await authApi.login(normalized, password));
    } catch (err) {
      if (err instanceof ApiError && err.data.pendingVerification) {
        router.push({ pathname: '/verificar-email', params: { email: normalized } });
        return;
      }
      setError(errorMessage(err, t('email.errors.wrongCredentials')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={
        <>
          <Button label={t('email.submit')} onPress={() => void signIn()} loading={busy} />
          <GoogleButton />
        </>
      }
    >
      <View style={styles.header}>
        <Text variant="heading-lg">{t('email.title')}</Text>
        <Text variant="body-md" color="contentSecondary">
          {t('email.subtitle')}
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          label={t('email.emailLabel')}
          value={email}
          onChangeText={setEmail}
          placeholder={t('email.emailPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label={t('email.passwordLabel')}
          value={password}
          onChangeText={setPassword}
          placeholder={t('email.passwordPlaceholder')}
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void signIn()}
          error={error}
        />
        <Button
          label={t('email.forgotPassword')}
          variant="ghost"
          size="sm"
          style={styles.forgot}
          // `?lang=` opens the web page in the app's language (web ignores it when unknown).
          onPress={() => void WebBrowser.openBrowserAsync(`${WEB_APP_URL}/forgot-password?lang=${locale}`)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  form: {
    gap: spacing.lg,
  },
  forgot: {
    alignSelf: 'flex-start',
    paddingHorizontal: 0,
  },
});
