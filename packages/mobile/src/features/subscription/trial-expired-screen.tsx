import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { subscriptionApi } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-provider';
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
  const { signOut } = useAuth();
  const { data, refresh } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The backend allows one extension per account (web TrialExpiredGate).
  const canExtend = !data?.trialExtended;

  const extend = async () => {
    setBusy(true);
    setError(null);
    try {
      await subscriptionApi.extendTrial();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível estender o teste.'));
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <>
          {canExtend ? <Button label="Ganhar mais alguns dias" onPress={() => void extend()} loading={busy} /> : null}
          <Button label="Já assinei, atualizar" variant="secondary" onPress={() => void refresh()} />
          <Button label="Sair" variant="ghost" onPress={() => void signOut()} />
        </>
      }
    >
      <Logo size={44} />
      <View style={styles.text}>
        <Text variant="heading-lg" align="center">
          {data?.trialExtended ? 'Seu período de teste acabou' : 'Seu teste grátis terminou'}
        </Text>
        <Text variant="body-md" color="contentSecondary" align="center">
          Suas tarefas continuam salvas. Assim que sua assinatura estiver ativa, tudo volta a funcionar aqui.
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
