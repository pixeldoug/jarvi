import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/client';
import { usersApi } from '@/api/endpoints';
import { useAuth, useCurrentUser } from '@/auth/auth-provider';
import { useConfirmSignOut } from '@/auth/use-confirm-sign-out';
import { displayName } from '@/features/onboarding/display-name';
import { useSubscription } from '@/features/subscription/use-subscription';
import { i18n, useLocale, type Locale } from '@/i18n';
import { WEB_APP_URL } from '@/lib/links';
import { formatE164 } from '@/lib/phone';
import { useTheme, type AppearancePreference } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { LanguagePicker } from '@/ui/language-picker';
import { ListGroup, ListRow } from '@/ui/list-group';
import { Text } from '@/ui/text';
import type { SubscriptionInfo } from '@/types/models';

const APPEARANCE_ORDER: AppearancePreference[] = ['system', 'light', 'dark'];

/** Takes the locale so the React Compiler re-runs it after a language switch. */
function planLabel(info: SubscriptionInfo | undefined, daysLeft: number | null, locale: Locale): string {
  const t = i18n.getFixedT(locale, 'subscription');
  if (!info) return t('plan.loading');
  if (info.isActive && info.status === 'active') {
    return info.planType === 'annual'
      ? t('plan.annual')
      : info.planType === 'lifetime'
        ? t('plan.lifetime')
        : t('plan.monthly');
  }
  if (info.status === 'trialing' && daysLeft !== null) {
    return t('plan.trialDays', { count: daysLeft });
  }
  if (info.status === 'past_due') return t('plan.pastDue');
  return t('plan.none');
}

export default function SettingsScreen() {
  const { t } = useTranslation(['settings', 'common']);
  const locale = useLocale();
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const subscription = useSubscription();
  const [deleting, setDeleting] = useState(false);
  const contact = user.whatsappPhone ? formatE164(user.whatsappPhone) : user.email;

  const confirmSignOut = useConfirmSignOut();

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await usersApi.deleteAccount();
      await signOut();
    } catch (error) {
      Alert.alert(t('deleteAccount.error'), errorMessage(error));
      setDeleting(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      t('deleteAccount.confirmTitle'),
      t('deleteAccount.confirmMessage'),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        { text: t('deleteAccount.confirm'), style: 'destructive', onPress: () => void deleteAccount() },
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
          <Text variant="heading-lg">{displayName(user, { locale })}</Text>
          {contact ? (
            <Text variant="body-md" color="contentSecondary">
              {contact}
            </Text>
          ) : null}
        </View>

        <ListGroup title={t('sections.account')}>
          <ListRow label={t('rows.profile')} onPress={() => router.push('/ajustes/perfil')} />
          <ListRow label={t('rows.notifications')} onPress={() => router.push('/ajustes/notificacoes')} />
          <ListRow label={t('rows.memory')} onPress={() => router.push('/ajustes/memoria')} />
          <ListRow label={t('rows.plan')} value={planLabel(subscription.data, subscription.daysLeft, locale)} last />
        </ListGroup>

        <ListGroup title={t('sections.organization')}>
          <ListRow label={t('rows.categories')} onPress={() => router.push('/ajustes/categorias')} last />
        </ListGroup>

        <ListGroup title={t('sections.app')}>
          <LanguagePicker />
          <ListRow label={t('rows.appearance')} value={t(`appearance.${preference}`)} onPress={cycleAppearance} />
          <ListRow
            label={t('rows.openWeb')}
            onPress={() => void WebBrowser.openBrowserAsync(WEB_APP_URL)}
            last
          />
        </ListGroup>

        <ListGroup>
          <ListRow label={t('common:actions.signOut')} onPress={confirmSignOut} destructive />
          <ListRow label={deleting ? t('rows.deletingAccount') : t('rows.deleteAccount')} onPress={confirmDelete} destructive disabled={deleting} last />
        </ListGroup>

        <Text variant="body-sm" color="contentTertiary" align="center">
          {t('common:app.version', { version: Constants.expoConfig?.version ?? '' })}
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
