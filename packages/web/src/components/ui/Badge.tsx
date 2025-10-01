/**
 * Badge Component - Jarvi Web
 * 
 * Componente Badge otimizado para web com design tokens
 */

import React from 'react';

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

  // Classes de variante (melhoradas para dark mode)
  const variantClasses = {
    default: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
    primary: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200',
    secondary: 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200',
    success: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200',
    warning: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200',
    danger: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200',
    info: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-200',
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
