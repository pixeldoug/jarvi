/**
 * Card Component - Jarvi Web
 * 
 * Card component using CSS Modules and design tokens
 */

import React from 'react';
import styles from './Card.module.css';

// ============================================================================
// TYPES
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
// COMPONENT
// ============================================================================

export function Card({
  children,
  className = '',
  padding = 'md',
  shadow = 'md',
  rounded = 'lg',
  border = true,
}: CardProps) {
  // Build class names
  const cardClasses = [
    styles.card,
    styles[`padding-${padding}`],
    styles[`shadow-${shadow}`],
    styles[`rounded-${rounded}`],
    border && styles.border,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses}>
      {children}
    </div>
  );
}
