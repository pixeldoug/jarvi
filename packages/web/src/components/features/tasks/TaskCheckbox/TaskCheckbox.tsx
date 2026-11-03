/**
 * TaskCheckbox Component - Jarvi Web
 * 
 * Custom checkbox for tasks following Figma design
 * - 24x24px, rounded-[8px]
 * - Unchecked: border gray, transparent bg
 * - Checked: bg purple, white check icon
 */

import React, { useEffect, useRef, useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { celebrateCompletion, preloadCompletionSound } from './completionCelebration';
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
  size?: 'default' | 'medium' | 'large';
  /** Shown but not toggleable */
  disabled?: boolean;
  /** Completing a task: sound + pop + confetti when the user checks it */
  celebrate?: boolean;
}

export function TaskCheckbox({
  checked,
  onChange,
  ariaLabel = 'Toggle task completion',
  className = '',
  size = 'default',
  disabled = false,
  celebrate = false,
}: TaskCheckboxProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  // The pop plays once per check, even if the pointer leaves halfway
  const [popping, setPopping] = useState(false);
  // Just checked by the user: keeps the filled look while the pointer is still
  // on it, instead of jumping straight to the hover tint
  const [justChecked, setJustChecked] = useState(false);

  useEffect(() => {
    if (celebrate) preloadCompletionSound();
  }, [celebrate]);

  useEffect(() => {
    if (!checked) {
      setPopping(false);
      setJustChecked(false);
    }
  }, [checked]);

  const checkboxClasses = [
    styles.checkbox,
    size === 'medium' && styles.medium,
    size === 'large' && styles.large,
    checked && styles.checked,
    checked && popping && styles.popping,
    checked && justChecked && styles.justChecked,
    className,
  ].filter(Boolean).join(' ');

  const toggle = () => {
    if (disabled) return;
    if (celebrate && !checked) {
      setPopping(true);
      setJustChecked(true);
      if (buttonRef.current) celebrateCompletion(buttonRef.current);
    }
    onChange();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      className={checkboxClasses}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerLeave={() => setJustChecked(false)}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setPopping(false);
      }}
      aria-label={ariaLabel}
      aria-checked={checked ? 'true' : 'false'}
      role="checkbox"
      disabled={disabled}
    >
      {checked && (
        <span className={styles.icon}>
          <Check weight="bold" />
        </span>
      )}
    </button>
  );
}


