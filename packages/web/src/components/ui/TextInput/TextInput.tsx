/**
 * TextInput Component - Jarvi Web
 * 
 * Text input component with label, action button, and focus states
 * Following JarviDS design system from Figma
 */

import React, { forwardRef, useState } from 'react';
import { IconProps } from '@phosphor-icons/react';
import styles from './TextInput.module.css';

// ============================================================================
// TYPES
// ============================================================================

type PhosphorIcon = React.ComponentType<IconProps>;

export interface TextInputProps {
  /** Input id for label association */
  id?: string;
  /** Input name */
  name?: string;
  /** Input type */
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'date' | 'search';
  /** Placeholder text */
  placeholder?: string;
  /** Controlled value */
  value?: string;
  /** Default value for uncontrolled input */
  defaultValue?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Autocomplete attribute */
  autoComplete?: string;
  /** Change handler */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Blur handler */
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  /** Focus handler */
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  /** Key down handler */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Additional CSS classes for the input */
  className?: string;
  /** Whether input is in error state */
  error?: boolean;
  /** Helper text below the input */
  helperText?: string;
  /** Label text */
  label?: string;
  /** Whether to show the label */
  showLabel?: boolean;
  /** Optional action button icon */
  actionIcon?: PhosphorIcon;
  /** Callback when action button is clicked */
  onActionClick?: () => void;
  /** Aria label for action button */
  actionAriaLabel?: string;
  /** Whether action button is disabled */
  actionDisabled?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(({
  id,
  name,
  type = 'text',
  placeholder,
  value,
  defaultValue,
  required = false,
  disabled = false,
  autoComplete,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  className = '',
  error = false,
  helperText,
  label,
  showLabel = true,
  actionIcon: ActionIcon,
  onActionClick,
  actionAriaLabel = 'Action',
  actionDisabled = false,
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const inputContainerClasses = [
    styles.inputContainer,
    isFocused && styles.focused,
    error && styles.error,
    disabled && styles.disabled,
  ].filter(Boolean).join(' ');

  const inputClasses = [
    styles.input,
    ActionIcon && styles.withAction,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.wrapper}>
      {showLabel && label && (
        <label 
          htmlFor={id} 
          className={styles.label}
        >
          {label}
        </label>
      )}
      
      <div className={inputContainerClasses}>
        <input
          ref={ref}
          id={id}
          name={name}
          type={type}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          onChange={onChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={onKeyDown}
          className={inputClasses}
        />
        
        {ActionIcon && (
          <button
            type="button"
            onClick={onActionClick}
            disabled={disabled || actionDisabled}
            aria-label={actionAriaLabel}
            className={styles.actionButton}
          >
            <ActionIcon size={20} weight="regular" />
          </button>
        )}
      </div>
      
      {helperText && (
        <p className={error ? styles.helperError : styles.helper}>
          {helperText}
        </p>
      )}
    </div>
  );
});

TextInput.displayName = 'TextInput';

// Alias for backward compatibility
export const Input = TextInput;
export type InputProps = TextInputProps;


