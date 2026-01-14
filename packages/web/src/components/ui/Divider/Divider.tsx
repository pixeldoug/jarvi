/**
 * Divider Component - Jarvi Web
 * 
 * Simple divider component using CSS Modules and design tokens
 */

import styles from './Divider.module.css';

// ============================================================================
// TYPES
// ============================================================================

export interface DividerProps {
  /**
   * Orientation of the divider
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical';
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Divider({ 
  orientation = 'horizontal',
  className = '' 
}: DividerProps) {
  const dividerClasses = [
    styles.divider,
    styles[orientation],
    className,
  ].filter(Boolean).join(' ');

  return (
    <hr 
      className={dividerClasses}
      role="separator"
      aria-orientation={orientation}
    />
  );
}
