import type { ReactNode, Ref } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputInstance, type TextInputProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';

export interface PillFieldProps extends TextInputProps {
  /** Red outline; the message itself is shown by the screen. */
  error?: boolean;
  /** Shown at the right edge (clear button, "Mostrar"). */
  accessory?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  ref?: Ref<TextInputInstance>;
}

/** Borderless filled field used on the sign-in screens. */
export function PillField({ error = false, accessory, containerStyle, style, ref, ...props }: PillFieldProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: colors.surfaceSecondary, borderColor: error ? colors.contentNegative : 'transparent' },
        containerStyle,
      ]}
    >
      <TextInput
        ref={ref}
        placeholderTextColor={colors.contentTertiary}
        selectionColor={colors.controlBorderActive}
        {...props}
        style={[typography['body-lg'], styles.input, { color: colors.contentPrimary }, style]}
      />
      {accessory}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
  },
});
