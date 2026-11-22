import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-provider';
import { spacing } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { OtpInput } from '@/ui/otp-input';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

/** Shown when an e-mail login is still pending verification. */
export default function VerifyEmailScreen() {
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const { acceptSession } = useAuth();
  const { t } = useTranslation('auth');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async (value: string) => {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await acceptSession(await authApi.verifyEmailCode(email, value));
    } catch (err) {
      setError(errorMessage(err, t('code.invalid')));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await authApi.resendVerification(email);
      setNotice(t('verifyEmail.resent'));
    } catch (err) {
      setError(errorMessage(err, t('code.resendFailed')));
    }
  };

  return (
    <Screen scroll edges={['bottom']}>
      <View style={styles.header}>
        <Text variant="heading-lg">{t('verifyEmail.title')}</Text>
        <Text variant="body-md" color="contentSecondary">
          {t('verifyEmail.description', { email })}
        </Text>
      </View>
      <OtpInput value={code} onChange={setCode} onComplete={(value) => void verify(value)} error={!!error} disabled={busy} />
      {error ? (
        <Text variant="body-sm" color="contentNegative" align="center" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : notice ? (
        <Text variant="body-sm" color="contentSecondary" align="center">
          {notice}
        </Text>
      ) : null}
      <Button label={t('code.resend')} variant="secondary" onPress={() => void resend()} disabled={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
});
