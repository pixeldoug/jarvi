/**
 * Button Component - Jarvi Web
 * 
 * Button component following Figma design system specs
 * Uses CSS Modules and design tokens
 * 
 * Variants: primary, secondary, ghost, destructive
 * Sizes: small, medium
 * Icon positions: none, left, right, icon-only
 * States: default, hover, focus, active, disabled
 */

import React from 'react';
import { IconProps } from '@phosphor-icons/react';
import { formatKeyboardShortcut } from '../../../lib/utils';
import styles from './Button.module.css';

const ICON_SIZE_VARIABLES = {
  sm: '--size-icon-sm',
  md: '--size-icon-md',
} as const;

type IconSizeVariant = keyof typeof ICON_SIZE_VARIABLES;

const ICON_SIZE_FALLBACK: Record<IconSizeVariant, number> = {
  sm: 16,
  md: 20,
};

function resolveIconSize(variant: IconSizeVariant): number {
  if (typeof window === 'undefined') {
    return ICON_SIZE_FALLBACK[variant];
  }

  const computed = getComputedStyle(document.documentElement).getPropertyValue(
    ICON_SIZE_VARIABLES[variant]
  );

  const parsed = parseFloat(computed);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return ICON_SIZE_FALLBACK[variant];
}

// ============================================================================
// TYPES
// ============================================================================

type PhosphorIcon = React.ComponentType<IconProps>;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'small' | 'medium';
  icon?: PhosphorIcon;
  iconPosition?: 'none' | 'left' | 'right' | 'icon-only';
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** Whether the button is in active state (e.g., when a dropdown is open) */
  active?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  'aria-label'?: string;
  shortcut?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Button({
  children,
  variant = 'primary',
  size = 'medium',
  icon: Icon,
  iconPosition = 'none',
  fullWidth = false,
  disabled = false,
  loading = false,
  active = false,
  className = '',
  type = 'button',
  'aria-label': ariaLabel,
  shortcut,
  ...rest
}: ButtonProps) {
  // Validation for icon-only
  if (iconPosition === 'icon-only' && !ariaLabel) {
    console.warn('Button: icon-only variant requires aria-label for accessibility');
  }

  // If no children, force icon-only
  const actualIconPosition = !children && Icon ? 'icon-only' : iconPosition;

  // Build class names
  const buttonClasses = [
    styles.button,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    actualIconPosition !== 'none' && styles[`icon-${actualIconPosition}`],
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
    loading && styles.loading,
    active && styles.active,
    shortcut && styles.hasShortcut,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Icon size logic based on button size and icon position
  // - size=small + icon!=icon-only: 16px (sm)
  // - everything else: 20px (md)
  const iconSizeVariant: IconSizeVariant =
    size === 'small' && actualIconPosition !== 'icon-only' ? 'sm' : 'md';
  const iconSize = resolveIconSize(iconSizeVariant);

  // Render icon
  const renderIcon = () => {
    if (!Icon) return null;

    return (
    <Icon
      size={iconSize}
        className={styles.icon}
        aria-hidden="true"
        weight="regular"
      />
    );
  };

  // Loading spinner
  const renderSpinner = () => (
    <svg
      className={styles.spinner}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className={styles.spinnerCircle}
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className={styles.spinnerPath}
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  return (
    <button
      type={type}
      className={buttonClasses}
      disabled={disabled || loading}
      aria-label={actualIconPosition === 'icon-only' ? ariaLabel : undefined}
      {...rest}
    >
      {loading ? (
        <>
          {renderSpinner()}
          {actualIconPosition !== 'icon-only' && <span className={styles.label}>{children}</span>}
        </>
      ) : (
        <>
          {(actualIconPosition === 'left' || actualIconPosition === 'icon-only') && renderIcon()}
          {actualIconPosition !== 'icon-only' && <span className={styles.label}>{children}</span>}
          {actualIconPosition === 'right' && renderIcon()}
          {shortcut && actualIconPosition !== 'icon-only' && (
            <span className={styles.shortcut}>{formatKeyboardShortcut(shortcut)}</span>
          )}
        </>
      )}
    </button>
  );
}

// ============================================================================
// VARIANT COMPONENTS (optional convenience exports)
// ============================================================================

export function PrimaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="secondary" />;
}

export function GhostButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="ghost" />;
}

export function DestructiveButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="destructive" />;
}

