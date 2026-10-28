import { router, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

/**
 * Asks before throwing away unsaved edits, however the screen is closed:
 * the Cancelar button, swiping the modal down or the Android back button.
 * Returns `leave`, which closes the screen without asking (after a save or
 * a delete).
 */
export function useConfirmDiscard(dirty: boolean): () => void {
  const [allowLeave, setAllowLeave] = useState(false);

  const disablePrevention = usePreventRemove(dirty && !allowLeave, ({ repeat }) => {
    Alert.alert('Descartar alterações?', undefined, [
      { text: 'Continuar editando', style: 'cancel' },
      {
        text: 'Descartar',
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
