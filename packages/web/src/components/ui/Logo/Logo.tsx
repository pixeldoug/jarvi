/**
 * Logo Component - Jarvi Web
 * 
 * Brand logo component following JarviDS design system
 */

import styles from './Logo.module.css';
import jarviLogo from '../../../assets/logo/symbol.svg';

// ============================================================================
// TYPES
// ============================================================================

export interface LogoProps {
  /**
   * Additional CSS classes
   */
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Logo({ className = '' }: LogoProps) {
  const logoClasses = [styles.logo, className].filter(Boolean).join(' ');

  return (
    <div className={logoClasses} aria-label="Jarvi">
      <img src={jarviLogo} alt="Jarvi logo" className={styles.icon} />
    </div>
  );
}
