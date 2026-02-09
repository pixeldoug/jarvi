/**
 * PasswordInput Component - Jarvi Web
 * 
 * Password input with strength meter using zxcvbn
 * Shows real-time strength score and feedback
 */

import React, { forwardRef, useState, useMemo } from 'react';
import zxcvbn from 'zxcvbn';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { translateWarning, translateSuggestions } from '../../../utils/passwordTranslations';
import styles from './PasswordInput.module.css';

// ============================================================================
// TYPES
// ============================================================================

export interface PasswordInputProps {
  /** Input id for label association */
  id?: string;
  /** Input name */
  name?: string;
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
  /** Whether to show the strength meter */
  showStrengthMeter?: boolean;
  /** Minimum required strength score (0-4) */
  minStrength?: number;
  /** Callback when strength changes */
  onStrengthChange?: (score: number) => void;
  /** User inputs for zxcvbn (email, name, etc) */
  userInputs?: string[];
}

// ============================================================================
// HELPERS
// ============================================================================

const getStrengthLabel = (score: number): string => {
  const labels = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];
  return labels[score] || '';
};

const getStrengthColor = (score: number): string => {
  const colors = [
    'var(--semantic-content-negative)',
    'var(--semantic-content-warning)',
    '#F59E0B',
    'var(--semantic-content-positive)',
    'var(--semantic-content-positive)',
  ];
  return colors[score] || colors[0];
};

// ============================================================================
// COMPONENT
// ============================================================================

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(({
  id,
  name,
  placeholder,
  value,
  defaultValue,
  required = false,
  disabled = false,
  autoComplete,
  onChange,
  onBlur,
  onFocus,
  className = '',
  error = false,
  helperText,
  label,
  showLabel = true,
  showStrengthMeter = false,
  minStrength = 0,
  onStrengthChange,
  userInputs = [],
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Calculate password strength
  const strengthResult = useMemo(() => {
    if (!value || !showStrengthMeter) return null;
    const result = zxcvbn(value, userInputs);
    
    // Translate feedback to PT-BR
    return {
      ...result,
      feedback: {
        warning: translateWarning(result.feedback.warning),
        suggestions: translateSuggestions(result.feedback.suggestions || []),
      },
    };
  }, [value, showStrengthMeter, userInputs]);

  // Notify parent of strength changes
  React.useEffect(() => {
    if (strengthResult && onStrengthChange) {
      onStrengthChange(strengthResult.score);
    }
  }, [strengthResult, onStrengthChange]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const inputContainerClasses = [
    styles.inputContainer,
    isFocused && styles.focused,
    error && styles.error,
    disabled && styles.disabled,
  ].filter(Boolean).join(' ');

  const inputClasses = [
    styles.input,
    styles.withAction,
    className,
  ].filter(Boolean).join(' ');

  const score = strengthResult?.score ?? -1;
  const hasValue = value && value.length > 0;
  const isTooWeak = showStrengthMeter && hasValue && score >= 0 && score < minStrength;

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
          type={showPassword ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          onChange={onChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          className={inputClasses}
        />
        
        <button
          type="button"
          onClick={togglePasswordVisibility}
          disabled={disabled}
          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          className={styles.actionButton}
        >
          {showPassword ? (
            <EyeSlash size={20} weight="regular" />
          ) : (
            <Eye size={20} weight="regular" />
          )}
        </button>
      </div>

      {/* Strength Meter */}
      {showStrengthMeter && hasValue && (
        <div className={styles.strengthMeter}>
          <div className={styles.strengthBar}>
            {[0, 1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className={styles.strengthSegment}
                style={{
                  backgroundColor: level <= score ? getStrengthColor(score) : 'var(--semantic-border-secondary)',
                }}
              />
            ))}
          </div>
          <div className={styles.strengthInfo}>
            <span 
              className={styles.strengthLabel}
              style={{ color: getStrengthColor(score) }}
            >
              {getStrengthLabel(score)}
            </span>
          </div>
        </div>
      )}
      
      {helperText && (
        <p className={error || isTooWeak ? styles.helperError : styles.helper}>
          {helperText}
        </p>
      )}
    </div>
  );
});

PasswordInput.displayName = 'PasswordInput';
