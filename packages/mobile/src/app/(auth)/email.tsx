import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError, errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-provider';
import { AuthBackdrop } from '@/features/auth/auth-backdrop';
import { useLocale } from '@/i18n';
import { WEB_APP_URL } from '@/lib/links';
import { useTheme } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { WarningIcon } from '@/ui/icons';
import { PillField } from '@/ui/pill-field';
import { Text } from '@/ui/text';
import { TextLink } from '@/ui/text-link';

export default function EmailSignInScreen() {
  const { acceptSession } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation('auth');
  const locale = useLocale();
  const passwordRef = useRef<TextInputInstance>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  const clearError = () => {
    if (error) setError(null);
  };

  return (
    <AuthBackdrop onBack={() => router.back()}>
      <View style={styles.header}>
        <Text variant="heading-lg">{t('email.title')}</Text>
        <Text variant="body-md" color="contentSecondary">
          {t('email.subtitle')}
        </Text>
      </View>

      <View style={styles.form}>
        <PillField
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            clearError();
          }}
          error={!!error}
          placeholder={t('email.emailPlaceholder')}
          accessibilityLabel={t('email.emailLabel')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <PillField
          ref={passwordRef}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            clearError();
          }}
          error={!!error}
          placeholder={t('email.passwordPlaceholder')}
          accessibilityLabel={t('email.passwordLabel')}
          secureTextEntry={!showPassword}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void signIn()}
          accessory={
            <TextLink
              label={showPassword ? t('email.hidePassword') : t('email.showPassword')}
              color="contentSecondary"
              underline={false}
              onPress={() => setShowPassword((shown) => !shown)}
            />
          }
        />
        {error ? (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <WarningIcon size={16} color={colors.contentNegative} />
            <Text variant="body-sm" color="contentNegative" style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}
        <Button label={t('email.submit')} onPress={() => void signIn()} loading={busy} style={styles.submit} />
      </View>

      <TextLink
        label={t('email.forgotPassword')}
        role="link"
        style={styles.forgot}
        // `?lang=` opens the web page in the app's language (web ignores it when unknown).
        onPress={() => void WebBrowser.openBrowserAsync(`${WEB_APP_URL}/forgot-password?lang=${locale}`)}
      />
    </AuthBackdrop>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  form: {
    gap: spacing.md,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  errorText: {
    flex: 1,
  },
  submit: {
    marginTop: spacing.xs,
  },
  forgot: {
    alignSelf: 'center',
  },
});
