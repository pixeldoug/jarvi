/**
 * TaskEmptyState Component
 *
 * Full-page empty state for task views following the JarviDS design system.
 * Shows a ghost illustration with a title and optional description.
 */

import { Ghost } from '@phosphor-icons/react';
import styles from './EmptyState.module.css';

export interface TaskEmptyStateProps {
  title?: string;
  description?: string;
  className?: string;
}

export function TaskEmptyState({
  title = 'Nada por aqui ainda',
  description,
  className,
}: TaskEmptyStateProps) {
  return (
    <div className={[styles.container, className].filter(Boolean).join(' ')}>
      <div className={styles.illustration}>
        <Ghost size={32} className={styles.iconDim} weight="regular" aria-hidden="true" />
        <Ghost size={48} className={styles.iconMain} weight="regular" aria-hidden="true" />
        <Ghost size={32} className={styles.iconDim} weight="regular" aria-hidden="true" />
      </div>
      <div className={styles.header}>
        <p className={styles.title}>{title}</p>
        {description && <p className={styles.description}>{description}</p>}
      </div>
    </div>
  );
}
