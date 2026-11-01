/**
 * NoteEmptyState — icon tile (or an illustration) + title + description
 * (+ optional action). Used by the notes list, the summary / transcript tabs
 * and the 404 state.
 */

import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import styles from './NoteEmptyState.module.css';

export interface NoteEmptyStateIllustration {
  src: string;
  /** 2x density source */
  src2x?: string;
  /** Rendered size (CSS px), reserved up front so nothing shifts on load */
  width: number;
  height: number;
}

export interface NoteEmptyStateProps {
  icon: Icon;
  /** Replaces the icon tile (decorative: empty alt) */
  illustration?: NoteEmptyStateIllustration;
  /** Omit for a single line of text (`description` only) */
  title?: string;
  description?: string;
  /** Usually a DS Button */
  action?: ReactNode;
  /** Helper text under the action (e.g. why it is disabled) */
  helper?: string;
  /** Smaller vertical footprint for use inside a tab */
  compact?: boolean;
}

export function NoteEmptyState({
  icon: IconComponent,
  illustration,
  title,
  description,
  action,
  helper,
  compact = false,
}: NoteEmptyStateProps) {
  return (
    <div className={`${styles.container}${compact ? ` ${styles.compact}` : ''}`}>
      {illustration ? (
        <img
          className={styles.illustration}
          src={illustration.src}
          srcSet={illustration.src2x ? `${illustration.src} 1x, ${illustration.src2x} 2x` : undefined}
          width={illustration.width}
          height={illustration.height}
          alt=""
          decoding="async"
          draggable={false}
        />
      ) : (
        <div className={styles.iconTile} aria-hidden="true">
          <IconComponent size={24} weight="regular" />
        </div>
      )}
      <div className={styles.text}>
        {title && <p className={styles.title}>{title}</p>}
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
      {helper && <p className={styles.helper}>{helper}</p>}
    </div>
  );
}
