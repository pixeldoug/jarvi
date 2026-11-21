import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { subscriptionApi } from '@/api/endpoints';
import { useConfirmSignOut } from '@/auth/use-confirm-sign-out';
import { spacing } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { Logo } from '@/ui/logo';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { useSubscription } from './use-subscription';

/**
 * Shown instead of the app when the trial is over and there is no plan.
 * No purchase flow yet: how to sell inside the app (in-app purchase vs other
 * options) is decided before the public store release.
 */
export function TrialExpiredScreen() {
  const { t } = useTranslation(['subscription', 'common']);
  const confirmSignOut = useConfirmSignOut();
  const { data, refresh } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The backend allows one extension per account (web TrialExpiredGate).
  const canExtend = !data?.trialExtended;

  const extend = async () => {
    setBusy(true);
    setError(null);
    try {
      await subscriptionApi.extendTrial();
    } catch (err) {
      setError(errorMessage(err, t('trialExpired.extendError')));
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  // On success the gate lifts and this screen goes away; otherwise say so.
  const checkAgain = async () => {
    setChecking(true);
    setError(null);
    try {
      const info = await refresh();
      if (!info?.isActive) setError(t('trialExpired.notActiveYet'));
    } catch (err) {
      setError(errorMessage(err, t('trialExpired.checkError')));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <>
          {canExtend ? <Button label={t('trialExpired.extend')} onPress={() => void extend()} loading={busy} /> : null}
          <Button label={t('trialExpired.checkAgain')} variant="secondary" loading={checking} onPress={() => void checkAgain()} />
          <Button label={t('common:actions.signOut')} variant="ghost" onPress={confirmSignOut} />
        </>
      }
    >
      <Logo size={44} />
      <View style={styles.text}>
        <Text variant="heading-lg" align="center">
          {data?.trialExtended ? t('trialExpired.titleExtended') : t('trialExpired.title')}
        </Text>
        <Text variant="body-md" color="contentSecondary" align="center">
          {t('trialExpired.body')}
        </Text>
        {error ? (
          <Text variant="body-sm" color="contentNegative" align="center">
            {error}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    padding: spacing.xl,
  },
  text: {
    gap: spacing.sm,
  },
});
