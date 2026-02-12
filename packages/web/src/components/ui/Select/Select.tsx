/**
 * Select Component - Jarvi Web
 *
 * Select component using CSS Modules and design tokens
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, type IconProps } from '@phosphor-icons/react';
import styles from './Select.module.css';
import { Dropdown } from '../Dropdown/Dropdown';
import { ListItem } from '../ListItem';

// ============================================================================
// TYPES
// ============================================================================

export interface SelectOption {
  value: string;
  label: string;
}

type PhosphorIcon = React.ComponentType<IconProps>;

export interface SelectProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLSelectElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLSelectElement>) => void;
  className?: string;
  error?: boolean;
  helperText?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  options: SelectOption[];
  placeholder?: string;
  /** Force dropdown token theme */
  dropdownTheme?: 'light' | 'dark';
  /** Optional icon displayed on each dropdown option */
  optionIcon?: PhosphorIcon;
  /** Optional section rendered below dropdown options */
  dropdownButtonSection?: React.ReactNode;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Select({
  id,
  name,
  value,
  defaultValue,
  required = false,
  disabled = false,
  onChange,
  onBlur,
  onFocus,
  className = '',
  error = false,
  helperText,
  label,
  size = 'md',
  options,
  placeholder,
  dropdownTheme,
  optionIcon: OptionIcon,
  dropdownButtonSection,
}: SelectProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isControlled = value !== undefined;
  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue ?? (placeholder ? '' : options[0]?.value ?? '')
  );

  useEffect(() => {
    if (!isOpen) return;
    if (disabled || options.length === 0) {
      setIsOpen(false);
    }
  }, [disabled, isOpen, options.length]);

  useEffect(() => {
    if (isControlled) return;

    if (defaultValue !== undefined) {
      setInternalValue(defaultValue);
      return;
    }

    if (options.length === 0) {
      setInternalValue('');
      return;
    }

    const hasCurrentValue = options.some((option) => option.value === internalValue);

    if (!hasCurrentValue) {
      setInternalValue(placeholder ? '' : options[0].value);
    }
  }, [defaultValue, internalValue, isControlled, options, placeholder]);

  const selectedValue = isControlled ? (value ?? '') : internalValue;
  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue),
    [options, selectedValue]
  );
  const shouldShowPlaceholder = !selectedOption && Boolean(placeholder);

  const selectClasses = [
    styles.select,
    styles[size],
    isOpen && styles.open,
    disabled && styles.disabled,
    error && styles.error,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const emitChange = (nextValue: string) => {
    if (!isControlled) {
      setInternalValue(nextValue);
    }

    if (!onChange) return;

    const target = {
      value: nextValue,
      name: name ?? '',
      id: id ?? '',
    } as HTMLSelectElement;

    const syntheticEvent = {
      target,
      currentTarget: target,
    } as React.ChangeEvent<HTMLSelectElement>;

    onChange(syntheticEvent);
  };

  const handleSelectOption = (optionValue: string) => {
    emitChange(optionValue);
    setIsOpen(false);
  };

  const handleFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    onFocus?.(e as unknown as React.FocusEvent<HTMLSelectElement>);
  };

  const handleBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
    onBlur?.(e as unknown as React.FocusEvent<HTMLSelectElement>);
  };

  const displayText = selectedOption?.label ?? placeholder ?? '';
  const dropdownWidth = triggerRef.current?.offsetWidth ?? 256;

  return (
    <div className={styles.wrapper}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}

      <button
        ref={triggerRef}
        type="button"
        id={id}
        name={name}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={id ? `${id}-options` : undefined}
        aria-invalid={error}
        aria-required={required}
        disabled={disabled}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={() => setIsOpen((prev) => !prev)}
        className={selectClasses}
      >
        <span className={[styles.value, shouldShowPlaceholder && styles.placeholder].filter(Boolean).join(' ')}>
          {displayText}
        </span>
        <span className={[styles.icon, isOpen && styles.iconOpen].filter(Boolean).join(' ')}>
          <CaretDown size={16} weight="regular" />
        </span>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={triggerRef}
        width={dropdownWidth}
        forceTheme={dropdownTheme}
        buttonSection={dropdownButtonSection}
      >
        <div
          id={id ? `${id}-options` : undefined}
          className={styles.options}
          role="listbox"
          aria-label={label}
        >
          {options.map((option) => {
            const isSelected = option.value === selectedValue;

            return (
              <ListItem
                key={option.value}
                label={option.label}
                icon={OptionIcon}
                active={isSelected}
                onClick={() => handleSelectOption(option.value)}
                buttonProps={{
                  role: 'option',
                  'aria-selected': isSelected,
                }}
              />
            );
          })}
        </div>
      </Dropdown>

      {helperText && <p className={error ? styles.helperError : styles.helper}>{helperText}</p>}
    </div>
  );
}
