/**
 * Card Component - Jarvi Mobile
 * 
 * Implementação mobile do componente Card do design system.
 */

import React from 'react';
import { View, Text } from 'react-native';
import {
  Card as BaseCard,
  CardHeader as BaseCardHeader,
  CardTitle as BaseCardTitle,
  CardDescription as BaseCardDescription,
  CardContent as BaseCardContent,
  CardFooter as BaseCardFooter,
  getCardStyles,
  getCardThemeStyles,
  getCardTitleThemeStyles,
  getCardDescriptionThemeStyles,
  getCardFooterThemeStyles,
  type CardProps as BaseCardProps,
  type CardHeaderProps as BaseCardHeaderProps,
  type CardTitleProps as BaseCardTitleProps,
  type CardDescriptionProps as BaseCardDescriptionProps,
  type CardContentProps as BaseCardContentProps,
  type CardFooterProps as BaseCardFooterProps,
} from '@jarvi/shared';
import { useThemeMobile } from '../../hooks/useTheme';

// ============================================================================
// TIPOS
// ============================================================================

export interface CardProps extends BaseCardProps {}
export interface CardHeaderProps extends BaseCardHeaderProps {}
export interface CardTitleProps extends BaseCardTitleProps {}
export interface CardDescriptionProps extends BaseCardDescriptionProps {}
export interface CardContentProps extends BaseCardContentProps {}
export interface CardFooterProps extends BaseCardFooterProps {}

// ============================================================================
// COMPONENTES
// ============================================================================

export function Card({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  style,
  testID,
  ...props
}: CardProps) {
  const { isDark } = useThemeMobile();

  // Obter estilos inline
  const baseStyles = getCardStyles(variant, padding);
  const themeStyles = getCardThemeStyles(variant, isDark);
  const finalStyles = { ...baseStyles, ...themeStyles, ...style };

  // Obter estilos do container
  const containerStyles = {
    borderRadius: 12,
    borderWidth: 1,
    ...finalStyles,
  };

  return (
    <View
      style={containerStyles}
      testID={testID}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardHeader({
  children,
  className = '',
  style,
  ...props
}: CardHeaderProps) {
  const containerStyles = {
    marginBottom: 16,
    ...style,
  };

  return (
    <View
      style={containerStyles}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardTitle({
  children,
  level = 3,
  className = '',
  style,
  ...props
}: CardTitleProps) {
  const { isDark } = useThemeMobile();

  // Obter estilos inline
  const baseStyles = getCardTitleThemeStyles(isDark);
  const finalStyles = { ...baseStyles, ...style };

  // Obter estilos do texto baseado no nível
  const textStyles = {
    fontSize: level === 1 ? 32 : level === 2 ? 24 : level === 3 ? 18 : level === 4 ? 16 : level === 5 ? 14 : 12,
    fontWeight: '600' as const,
    ...finalStyles,
  };

  return (
    <Text
      style={textStyles}
      {...props}
    >
      {children}
    </Text>
  );
}

export function CardDescription({
  children,
  className = '',
  style,
  ...props
}: CardDescriptionProps) {
  const { isDark } = useThemeMobile();

  // Obter estilos inline
  const baseStyles = getCardDescriptionThemeStyles(isDark);
  const finalStyles = { ...baseStyles, ...style };

  // Obter estilos do texto
  const textStyles = {
    fontSize: 14,
    ...finalStyles,
  };

  return (
    <Text
      style={textStyles}
      {...props}
    >
      {children}
    </Text>
  );
}

export function CardContent({
  children,
  className = '',
  style,
  ...props
}: CardContentProps) {
  return (
    <View
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardFooter({
  children,
  className = '',
  style,
  ...props
}: CardFooterProps) {
  const { isDark } = useThemeMobile();

  // Obter estilos inline
  const baseStyles = getCardFooterThemeStyles(isDark);
  const finalStyles = { ...baseStyles, ...style };

  // Obter estilos do container
  const containerStyles = {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    ...finalStyles,
  };

  return (
    <View
      style={containerStyles}
      {...props}
    >
      {children}
    </View>
  );
}

