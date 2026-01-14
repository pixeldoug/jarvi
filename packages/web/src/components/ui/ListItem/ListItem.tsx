/**
 * ListItem Component - Jarvi Web
 * 
 * Generic list item for sidebars
 * Following JarviDS design system from Figma
 */

import { ReactNode, ElementType } from 'react';
import styles from './ListItem.module.css';

export interface ListItemProps {
  /** Text label */
  label: string;
  /** Icon component (Phosphor icon) */
  icon?: ElementType;
  /** Emoji as icon alternative */
  emoji?: string;
  /** Whether this item is active/selected */
  active?: boolean;
  /** Counter number (e.g., task count) */
  counter?: number;
  /** Click handler */
  onClick?: () => void;
  /** Additional className */
  className?: string;
  /** Render as different element */
  as?: 'button' | 'div' | 'a';
  /** Children for custom content */
  children?: ReactNode;
}

export function ListItem({
  label,
  icon: Icon,
  emoji,
  active = false,
  counter,
  onClick,
  className = '',
  as: Component = 'button',
}: ListItemProps) {
  const itemClasses = [
    styles.listItem,
    active && styles.active,
    className,
  ].filter(Boolean).join(' ');

  return (
    <Component
      className={itemClasses}
      onClick={onClick}
      type={Component === 'button' ? 'button' : undefined}
    >
      {/* Icon or Emoji */}
      {Icon && (
        <span className={styles.icon}>
          <Icon size={16} weight="regular" />
        </span>
      )}
      {emoji && !Icon && (
        <span className={`${styles.icon} ${styles.emoji}`}>
          {emoji}
        </span>
      )}

      {/* Label */}
      <span className={styles.label}>{label}</span>

      {/* Counter */}
      {counter !== undefined && counter > 0 && (
        <span className={styles.counter}>{counter}</span>
      )}
    </Component>
  );
}

