/**
 * Chip Component - Jarvi Web
 * 
 * Small badge for displaying metadata like time, date, category
 * Following JarviDS design system from Figma
 */

import { ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import styles from './Chip.module.css';

export interface ChipProps {
  /** Text label to display */
  label: string;
  /** Optional icon to show before label */
  icon?: ReactNode;
  /** Size variant */
  size?: 'small' | 'medium';
  /** Whether the chip is in active state */
  active?: boolean;
  /** Whether the chip is disabled */
  disabled?: boolean;
  /** Whether the chip is interactive (clickable) */
  interactive?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Clear handler - shows X button when defined */
  onClear?: () => void;
  /** Additional CSS classes */
  className?: string;
}

export function Chip({
  label,
  icon,
  size = 'small',
  active = false,
  disabled = false,
  interactive = false,
  onClick,
  onClear,
  className = '',
}: ChipProps) {
  const chipClasses = [
    styles.chip,
    size === 'small' ? styles.chipSmall : styles.chipMedium,
    interactive && styles.interactive,
    active && styles.active,
    disabled && styles.disabled,
    onClear && styles.hasClear,
    className,
  ].filter(Boolean).join(' ');

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled && onClear) {
      onClear();
    }
  };

  return (
    <div 
      className={chipClasses}
      onClick={interactive ? handleClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{label}</span>
      {onClear && (
        <span 
          className={styles.clearButton}
          onClick={handleClear}
          role="button"
          aria-label="Limpar"
          tabIndex={0}
        >
          <X size={12} weight="regular" />
        </span>
      )}
    </div>
  );
}

