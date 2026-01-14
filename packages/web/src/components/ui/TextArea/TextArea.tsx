/**
 * TextArea Component - Jarvi Web
 * 
 * Multiline text input component with label and focus states
 * Following JarviDS design system from Figma
 */

import React, { forwardRef, useState } from 'react';
import styles from './TextArea.module.css';

// ============================================================================
// TYPES
// ============================================================================

export interface TextAreaProps {
  /** TextArea id for label association */
  id?: string;
  /** TextArea name */
  name?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Controlled value */
  value?: string;
  /** Default value for uncontrolled textarea */
  defaultValue?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the textarea is disabled */
  disabled?: boolean;
  /** Number of visible text lines */
  rows?: number;
  /** Maximum character length */
  maxLength?: number;
  /** Change handler */
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Blur handler */
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  /** Focus handler */
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  /** Key down handler */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Additional CSS classes */
  className?: string;
  /** Whether textarea is in error state */
  error?: boolean;
  /** Helper text below the textarea */
  helperText?: string;
  /** Label text */
  label?: string;
  /** Whether to show the label */
  showLabel?: boolean;
  /** Whether the textarea can be resized */
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

// ============================================================================
// COMPONENT
// ============================================================================

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(({
  id,
  name,
  placeholder,
  value,
  defaultValue,
  required = false,
  disabled = false,
  rows = 4,
  maxLength,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  className = '',
  error = false,
  helperText,
  label,
  showLabel = true,
  resize = 'vertical',
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const textareaContainerClasses = [
    styles.textareaContainer,
    isFocused && styles.focused,
    error && styles.error,
    disabled && styles.disabled,
  ].filter(Boolean).join(' ');

  const textareaClasses = [
    styles.textarea,
    styles[`resize-${resize}`],
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
      
      <div className={textareaContainerClasses}>
        <textarea
          ref={ref}
          id={id}
          name={name}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          rows={rows}
          maxLength={maxLength}
          onChange={onChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={onKeyDown}
          className={textareaClasses}
        />
      </div>
      
      {helperText && (
        <p className={error ? styles.helperError : styles.helper}>
          {helperText}
        </p>
      )}
    </div>
  );
});

TextArea.displayName = 'TextArea';

// Alias for backward compatibility
export const Textarea = TextArea;
export type TextareaProps = TextAreaProps;


