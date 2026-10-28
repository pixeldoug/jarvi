import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
      setError(errorMessage(err, 'Código inválido. Confira e tente de novo.'));
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
      setError(errorMessage(err, 'Não foi possível reenviar o código.'));
    }
  };

  return (
    <Screen scroll edges={['bottom']}>
      <View style={styles.header}>
        <Text variant="heading-lg">Confirme seu WhatsApp</Text>
        <Text variant="body-md" color="contentSecondary">
          Enviamos um código de 6 dígitos para {formatE164(phone)}.
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
          Código de teste: {testCode}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Reenviar código'}
          variant="secondary"
          disabled={cooldown > 0 || busy}
          onPress={() => void resend()}
        />
        <Button label="Editar número" variant="ghost" onPress={() => router.back()} disabled={busy} />
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
