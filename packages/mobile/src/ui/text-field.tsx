import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { Text } from './text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  ref?: Ref<TextInputInstance>;
}

export function TextField({ label, error, hint, style, onFocus, onBlur, ref, ...props }: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.contentNegative : focused ? colors.controlBorderActive : colors.borderPrimary;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text variant="label-sm" color="contentSecondary">
          {label}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.contentTertiary}
        selectionColor={colors.controlBorderActive}
        accessibilityLabel={label ?? props.placeholder}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          typography['body-md'],
          styles.input,
          props.multiline && styles.multiline,
          { color: colors.contentPrimary, borderColor, backgroundColor: colors.surfacePrimary },
          style,
        ]}
      />
      {error ? (
        <Text variant="body-sm" color="contentNegative" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="body-sm" color="contentTertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  multiline: {
    minHeight: 104,
    textAlignVertical: 'top',
  },
});
