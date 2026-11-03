/**
 * Skeleton Component - Jarvi Web
 *
 * Placeholder for content that is loading: a neutral surface with a soft
 * shimmer (static when the user prefers reduced motion). `Skeleton` is one
 * bar or block; `SkeletonText` is a paragraph of lines sized to a text style,
 * so the layout does not jump when the content arrives. Decorative: wrap them
 * in an element that announces the loading state (e.g. `role="status"`).
 */

import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

// ============================================================================
// TYPES
// ============================================================================

export interface SkeletonProps {
  /**
   * `line`: a rounded bar (text); `block`: a box with the small radius
   * @default 'line'
   */
  shape?: 'line' | 'block';
  /** CSS width (number = px) @default '100%' */
  width?: number | string;
  /** CSS height (number = px); a line defaults to the body text size */
  height?: number | string;
  className?: string;
}

export interface SkeletonTextProps {
  /** Number of lines @default 3 */
  lines?: number;
  /**
   * Text style the lines stand for (line height and bar thickness)
   * @default 'body'
   */
  variant?: 'body' | 'heading';
  /** Width of each line, in order; the last value repeats @default ['100%', …, '60%'] */
  widths?: Array<number | string>;
  className?: string;
}

// ============================================================================
// COMPONENTS
// ============================================================================

const toCss = (value: number | string | undefined) => (typeof value === 'number' ? `${value}px` : value);

export function Skeleton({ shape = 'line', width = '100%', height, className = '' }: SkeletonProps) {
  const style: CSSProperties = { width: toCss(width), ...(height !== undefined ? { height: toCss(height) } : {}) };
  return <span className={[styles.skeleton, styles[shape], className].filter(Boolean).join(' ')} style={style} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3, variant = 'body', widths, className = '' }: SkeletonTextProps) {
  const lineWidths = widths ?? Array.from({ length: lines }, (_, i) => (i === lines - 1 && lines > 1 ? '60%' : '100%'));
  return (
    <span className={[styles.text, styles[variant], className].filter(Boolean).join(' ')} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={styles.textLine}>
          <Skeleton width={lineWidths[Math.min(i, lineWidths.length - 1)]} />
        </span>
      ))}
    </span>
  );
}
