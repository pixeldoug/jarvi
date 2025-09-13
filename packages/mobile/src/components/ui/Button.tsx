/**
 * Button Component - Jarvi Mobile
 * 
 * Componente Button otimizado para React Native
 */

import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { useThemeMobile } from '../../hooks/useTheme';

// ============================================================================
// TIPOS
// ============================================================================

export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

// ============================================================================
// COMPONENTE
// ============================================================================

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  onPress,
  style,
  textStyle,
}: ButtonProps) {
  const { isDark, colors } = useThemeMobile();

  // Estilos base
  const baseStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    opacity: disabled || loading ? 0.5 : 1,
  };

  // Estilos de tamanho
  const sizeStyles = {
    sm: { paddingHorizontal: 12, paddingVertical: 8 },
    md: { paddingHorizontal: 16, paddingVertical: 12 },
    lg: { paddingHorizontal: 24, paddingVertical: 16 },
  };

  // Estilos de variante
  const variantStyles = {
    primary: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    secondary: {
      backgroundColor: colors.brand.secondary,
      borderColor: colors.brand.secondary,
    },
    outline: {
      backgroundColor: 'transparent',
      borderColor: colors.border.primary,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
    },
    danger: {
      backgroundColor: colors.semantic.error,
      borderColor: colors.semantic.error,
    },
  };

  // Estilos de texto
  const textStyles: TextStyle = {
    fontWeight: '600',
    textAlign: 'center',
    color: variant === 'outline' || variant === 'ghost' 
      ? colors.text.primary 
      : colors.text.inverse,
  };

  // Estilos de tamanho do texto
  const textSizeStyles = {
    sm: { fontSize: 14 },
    md: { fontSize: 16 },
    lg: { fontSize: 18 },
  };

  // Estilos finais
  const buttonStyle: ViewStyle = {
    ...baseStyle,
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...(fullWidth && { width: '100%' }),
    ...style,
  };

  const finalTextStyle: TextStyle = {
    ...textStyles,
    ...textSizeStyles[size],
    ...textStyle,
  };

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <>
          <ActivityIndicator 
            size="small" 
            color={variant === 'outline' || variant === 'ghost' 
              ? colors.text.primary 
              : colors.text.inverse} 
          />
          <Text style={[finalTextStyle, { marginLeft: 8 }]}>
            {children}
          </Text>
        </>
      ) : (
        <Text style={finalTextStyle}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// COMPONENTES ESPECÍFICOS
// ============================================================================

export function PrimaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="secondary" />;
}

export function OutlineButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="outline" />;
}

export function GhostButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="ghost" />;
}

export function DangerButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="danger" />;
}