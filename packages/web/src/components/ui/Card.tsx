/**
 * Card Component - Jarvi Web
 * 
 * Componente Card otimizado para web com design tokens
 */

import React from 'react';
import { useThemeClasses } from '../../hooks/useTheme';

// ============================================================================
// TIPOS
// ============================================================================

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 'none' | 'sm' | 'md' | 'lg';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  border?: boolean;
}

// ============================================================================
// COMPONENTE
// ============================================================================

export function Card({
  children,
  className = '',
  padding = 'md',
  shadow = 'md',
  rounded = 'lg',
  border = true,
}: CardProps) {
  const { isDark } = useThemeClasses();

  // Classes base
  const baseClasses = [
    'transition-all duration-200',
    className,
  ].filter(Boolean).join(' ');

  // Classes de padding
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  // Classes de sombra
  const shadowClasses = {
    none: '',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
  };

  // Classes de borda arredondada
  const roundedClasses = {
    none: '',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
  };

  // Classes de tema
  const themeClasses = isDark
    ? 'bg-gray-800 border-gray-700'
    : 'bg-white border-gray-200';

  // Classes de borda
  const borderClasses = border ? 'border' : '';

  // Classes finais
  const cardClasses = [
    baseClasses,
    paddingClasses[padding],
    shadowClasses[shadow],
    roundedClasses[rounded],
    themeClasses,
    borderClasses,
  ].join(' ');

  return (
    <div className={cardClasses}>
      {children}
    </div>
  );
}
