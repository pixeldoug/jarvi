import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { Text } from './text';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once all digits are typed (also on SMS/WhatsApp autofill). */
  onComplete?: (code: string) => void;
  length?: number;
  error?: boolean;
  disabled?: boolean;
}

/** One hidden input behind N boxes, so paste and one-time-code autofill work. */
export function OtpInput({ value, onChange, onComplete, length = 6, error = false, disabled = false }: OtpInputProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInputInstance>(null);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessible={false}>
      <View style={styles.row}>
        {Array.from({ length }, (_, index) => {
          const digit = value[index] ?? '';
          const active = index === Math.min(value.length, length - 1);
          return (
            <View
              key={index}
              style={[
                styles.box,
                {
                  backgroundColor: colors.surfacePrimary,
                  borderColor: error
                    ? colors.contentNegative
                    : active
                      ? colors.controlBorderActive
                      : colors.borderPrimary,
                },
              ]}
            >
              <Text variant="heading-md">{digit}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        // Stays editable while verifying so a failed code keeps the keyboard up.
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        accessibilityLabel={`Código de ${length} dígitos`}
        onChangeText={(text) => {
          if (disabled) return;
          const digits = text.replace(/\D/g, '').slice(0, length);
          onChange(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
        style={[typography['body-md'], styles.hiddenInput]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  box: {
    width: 48,
    height: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0.01,
  },
});
