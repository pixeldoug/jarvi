import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { CheckIcon } from './icons';

interface TaskCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
}

export function TaskCheckbox({ checked, onToggle, label }: TaskCheckboxProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={checked ? `Reabrir ${label}` : `Concluir ${label}`}
      hitSlop={10}
      onPress={() => {
        if (!checked) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onToggle();
      }}
      style={[
        styles.box,
        checked
          ? { backgroundColor: colors.contentInfo, borderColor: colors.contentInfo }
          : { borderColor: colors.contentTertiary },
      ]}
    >
      {checked ? <CheckIcon size={14} color={colors.contentOnAccent} weight="bold" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
