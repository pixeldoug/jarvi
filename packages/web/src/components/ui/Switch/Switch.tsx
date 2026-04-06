/**
 * Switch Component - Jarvi Web
 *
 * Toggle switch primitive following Figma design system specs.
 * Uses CSS Modules and design tokens.
 *
 * Figma: https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001298-53897
 *
 * States: checked (active), unchecked (default)
 */

import { useId } from 'react';
import styles from './Switch.module.css';

// ============================================================================
// TYPES
// ============================================================================

export interface SwitchProps {
  /** Whether the switch is on */
  checked: boolean;
  /** Called when the user toggles the switch */
  onChange: (checked: boolean) => void;
  /** Accessible label — required when no visible label is provided */
  'aria-label'?: string;
  /** Id of a visible label element */
  'aria-labelledby'?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Switch({
  checked,
  onChange,
  disabled = false,
  className = '',
  id: externalId,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SwitchProps) {
  const generatedId = useId();
  const id = externalId ?? generatedId;

  const trackClasses = [
    styles.track,
    checked ? styles.checked : styles.unchecked,
    disabled && styles.disabled,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      disabled={disabled}
      className={trackClasses}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
}
