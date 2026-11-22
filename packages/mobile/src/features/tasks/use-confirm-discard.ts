import { router, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

/**
 * Asks before throwing away unsaved edits, however the screen is closed:
 * the cancel button, swiping the modal down or the Android back button.
 * Returns `leave`, which closes the screen without asking (after a save or
 * a delete).
 */
export function useConfirmDiscard(dirty: boolean): () => void {
  const { t } = useTranslation('tasks');
  const [allowLeave, setAllowLeave] = useState(false);

  const disablePrevention = usePreventRemove(dirty && !allowLeave, ({ repeat }) => {
    Alert.alert(t('discard.title'), undefined, [
      { text: t('discard.keepEditing'), style: 'cancel' },
      {
        text: t('discard.discard'),
        style: 'destructive',
        onPress: () => {
          setAllowLeave(true);
          repeat();
        },
      },
    ]);
  });

  return () => {
    setAllowLeave(true);
    disablePrevention();
    router.back();
  };
}
