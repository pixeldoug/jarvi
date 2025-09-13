/**
 * Button Component - Jarvi Web
 * 
 * Componente Button otimizado para web com design tokens
 */

import React from 'react';
import { useThemeClasses } from '../../hooks/useTheme';

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
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
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
  leftIcon,
  rightIcon,
  onClick,
  className = '',
  type = 'button',
}: ButtonProps) {
  const { isDark } = useThemeClasses();

  // Classes base
  const baseClasses = [
    'inline-flex items-center justify-center font-medium rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2',
    fullWidth ? 'w-full' : '',
    disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    className,
  ].filter(Boolean).join(' ');

  // Classes de tamanho
  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  // Classes de variante
  const variantClasses = {
    primary: isDark 
      ? 'bg-blue-950 border-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500' 
      : 'bg-blue-950 border-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500',
    secondary: isDark 
      ? 'bg-purple-600 border-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500' 
      : 'bg-purple-500 border-purple-500 text-white hover:bg-purple-600 focus:ring-purple-500',
    outline: isDark 
      ? 'bg-transparent border-gray-600 text-gray-100 hover:bg-gray-700 focus:ring-gray-500' 
      : 'bg-transparent border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500',
    ghost: isDark 
      ? 'bg-transparent border-transparent text-gray-100 hover:bg-gray-700 focus:ring-gray-500' 
      : 'bg-transparent border-transparent text-gray-700 hover:bg-gray-50 focus:ring-gray-500',
    danger: isDark 
      ? 'bg-red-600 border-red-600 text-white hover:bg-red-700 focus:ring-red-500' 
      : 'bg-red-500 border-red-500 text-white hover:bg-red-600 focus:ring-red-500',
  };

  // Classes finais
  const buttonClasses = [
    baseClasses,
    sizeClasses[size],
    variantClasses[variant],
  ].join(' ');

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {children}
        </>
      ) : (
        <>
          {leftIcon && <span className="mr-2">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="ml-2">{rightIcon}</span>}
        </>
      )}
    </button>
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