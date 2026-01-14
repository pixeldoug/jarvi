/**
 * Button Component - Jarvi Mobile
 * 
 * Button component using design tokens from shared package
 */

import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, ViewStyle, TextStyle, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { spacing } from '@jarvi/shared/src/design-tokens/platforms/native';

// ============================================================================
// TYPES
// ============================================================================

export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

// ============================================================================
// COMPONENT
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
  const { theme } = useTheme();

  // Size styles
  const sizeStyles = {
    sm: { 
      paddingHorizontal: spacing[2], 
      paddingVertical: spacing[1],
      fontSize: 14,
    },
    md: { 
      paddingHorizontal: spacing[3], 
      paddingVertical: spacing[2],
      fontSize: 16,
    },
    lg: { 
      paddingHorizontal: spacing[4], 
      paddingVertical: spacing[3],
      fontSize: 18,
    },
  };

  // Variant styles
  const variantStyles = {
    primary: {
      container: {
        backgroundColor: theme.componentButtonPrimaryBgDefault,
        borderColor: theme.componentButtonPrimaryBorderDefault,
      },
      text: {
        color: theme.componentButtonPrimaryContentDefault,
      },
    },
    secondary: {
      container: {
        backgroundColor: theme.componentButtonSecondaryBgDefault,
        borderColor: theme.componentButtonSecondaryBorderDefault,
      },
      text: {
        color: theme.componentButtonSecondaryContentDefault,
      },
    },
    outline: {
      container: {
        backgroundColor: 'transparent',
        borderColor: theme.componentButtonGhostBorderDefault,
      },
      text: {
        color: theme.componentButtonGhostContentDefault,
      },
    },
    ghost: {
      container: {
        backgroundColor: theme.componentButtonGhostBgDefault,
        borderColor: 'transparent',
      },
      text: {
        color: theme.componentButtonGhostContentDefault,
      },
    },
    destructive: {
      container: {
        backgroundColor: theme.componentButtonDestructiveBgDefault,
        borderColor: theme.componentButtonDestructiveBorderDefault,
      },
      text: {
        color: theme.componentButtonDestructiveContentDefault,
      },
    },
  };

  // Build styles
  const buttonStyle: ViewStyle = StyleSheet.flatten([
    styles.base,
    {
      paddingHorizontal: sizeStyles[size].paddingHorizontal,
      paddingVertical: sizeStyles[size].paddingVertical,
    },
    variantStyles[variant].container,
    fullWidth && styles.fullWidth,
    (disabled || loading) && {
      backgroundColor: theme.componentButtonBgDisabled,
      borderColor: theme.componentButtonBgDisabled,
      opacity: 0.6,
    },
    style,
  ]);

  const finalTextStyle: TextStyle = StyleSheet.flatten([
    styles.text,
    { fontSize: sizeStyles[size].fontSize },
    variantStyles[variant].text,
    (disabled || loading) && {
      color: theme.componentButtonContentDisabled,
    },
    textStyle,
  ]);

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
            color={finalTextStyle.color as string}
            style={styles.spinner}
          />
          <Text style={finalTextStyle}>
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
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: spacing[2],
    borderWidth: 1,
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  spinner: {
    marginRight: spacing[2],
  },
});

// ============================================================================
// VARIANT COMPONENTS
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

export function DestructiveButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="destructive" />;
}
