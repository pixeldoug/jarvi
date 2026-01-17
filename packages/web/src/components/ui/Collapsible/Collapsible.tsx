/**
 * Collapsible Component - Jarvi Web
 * 
 * Collapsible section header with toggle, label, and divider
 * Following JarviDS design system from Figma
 */

import { useState, ReactNode } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import styles from './Collapsible.module.css';

export interface CollapsibleProps {
  /** Section label */
  label: string;
  /** Content to show when expanded */
  children: ReactNode;
  /** Initial open state */
  defaultOpen?: boolean;
  /** Controlled open state */
  isOpen?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (isOpen: boolean) => void;
  /** Additional CSS classes */
  className?: string;
  /** Disable toggle interaction (e.g., when section is empty) */
  disabled?: boolean;
}

export function Collapsible({
  label,
  children,
  defaultOpen = true,
  isOpen: controlledIsOpen,
  onOpenChange,
  className = '',
  disabled = false,
}: CollapsibleProps) {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(defaultOpen);
  
  // Support both controlled and uncontrolled modes
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : uncontrolledIsOpen;

  const handleToggle = () => {
    const newState = !isOpen;
    
    if (!isControlled) {
      setUncontrolledIsOpen(newState);
    }
    
    onOpenChange?.(newState);
  };

  const collapsibleClasses = [styles.collapsible, className].filter(Boolean).join(' ');
  const iconClasses = [
    styles.toggleIcon,
    (!isOpen || disabled) && styles.toggleIconClosed,
    disabled && styles.toggleIconDisabled,
  ].filter(Boolean).join(' ');
  const buttonClasses = [
    styles.toggleButton,
    disabled && styles.toggleButtonDisabled,
  ].filter(Boolean).join(' ');
  const labelClasses = [
    styles.label,
    disabled && styles.labelDisabled,
  ].filter(Boolean).join(' ');
  const contentClasses = [
    styles.content,
    isOpen ? styles.contentOpen : styles.contentClosed,
  ].filter(Boolean).join(' ');

  return (
    <div className={collapsibleClasses}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <button
            type="button"
            className={buttonClasses}
            onClick={disabled ? undefined : handleToggle}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${label}`}
            disabled={disabled}
          >
            <span className={iconClasses}>
              <CaretDown weight="bold" />
            </span>
          </button>
          <h3 className={labelClasses}>{label}</h3>
        </div>
        <hr className={styles.divider} />
      </div>

      {/* Content */}
      <div className={contentClasses}>
        {children}
      </div>
    </div>
  );
}



