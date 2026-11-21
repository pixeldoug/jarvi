import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { useAuth } from './auth-provider';

/** Signing out always asks first (native Alert, destructive action), wherever it is offered. */
export function useConfirmSignOut(): () => void {
  const { t } = useTranslation(['settings', 'common']);
  const { signOut } = useAuth();
  return () =>
    Alert.alert(t('signOut.confirmTitle'), undefined, [
      { text: t('common:actions.cancel'), style: 'cancel' },
      { text: t('common:actions.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);
}
