/**
 * TaskCheckbox Component - Jarvi Web
 * 
 * Custom checkbox for tasks following Figma design
 * - 24x24px, rounded-[8px]
 * - Unchecked: border gray, transparent bg
 * - Checked: bg purple, white check icon
 */

import React from 'react';
import { Check } from '@phosphor-icons/react';
import styles from './TaskCheckbox.module.css';

export interface TaskCheckboxProps {
  /** Whether the checkbox is checked */
  checked: boolean;
  /** Change handler */
  onChange: () => void;
  /** Accessible label */
  ariaLabel?: string;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: 'default' | 'large';
}

export function TaskCheckbox({
  checked,
  onChange,
  ariaLabel = 'Toggle task completion',
  className = '',
  size = 'default',
}: TaskCheckboxProps) {
  const checkboxClasses = [
    styles.checkbox,
    size === 'large' && styles.large,
    checked && styles.checked,
    className,
  ].filter(Boolean).join(' ');

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onChange();
    }
  };

  return (
    <button
      type="button"
      className={checkboxClasses}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
      aria-checked={checked ? 'true' : 'false'}
      role="checkbox"
    >
      {checked && (
        <span className={styles.icon}>
          <Check weight="bold" />
        </span>
      )}
    </button>
  );
}


