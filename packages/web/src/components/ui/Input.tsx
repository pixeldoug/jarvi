/**
 * Input Component - Jarvi Web
 * 
 * Componente Input otimizado para web com design tokens
 */

import React from 'react';
import { useThemeClasses } from '../../hooks/useTheme';

// ============================================================================
// TIPOS
// ============================================================================

export interface InputProps {
  id?: string;
  name?: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'date';
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  className?: string;
  error?: boolean;
  helperText?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

// ============================================================================
// COMPONENTE
// ============================================================================

export function Input({
  id,
  name,
  type = 'text',
  placeholder,
  value,
  defaultValue,
  required = false,
  disabled = false,
  autoComplete,
  onChange,
  onBlur,
  onFocus,
  className = '',
  error = false,
  helperText,
  label,
  size = 'md',
}: InputProps) {
  const { isDark } = useThemeClasses();

  // Classes base
  const baseClasses = [
    'block w-full rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
    error ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500',
    className,
  ].filter(Boolean).join(' ');

  // Classes de tamanho
  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3 text-base',
    lg: 'px-5 py-4 text-lg',
  };

  // Classes de tema
  const themeClasses = isDark
    ? 'bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-400'
    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500';

  // Classes finais
  const inputClasses = [
    baseClasses,
    sizeClasses[size],
    themeClasses,
  ].join(' ');

  return (
    <div className="w-full">
      {label && (
        <label 
          htmlFor={id} 
          className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        className={inputClasses}
      />
      
      {helperText && (
        <p className={`mt-1 text-sm ${error ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>
          {helperText}
        </p>
      )}
    </div>
  );
}
