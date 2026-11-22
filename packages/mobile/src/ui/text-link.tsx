import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import type { TextProps } from './text';
import { Text } from './text';

interface TextLinkProps {
  label: string;
  onPress: () => void;
  color?: TextProps['color'];
  /** Underlined unless it is only a status (e.g. a resend countdown). */
  underline?: boolean;
  disabled?: boolean;
  /** `link` when it leaves the app (opens the browser). */
  role?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
}

/** Inline text action ("Criar conta", "Esqueci minha senha"). */
export function TextLink({
  label,
  onPress,
  color = 'contentPrimary',
  underline = true,
  disabled = false,
  role = 'button',
  style,
}: TextLinkProps) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }, style]}
    >
      <Text variant="label-md" color={color} style={underline ? { textDecorationLine: 'underline' } : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}
