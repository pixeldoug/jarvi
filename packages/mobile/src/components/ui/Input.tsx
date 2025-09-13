/**
 * Input Component - Jarvi Mobile
 * 
 * Implementação mobile do componente Input do design system.
 */

import React, { forwardRef } from 'react';
import { View, Text, TextInput as RNTextInput, TouchableOpacity } from 'react-native';
import {
  Input as BaseInput,
  TextInput as BaseTextInput,
  EmailInput as BaseEmailInput,
  PasswordInput as BasePasswordInput,
  NumberInput as BaseNumberInput,
  SearchInput as BaseSearchInput,
  getInputStyles,
  getInputThemeStyles,
  getLabelThemeStyles,
  getHelperTextThemeStyles,
  getPlaceholderThemeStyles,
  type InputProps as BaseInputProps,
} from '@jarvi/shared';
import { useThemeMobile } from '../../hooks/useTheme';

// ============================================================================
// TIPOS
// ============================================================================

export interface InputProps extends BaseInputProps {
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

// ============================================================================
// COMPONENTE
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
  leftIcon,
  rightIcon,
  required = false,
  autoComplete,
  autoCapitalize = 'sentences',
  autoCorrect = true,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
  maxLength,
  onChange,
  onChangeText,
  onFocus,
  onBlur,
  onSubmitEditing,
  className = '',
  style,
  testID,
  ...props
}, ref) => {
  const { isDark } = useThemeMobile();

  // Obter estilos inline
  const hasError = !!error;
  const hasLeftIcon = !!leftIcon;
  const hasRightIcon = !!rightIcon;
  
  const baseStyles = getInputStyles(hasError, hasLeftIcon, hasRightIcon, disabled);
  const themeStyles = getInputThemeStyles(hasError, isDark);
  const finalStyles = { ...baseStyles, ...themeStyles, ...style };

  // Obter estilos do label
  const labelStyles = getLabelThemeStyles(isDark);

  // Obter estilos do helper text
  const helperStyles = getHelperTextThemeStyles(hasError, isDark);

  // Obter estilos do placeholder
  const placeholderStyles = getPlaceholderThemeStyles(isDark);

  // Obter estilos do container
  const containerStyles = {
    width: '100%',
  };

  // Obter estilos do input
  const inputStyles = {
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    borderRadius: 8,
    borderWidth: 1,
    ...finalStyles,
  };

  // Obter estilos do label
  const labelTextStyles = {
    fontSize: 14,
    fontWeight: '500' as const,
    marginBottom: 4,
    ...labelStyles,
  };

  // Obter estilos do helper text
  const helperTextStyles = {
    fontSize: 12,
    marginTop: 4,
    ...helperStyles,
  };

  // Obter estilos do placeholder
  const placeholderTextStyles = {
    ...placeholderStyles,
  };

  // Mapear keyboardType
  const getKeyboardType = () => {
    switch (type) {
      case 'email':
        return 'email-address';
      case 'number':
        return 'numeric';
      case 'tel':
        return 'phone-pad';
      case 'url':
        return 'url';
      default:
        return 'default';
    }
  };

  // Mapear autoCapitalize
  const getAutoCapitalize = () => {
    switch (type) {
      case 'email':
        return 'none';
      case 'password':
        return 'none';
      default:
        return autoCapitalize;
    }
  };

  return (
    <View style={containerStyles}>
      {label && (
        <Text style={labelTextStyles}>
          {label}
          {required && <Text style={{ color: '#ef4444' }}> *</Text>}
        </Text>
      )}
      
      <View style={{ position: 'relative' }}>
        {leftIcon && (
          <View style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: [{ translateY: -10 }],
            zIndex: 1,
          }}>
            {leftIcon}
          </View>
        )}
        
        <RNTextInput
          ref={ref}
          style={inputStyles}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextStyles.color}
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
          onSubmitEditing={onSubmitEditing}
          secureTextEntry={type === 'password'}
          testID={testID}
          {...props}
        />
        
        {rightIcon && (
          <View style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: [{ translateY: -10 }],
            zIndex: 1,
          }}>
            {rightIcon}
          </View>
        )}
      </View>
      
      {error && (
        <Text style={helperTextStyles}>
          {error}
        </Text>
      )}
      
      {helperText && !error && (
        <Text style={helperTextStyles}>
          {helperText}
        </Text>
      )}
    </View>
  );
});

Input.displayName = 'Input';

// ============================================================================
// COMPONENTES ESPECÍFICOS
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

export function SearchInput(props: Omit<InputProps, 'type'>) {
  return (
    <Input
      {...props}
      type="search"
      leftIcon={
        <Text style={{ color: '#9ca3af', fontSize: 16 }}>🔍</Text>
      }
    />
  );
}

