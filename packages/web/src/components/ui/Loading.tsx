/**
 * Loading Spinner Component
 * Uses design tokens for styling
 */

import styles from './Loading.module.css';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  centered?: boolean;
}

export function Loading({ size = 'md', centered = false }: LoadingProps) {
  const containerClasses = [
    styles.container,
    centered && styles.centered,
  ].filter(Boolean).join(' ');

  const spinnerClasses = [
    styles.spinner,
    styles[size],
  ].join(' ');

  return (
    <div className={containerClasses}>
      <div className={spinnerClasses} role="status">
        <span className={styles.srOnly}>Loading...</span>
      </div>
    </div>
  );
}




















