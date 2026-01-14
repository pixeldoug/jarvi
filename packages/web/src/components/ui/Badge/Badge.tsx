/**
 * Badge Component - Jarvi Web
 * 
 * Interactive badge component with prefix icon and removeable functionality
 * Following JarviDS design system from Figma
 */

import { ReactNode } from 'react';
import { Hash, X } from '@phosphor-icons/react';
import styles from './Badge.module.css';

// ============================================================================
// TYPES
// ============================================================================

export interface BadgeProps {
  /** Text label to display */
  label: string;
  /** Whether to show prefix icon */
  prefix?: boolean;
  /** Custom prefix icon (defaults to Hash icon) */
  prefixIcon?: ReactNode;
  /** Whether the badge is removeable (shows close icon) */
  removeable?: boolean;
  /** Whether the badge is disabled */
  disabled?: boolean;
  /** Click handler for the badge */
  onClick?: () => void;
  /** Handler called when remove button is clicked */
  onRemove?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Badge({
  label,
  prefix = true,
  prefixIcon,
  removeable = false,
  disabled = false,
  onClick,
  onRemove,
  className = '',
}: BadgeProps) {
  const badgeClasses = [
    styles.badge,
    disabled && styles.disabled,
    className,
  ].filter(Boolean).join(' ');

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled && onRemove) {
      onRemove();
    }
  };

  return (
    <div 
      className={badgeClasses}
      onClick={onClick ? handleClick : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
    >
      {prefix && (
        <span className={styles.prefixIcon}>
          {prefixIcon || <Hash size={16} weight="regular" />}
        </span>
      )}
      
      <span className={styles.label}>{label}</span>
      
      {removeable && (
        <button 
          className={styles.closeButton}
          onClick={handleRemove}
          type="button"
          aria-label={`Remove ${label}`}
          disabled={disabled}
        >
          <X size={16} weight="regular" />
        </button>
      )}
    </div>
  );
}

