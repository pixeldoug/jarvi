/**
 * Text Component - Jarvi Mobile
 * 
 * Implementação mobile do componente Text do design system.
 */

import React from 'react';
import { Text as RNText, TouchableOpacity } from 'react-native';
import {
  Text as BaseText,
  Heading as BaseHeading,
  Title as BaseTitle,
  Subtitle as BaseSubtitle,
  Body as BaseBody,
  Caption as BaseCaption,
  Overline as BaseOverline,
  getTextStyles,
  getTextThemeStyles,
  type TextProps as BaseTextProps,
} from '@jarvi/shared';
import { useThemeMobile } from '../../hooks/useTheme';

// ============================================================================
// TIPOS
// ============================================================================

export interface TextProps extends BaseTextProps {
  onPress?: () => void;
}

// ============================================================================
// COMPONENTE
// ============================================================================

export function Text({
  children,
  variant = 'body',
  size = 'base',
  weight = 'normal',
  color = 'primary',
  align = 'left',
  transform = 'none',
  decoration = 'none',
  numberOfLines,
  ellipsizeMode = 'tail',
  selectable = false,
  onPress,
  className = '',
  style,
  testID,
  ...props
}: TextProps) {
  const { isDark } = useThemeMobile();

  // Obter estilos inline
  const baseStyles = getTextStyles(variant, size, weight, color, align, transform, decoration);
  const themeStyles = getTextThemeStyles(color, isDark);
  const finalStyles = { ...baseStyles, ...themeStyles, ...style };

  // Obter estilos do texto
  const textStyles = {
    fontSize: size === 'xs' ? 12 : size === 'sm' ? 14 : size === 'base' ? 16 : size === 'lg' ? 18 : size === 'xl' ? 20 : size === '2xl' ? 24 : size === '3xl' ? 30 : size === '4xl' ? 36 : size === '5xl' ? 48 : 60,
    fontWeight: weight === 'thin' ? '100' : weight === 'extralight' ? '200' : weight === 'light' ? '300' : weight === 'normal' ? '400' : weight === 'medium' ? '500' : weight === 'semibold' ? '600' : weight === 'bold' ? '700' : weight === 'extrabold' ? '800' : '900',
    textAlign: align === 'left' ? 'left' : align === 'center' ? 'center' : align === 'right' ? 'right' : 'justify',
    textTransform: transform === 'none' ? 'none' : transform === 'uppercase' ? 'uppercase' : transform === 'lowercase' ? 'lowercase' : 'capitalize',
    textDecorationLine: decoration === 'none' ? 'none' : decoration === 'underline' ? 'underline' : 'line-through',
    ...finalStyles,
  };

  // Se onPress estiver definido, usar TouchableOpacity
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <RNText
          style={textStyles}
          numberOfLines={numberOfLines}
          ellipsizeMode={ellipsizeMode}
          selectable={selectable}
          testID={testID}
          {...props}
        >
          {children}
        </RNText>
      </TouchableOpacity>
    );
  }

  return (
    <RNText
      style={textStyles}
      numberOfLines={numberOfLines}
      ellipsizeMode={ellipsizeMode}
      selectable={selectable}
      testID={testID}
      {...props}
    >
      {children}
    </RNText>
  );
}

// ============================================================================
// COMPONENTES ESPECÍFICOS
// ============================================================================

export function Heading({
  children,
  level = 1,
  ...props
}: Omit<TextProps, 'variant' | 'size'> & { level?: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const sizeMap = {
    1: '6xl' as const,
    2: '5xl' as const,
    3: '4xl' as const,
    4: '3xl' as const,
    5: '2xl' as const,
    6: 'xl' as const,
  };
  
  return (
    <Text
      {...props}
      variant="heading"
      size={sizeMap[level]}
      weight="bold"
    >
      {children}
    </Text>
  );
}

export function Title({
  children,
  ...props
}: Omit<TextProps, 'variant' | 'size' | 'weight'>) {
  return (
    <Text
      {...props}
      variant="title"
      size="2xl"
      weight="semibold"
    >
      {children}
    </Text>
  );
}

export function Subtitle({
  children,
  ...props
}: Omit<TextProps, 'variant' | 'size' | 'weight'>) {
  return (
    <Text
      {...props}
      variant="subtitle"
      size="lg"
      weight="medium"
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  ...props
}: Omit<TextProps, 'variant'>) {
  return (
    <Text
      {...props}
      variant="body"
    >
      {children}
    </Text>
  );
}

export function Caption({
  children,
  ...props
}: Omit<TextProps, 'variant' | 'size'>) {
  return (
    <Text
      {...props}
      variant="caption"
      size="sm"
    >
      {children}
    </Text>
  );
}

export function Overline({
  children,
  ...props
}: Omit<TextProps, 'variant' | 'size' | 'weight' | 'transform'>) {
  return (
    <Text
      {...props}
      variant="overline"
      size="xs"
      weight="medium"
      transform="uppercase"
    >
      {children}
    </Text>
  );
}

