/**
 * ListCard — default stacked card for a list of items with an action.
 *
 * Anatomy: icon tile | title + description | trailing action.
 * Use for settings, login methods, apps, or any similar card list.
 * Not for TaskItem, sidebar ListItem / CategoryRow, or WhatsNewCard.
 */

import type { ReactNode } from 'react';
import styles from './ListCard.module.css';

export interface ListCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
  as?: 'div' | 'li';
  className?: string;
}

export function ListCardGroup({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <ul className={`${styles.list} ${className}`.trim()}>{children}</ul>;
}

export function ListCard({
  icon,
  title,
  description,
  action,
  as: Component = 'div',
  className = '',
}: ListCardProps) {
  return (
    <Component className={`${styles.row} ${className}`.trim()}>
      <div className={styles.info}>
        <div className={styles.icon}>{icon}</div>
        <div className={styles.details}>
          <p className={styles.title}>{title}</p>
          <p className={styles.description}>{description}</p>
        </div>
      </div>
      <div className={styles.action}>{action}</div>
    </Component>
  );
}
