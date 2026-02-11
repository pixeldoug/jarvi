/**
 * UpgradeButton Component - Jarvi Web
 * 
 * Special button for upgrade/subscription CTA
 * Uses brand colors with gradient and premium styling
 * 
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-Web
 * Node: 40000082-12814
 */

import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkle } from '@phosphor-icons/react';
import styles from './UpgradeButton.module.css';

export interface UpgradeButtonProps {
  /** Button label text */
  label?: string;
  /** Show PRO badge */
  showBadge?: boolean;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Full width button */
  fullWidth?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Custom click handler (overrides default navigation) */
  onClick?: () => void;
  /** Custom navigation path */
  to?: string;
  /** Additional CSS classes */
  className?: string;
}

export function UpgradeButton({
  label = 'Upgrade',
  showBadge = false,
  size = 'medium',
  fullWidth = false,
  disabled = false,
  loading = false,
  onClick,
  to = '/subscribe',
  className = '',
}: UpgradeButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = () => {
    if (disabled || loading) return;
    
    if (onClick) {
      onClick();
    } else {
      if (to.startsWith('/subscribe')) {
        navigate(to, { state: { backgroundLocation: location } });
      } else {
        navigate(to);
      }
    }
  };

  // Build class names
  const buttonClasses = [
    styles.button,
    size === 'small' && styles.sizeSmall,
    size === 'medium' && styles.sizeMedium,
    size === 'large' && styles.sizeLarge,
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
    loading && styles.loading,
    className,
  ]
    .filter(Boolean)
    .join(' ');

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
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        opacity="0.25"
      />
      <path
        fill="currentColor"
        opacity="0.75"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  const iconSize = size === 'small' ? 14 : size === 'large' ? 20 : 16;

  return (
    <button
      type="button"
      className={buttonClasses}
      disabled={disabled || loading}
      onClick={handleClick}
      aria-label={`${label} - Upgrade to Pro`}
    >
      {loading ? (
        renderSpinner()
      ) : (
        <>
          <Sparkle 
            size={iconSize} 
            weight="fill" 
            className={styles.icon}
            aria-hidden="true"
          />
          <span className={styles.label}>{label}</span>
          {showBadge && <span className={styles.badge}>PRO</span>}
        </>
      )}
    </button>
  );
}
