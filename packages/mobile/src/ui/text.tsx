import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { typography, type ThemeColors, type TypographyVariant } from '@/theme/tokens';

type ContentColor = Extract<keyof ThemeColors, `content${string}`>;

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: ContentColor;
  align?: 'left' | 'center' | 'right';
}

export function Text({ variant = 'body-md', color = 'contentPrimary', align, style, ...props }: TextProps) {
  const { colors } = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...props}
      style={[typography[variant], { color: colors[color] }, align && { textAlign: align }, style]}
    />
  );
}
