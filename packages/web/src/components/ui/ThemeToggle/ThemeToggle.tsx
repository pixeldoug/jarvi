/**
 * ThemeToggle Component - Jarvi Web
 *
 * Custom pill-shaped toggle for switching between light and dark modes.
 * Uses custom SVG icons from the Jarvi design system.
 *
 * Figma: https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001384-86158
 */

import { useTheme } from '../../../contexts/ThemeContext';
import styles from './ThemeToggle.module.css';

// ── Inline SVG icons from Figma design system ─────────────────────────────

function MoonIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 15.9896 15.9896"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M13.9909 8.52112C13.8861 9.65518 13.4605 10.7359 12.7638 11.6369C12.0672 12.5379 11.1284 13.2219 10.0573 13.6088C8.98609 13.9957 7.82689 14.0696 6.71529 13.8217C5.60369 13.5739 4.58568 13.0146 3.78035 12.2092C2.97503 11.4039 2.41572 10.3859 2.16786 9.27429C1.92 8.16269 1.99384 7.00349 2.38076 5.93233C2.76767 4.86117 3.45164 3.92236 4.35264 3.22573C5.25364 2.52911 6.3344 2.1035 7.46847 1.9987C6.80451 2.89696 6.48501 4.00369 6.56808 5.11761C6.65114 6.23153 7.13126 7.27863 7.92111 8.06848C8.71095 8.85832 9.75806 9.33844 10.872 9.42151C11.9859 9.50458 13.0926 9.18507 13.9909 8.52112Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 15.9896 15.9896"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="7.99479"
        cy="7.99479"
        r="2.66493"
        stroke="currentColor"
        strokeWidth="1.33247"
      />
      <path
        d="M7.99479 1.33247V2.66493M7.99479 13.3247V14.6571M3.28453 3.28453L4.22391 4.22391M11.7657 11.7657L12.7051 12.7051M1.33247 7.99479H2.66493M13.3247 7.99479H14.6571M3.28453 12.7051L4.22391 11.7657M11.7657 4.22391L12.7051 3.28453"
        stroke="currentColor"
        strokeWidth="1.33247"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export interface ThemeToggleProps {
  /** When true renders the compact (28 px) single-knob variant for the collapsed sidebar */
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      className={[
        styles.track,
        compact ? styles.compact : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-dark={isDark || undefined}
      onClick={toggleTheme}
    >
      <span className={styles.knob}>
        {isDark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}
