/**
 * Input Component - Jarvi Mobile
 * 
 * Input component using design tokens from shared package
 */

import React, { forwardRef } from 'react';
import { View, Text, TextInput as RNTextInput, ViewStyle, TextStyle, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { spacing } from '@jarvi/shared/src/design-tokens/platforms/native';

// ============================================================================
// TYPES
// ============================================================================

export interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel';
  disabled?: boolean;
  error?: string;
  helperText?: string;
  required?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: ViewStyle;
  testID?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const Input = forwardRef<RNTextInput, InputProps>(({
  label,
  placeholder,
  value,
  defaultValue,
  type = 'text',
  disabled = false,
  error,
  helperText,
  required = false,
  autoCapitalize = 'sentences',
  autoCorrect = true,
  multiline = false,
  numberOfLines = 1,
  maxLength,
  onChangeText,
  onFocus,
  onBlur,
  style,
  testID,
}, ref) => {
  const { theme } = useTheme();

  // Map type to keyboard type
  const getKeyboardType = () => {
    switch (type) {
      case 'email':
        return 'email-address';
      case 'number':
        return 'numeric';
      case 'tel':
        return 'phone-pad';
      default:
        return 'default';
    }
  };

  // Map type to autoCapitalize
  const getAutoCapitalize = () => {
    if (type === 'email' || type === 'password') {
      return 'none';
    }
    return autoCapitalize;
  };

  // Build styles
  const inputStyle: TextStyle = StyleSheet.flatten([
    styles.input,
    {
      backgroundColor: theme.semanticControlControlBg,
      borderColor: error 
        ? theme.semanticContentContentError 
        : theme.semanticControlControlBorderDefault,
      color: theme.semanticContentContentPrimary,
    },
    disabled && {
      backgroundColor: theme.semanticSurfaceSurfaceSecondary,
      opacity: 0.6,
    },
    style,
  ]);

  const labelStyle: TextStyle = StyleSheet.flatten([
    styles.label,
    {
      color: theme.semanticContentContentSecondary,
    },
  ]);

  const helperStyle: TextStyle = StyleSheet.flatten([
    styles.helper,
    {
      color: error 
        ? theme.semanticContentContentError 
        : theme.semanticContentContentTertiary,
    },
  ]);

  return (
    <View style={styles.wrapper}>
      {label && (
        <Text style={labelStyle}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}
      
      <RNTextInput
        ref={ref}
        style={inputStyle}
        placeholder={placeholder}
        placeholderTextColor={theme.semanticContentContentTertiary}
        value={value}
        defaultValue={defaultValue}
        editable={!disabled}
        autoCapitalize={getAutoCapitalize()}
        autoCorrect={autoCorrect}
        keyboardType={getKeyboardType()}
        multiline={multiline}
        numberOfLines={numberOfLines}
        maxLength={maxLength}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        secureTextEntry={type === 'password'}
        testID={testID}
      />
      
      {(error || helperText) && (
        <Text style={helperStyle}>
          {error || helperText}
        </Text>
      )}
    </View>
  );
});

Input.displayName = 'Input';

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing[2],
  },
  required: {
    color: '#ef4444',
  },
  input: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: 16,
    borderRadius: spacing[2],
    borderWidth: 1,
  },
  helper: {
    fontSize: 12,
    marginTop: spacing[1],
  },
});

// ============================================================================
// VARIANT COMPONENTS
// ============================================================================

export function TextInput(props: Omit<InputProps, 'type'>) {
  return <Input {...props} type="text" />;
}

export function EmailInput(props: Omit<InputProps, 'type'>) {
  return <Input {...props} type="email" />;
}

export function PasswordInput(props: Omit<InputProps, 'type'>) {
  return <Input {...props} type="password" />;
}

export function NumberInput(props: Omit<InputProps, 'type'>) {
  return <Input {...props} type="number" />;
}
