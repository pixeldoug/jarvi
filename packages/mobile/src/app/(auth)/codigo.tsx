import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/client';
import { onboardingApi } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-provider';
import { formatE164 } from '@/lib/phone';
import { spacing } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { OtpInput } from '@/ui/otp-input';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

const RESEND_SECONDS = 30;

export default function WhatsAppCodeScreen() {
  const { phone = '', devCode } = useLocalSearchParams<{ phone: string; devCode?: string }>();
  const { acceptSession } = useAuth();
  const { t } = useTranslation('auth');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testCode, setTestCode] = useState(devCode || null);
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
      const session = await onboardingApi.verifyWhatsAppCode(phone, value, 'login');
      await acceptSession({ ...session, user: { ...session.user, whatsappVerified: true } });
      if (session.isNewUser) {
        // Sign-in and sign-up share this screen, so the funnel step is only
        // recorded for new accounts (the web wizard passes context instead).
        void onboardingApi.recordStep('whatsapp').catch(() => undefined);
      }
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
      const { devCode: next } = await onboardingApi.requestWhatsAppCode(phone);
      setTestCode(next || null);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(errorMessage(err, t('code.resendFailed')));
    }
  };

  return (
    <Screen scroll edges={['bottom']}>
      <View style={styles.header}>
        <Text variant="heading-lg">{t('whatsapp.confirmTitle')}</Text>
        <Text variant="body-md" color="contentSecondary">
          {t('whatsapp.codeSent', { phone: formatE164(phone) })}
        </Text>
      </View>

      <OtpInput value={code} onChange={setCode} onComplete={(value) => void verify(value)} error={!!error} disabled={busy} />

      {error ? (
        <Text variant="body-sm" color="contentNegative" align="center" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {testCode ? (
        <Text variant="body-sm" color="contentTertiary" align="center">
          {t('whatsapp.testCode', { code: testCode })}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={cooldown > 0 ? t('code.resendIn', { seconds: cooldown }) : t('code.resend')}
          variant="secondary"
          disabled={cooldown > 0 || busy}
          onPress={() => void resend()}
        />
        <Button label={t('whatsapp.editNumber')} variant="ghost" onPress={() => router.back()} disabled={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
});
