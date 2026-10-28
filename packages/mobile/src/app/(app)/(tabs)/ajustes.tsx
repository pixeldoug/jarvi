import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/client';
import { usersApi } from '@/api/endpoints';
import { useAuth, useCurrentUser } from '@/auth/auth-provider';
import { useSubscription } from '@/features/subscription/use-subscription';
import { WEB_APP_URL } from '@/lib/links';
import { formatE164 } from '@/lib/phone';
import { useTheme, type AppearancePreference } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { ListGroup, ListRow } from '@/ui/list-group';
import { Text } from '@/ui/text';
import type { SubscriptionInfo } from '@/types/models';

const APPEARANCE_LABELS: Record<AppearancePreference, string> = {
  system: 'Automático',
  light: 'Claro',
  dark: 'Escuro',
};
const APPEARANCE_ORDER: AppearancePreference[] = ['system', 'light', 'dark'];

function planLabel(info: SubscriptionInfo | undefined, daysLeft: number | null): string {
  if (!info) return '…';
  if (info.isActive && info.status === 'active') {
    return info.planType === 'annual' ? 'Anual' : info.planType === 'lifetime' ? 'Vitalício' : 'Mensal';
  }
  if (info.status === 'trialing' && daysLeft !== null) {
    return daysLeft === 1 ? 'Teste: 1 dia' : `Teste: ${daysLeft} dias`;
  }
  if (info.status === 'past_due') return 'Pagamento pendente';
  return 'Sem plano';
}

export default function SettingsScreen() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const subscription = useSubscription();
  const [deleting, setDeleting] = useState(false);
  const contact = user.whatsappPhone ? formatE164(user.whatsappPhone) : user.email;

  const confirmSignOut = () =>
    Alert.alert('Sair da Jarvi?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void signOut() },
    ]);

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await usersApi.deleteAccount();
      await signOut();
    } catch (error) {
      Alert.alert('Não foi possível excluir a conta', errorMessage(error));
      setDeleting(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      'Excluir conta?',
      'Suas tarefas, categorias e lembretes serão apagados para sempre. Essa ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir conta', style: 'destructive', onPress: () => void deleteAccount() },
      ],
    );

  const cycleAppearance = () => {
    const index = APPEARANCE_ORDER.indexOf(preference);
    setPreference(APPEARANCE_ORDER[(index + 1) % APPEARANCE_ORDER.length]!);
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.surfaceGrouped }]}>
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.profile}>
          <Text variant="heading-lg">{user.preferred_name || user.name}</Text>
          {contact ? (
            <Text variant="body-md" color="contentSecondary">
              {contact}
            </Text>
          ) : null}
        </View>

        <ListGroup title="Conta">
          <ListRow label="Perfil" onPress={() => router.push('/ajustes/perfil')} />
          <ListRow label="Notificações" onPress={() => router.push('/ajustes/notificacoes')} />
          <ListRow label="Memória da Jarvi" onPress={() => router.push('/ajustes/memoria')} />
          <ListRow label="Plano" value={planLabel(subscription.data, subscription.daysLeft)} last />
        </ListGroup>

        <ListGroup title="Organização">
          <ListRow label="Categorias" onPress={() => router.push('/ajustes/categorias')} last />
        </ListGroup>

        <ListGroup title="App">
          <ListRow label="Aparência" value={APPEARANCE_LABELS[preference]} onPress={cycleAppearance} />
          <ListRow
            label="Abrir a Jarvi na web"
            onPress={() => void WebBrowser.openBrowserAsync(WEB_APP_URL)}
            last
          />
        </ListGroup>

        <ListGroup>
          <ListRow label="Sair" onPress={confirmSignOut} destructive />
          <ListRow label={deleting ? 'Excluindo conta…' : 'Excluir conta'} onPress={confirmDelete} destructive disabled={deleting} last />
        </ListGroup>

        <Text variant="body-sm" color="contentTertiary" align="center">
          {`Jarvi ${Constants.expoConfig?.version ?? ''}`}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.xl,
    paddingBottom: spacing.xxl * 2,
  },
  profile: {
    gap: spacing.xs,
  },
});
