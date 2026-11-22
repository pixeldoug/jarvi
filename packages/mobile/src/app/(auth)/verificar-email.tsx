import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-provider';
import { AuthBackdrop, CODE_KEYBOARD_OFFSET } from '@/features/auth/auth-backdrop';
import { spacing } from '@/theme/tokens';
import { OtpInput } from '@/ui/otp-input';
import { Text } from '@/ui/text';
import { TextLink } from '@/ui/text-link';

const RESEND_SECONDS = 30;

/** Shown when an e-mail login is still pending verification. */
export default function VerifyEmailScreen() {
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const { acceptSession } = useAuth();
  const { t } = useTranslation('auth');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

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
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(errorMessage(err, t('code.resendFailed')));
    }
  };

  return (
    <AuthBackdrop onBack={() => router.back()} keyboardOffset={CODE_KEYBOARD_OFFSET}>
      <View style={styles.header}>
        <Text variant="heading-lg">{t('verifyEmail.title')}</Text>
        <Text variant="body-md" color="contentSecondary">
          {t('verifyEmail.description', { email })}
        </Text>
      </View>

      <View style={styles.code}>
        <OtpInput value={code} onChange={setCode} onComplete={(value) => void verify(value)} error={!!error} disabled={busy} />
        {error ? (
          <Text variant="body-sm" color="contentNegative" align="center" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : busy ? (
          <Text variant="label-md" color="contentInfo" align="center" accessibilityLiveRegion="polite">
            {t('code.checking')}
          </Text>
        ) : notice ? (
          <Text variant="body-sm" color="contentSecondary" align="center">
            {notice}
          </Text>
        ) : null}
      </View>

      <TextLink
        label={cooldown > 0 ? t('code.resendIn', { seconds: cooldown }) : t('code.resend')}
        color={cooldown > 0 ? 'contentTertiary' : 'contentInfo'}
        underline={cooldown <= 0}
        disabled={cooldown > 0 || busy}
        onPress={() => void resend()}
        style={styles.resend}
      />
    </AuthBackdrop>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  code: {
    gap: spacing.md,
  },
  resend: {
    alignSelf: 'center',
  },
});
