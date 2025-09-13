/**
 * Badge Component - Jarvi Web
 * 
 * Componente Badge otimizado para web com design tokens
 */

import React from 'react';
import { useThemeClasses } from '../../hooks/useTheme';

// ============================================================================
// TIPOS
// ============================================================================

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// ============================================================================
// COMPONENTE
// ============================================================================

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}: BadgeProps) {
  const { isDark } = useThemeClasses();

  // Classes base
  const baseClasses = [
    'inline-flex items-center font-medium rounded-full',
    className,
  ].filter(Boolean).join(' ');

  // Classes de tamanho
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-2.5 py-1.5 text-sm',
    lg: 'px-3 py-2 text-base',
  };

  // Classes de variante
  const variantClasses = {
    default: isDark 
      ? 'bg-gray-700 text-gray-200' 
      : 'bg-gray-100 text-gray-800',
    primary: isDark 
      ? 'bg-blue-600 text-blue-100' 
      : 'bg-blue-100 text-blue-800',
    secondary: isDark 
      ? 'bg-purple-600 text-purple-100' 
      : 'bg-purple-100 text-purple-800',
    success: isDark 
      ? 'bg-green-600 text-green-100' 
      : 'bg-green-100 text-green-800',
    warning: isDark 
      ? 'bg-yellow-600 text-yellow-100' 
      : 'bg-yellow-100 text-yellow-800',
    danger: isDark 
      ? 'bg-red-600 text-red-100' 
      : 'bg-red-100 text-red-800',
    info: isDark 
      ? 'bg-cyan-600 text-cyan-100' 
      : 'bg-cyan-100 text-cyan-800',
  };

  // Classes finais
  const badgeClasses = [
    baseClasses,
    sizeClasses[size],
    variantClasses[variant],
  ].join(' ');

  return (
    <span className={badgeClasses}>
      {children}
    </span>
  );
}
