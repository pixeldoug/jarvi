/**
 * OtpInput Component - Jarvi Web
 *
 * Apple-like OTP input (multiple boxes) aligned with JarviDS tokens.
 * - Numeric-only
 * - Auto-advance
 * - Backspace navigation
 * - Paste support
 * - Calls onComplete when filled
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './OtpInput.module.css';

export interface OtpInputProps {
  /** Label text */
  label?: string;
  /** Whether to show the label */
  showLabel?: boolean;
  /** Controlled value (digits only) */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** OTP length */
  length?: number;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Whether input is in error state */
  error?: boolean;
  /** Helper text below the input */
  helperText?: string;
  /** Additional CSS classes */
  className?: string;
}

function normalizeDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function OtpInput({
  label,
  showLabel = true,
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  error = false,
  helperText,
  className = '',
}: OtpInputProps & { onComplete?: (value: string) => void }) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const digits = useMemo(() => {
    const normalized = normalizeDigits(value).slice(0, length);
    const arr = Array.from({ length }, (_, i) => normalized[i] ?? '');
    return { normalized, arr };
  }, [value, length]);

  // Keep external value normalized
  useEffect(() => {
    if (value !== digits.normalized) {
      onChange(digits.normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits.normalized]);

  const setFocus = (idx: number) => {
    const el = inputRefs.current[idx];
    if (!el) return;
    el.focus();
    // Select helps overwrite on iOS/desktop.
    try {
      el.select();
    } catch {
      // ignore
    }
  };

  const commitDigitsFromIndex = (startIndex: number, nextDigits: string) => {
    const cleaned = normalizeDigits(nextDigits);
    if (!cleaned) return;

    const before = digits.arr.slice(0, startIndex).join('');
    const after = digits.arr.slice(startIndex + cleaned.length).join('');
    const combined = (before + cleaned + after).slice(0, length);
    onChange(combined);

    const nextFocus = Math.min(startIndex + cleaned.length, length - 1);
    setFocus(nextFocus);

    if (combined.length === length) {
      onComplete?.(combined);
    }
  };

  const handleCellChange = (idx: number, raw: string) => {
    if (disabled) return;

    const cleaned = normalizeDigits(raw);

    // If user typed/pasted multiple digits into a single cell (common with OTP autofill),
    // distribute them starting at this index.
    if (cleaned.length > 1) {
      commitDigitsFromIndex(idx, cleaned);
      return;
    }

    const nextArr = [...digits.arr];
    nextArr[idx] = cleaned.slice(0, 1);
    const combined = nextArr.join('').slice(0, length);
    onChange(combined);

    if (cleaned && idx < length - 1) {
      setFocus(idx + 1);
    }

    if (combined.length === length) {
      onComplete?.(combined);
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Enter') {
      const combined = digits.arr.join('');
      if (combined.length === length) {
        e.preventDefault();
        onComplete?.(combined);
      }
      return;
    }

    if (e.key === 'Backspace') {
      const hasValue = digits.arr[idx] !== '';
      if (hasValue) {
        const nextArr = [...digits.arr];
        nextArr[idx] = '';
        onChange(nextArr.join(''));
        return;
      }

      if (!hasValue && idx > 0) {
        e.preventDefault();
        const nextArr = [...digits.arr];
        nextArr[idx - 1] = '';
        onChange(nextArr.join(''));
        setFocus(idx - 1);
      }
      return;
    }

    if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      setFocus(idx - 1);
      return;
    }

    if (e.key === 'ArrowRight' && idx < length - 1) {
      e.preventDefault();
      setFocus(idx + 1);
      return;
    }
  };

  const handlePaste = (idx: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    commitDigitsFromIndex(idx, text);
  };

  const wrapperClasses = [styles.wrapper, className].filter(Boolean).join(' ');
  const rowClasses = [
    styles.row,
    disabled && styles.disabled,
  ].filter(Boolean).join(' ');

  return (
    <div className={wrapperClasses}>
      {showLabel && label && (
        <label className={styles.label}>
          {label}
        </label>
      )}

      <div className={rowClasses} aria-label={label ?? 'Código'}>
        {digits.arr.map((d, idx) => {
          const cellClasses = [
            styles.cell,
            (focusedIndex === idx) && styles.focused,
            error && styles.error,
          ].filter(Boolean).join(' ');

          return (
            <div key={idx} className={cellClasses}>
              <input
                ref={(el) => { inputRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                value={d}
                disabled={disabled}
                onChange={(e) => handleCellChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={(e) => handlePaste(idx, e)}
                onFocus={(e) => {
                  setFocusedIndex(idx);
                  // Select helps overwrite on iOS/desktop.
                  try {
                    e.currentTarget.select();
                  } catch {
                    // ignore
                  }
                }}
                onBlur={() => setFocusedIndex((curr) => (curr === idx ? null : curr))}
                aria-label={`${label ?? 'Código'} - dígito ${idx + 1}`}
                className={styles.input}
              />
            </div>
          );
        })}
      </div>

      {helperText && (
        <p className={error ? styles.helperError : styles.helper}>
          {helperText}
        </p>
      )}
    </div>
  );
}

