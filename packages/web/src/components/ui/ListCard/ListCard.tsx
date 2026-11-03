/**
 * ListCard — default stacked card for a list of items with an action.
 *
 * Anatomy: icon tile | title + description | trailing action.
 * Use for settings, login methods, apps, or any similar card list.
 * Not for TaskItem, sidebar ListItem / CategoryRow, or WhatsNewCard.
 *
 * Pass `onClick` to make the whole row open the item (e.g. a note). The
 * trailing `action` keeps its own behavior and never triggers `onClick`.
 */

import { useId, useRef } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import styles from './ListCard.module.css';

export interface ListCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
  as?: 'div' | 'li';
  className?: string;
  /** Makes the whole row interactive (button semantics, Enter/Space, hover) */
  onClick?: () => void;
  /** Keeps the description on one line, ending in an ellipsis */
  truncateDescription?: boolean;
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
  onClick,
  truncateDescription = false,
}: ListCardProps) {
  const titleId = useId();
  const descriptionId = useId();
  const actionRef = useRef<HTMLDivElement>(null);
  const isInteractive = !!onClick;

  const handleClick = (e: MouseEvent<HTMLElement>) => {
    if (!onClick) return;
    const target = e.target as Node;
    // React bubbles events from portals (e.g. a Dropdown opened by the action)
    // through this row; only react to clicks that are really inside it.
    if (!e.currentTarget.contains(target)) return;
    if (actionRef.current?.contains(target)) return;
    onClick();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!onClick) return;
    // Only when the row's button area itself is focused
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const rowClassName = [styles.row, isInteractive ? styles.rowInteractive : '', className]
    .filter(Boolean)
    .join(' ');

  // Mouse: the whole row is the click target. Keyboard / assistive tech: the
  // info area is the button, so the row keeps its list-item semantics (`as="li"`)
  // and the trailing action is not nested inside a button.
  return (
    <Component
      className={rowClassName}
      onClick={isInteractive ? handleClick : undefined}
    >
      <div
        className={isInteractive ? `${styles.info} ${styles.infoInteractive}` : styles.info}
        {...(isInteractive
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-labelledby': titleId,
              'aria-describedby': descriptionId,
              onKeyDown: handleKeyDown,
            }
          : {})}
      >
        <div className={styles.icon}>{icon}</div>
        <div className={styles.details}>
          <p id={isInteractive ? titleId : undefined} className={styles.title}>{title}</p>
          <p
            id={isInteractive ? descriptionId : undefined}
            className={
              truncateDescription
                ? `${styles.description} ${styles.descriptionTruncate}`
                : styles.description
            }
          >
            {description}
          </p>
        </div>
      </div>
      <div ref={actionRef} className={styles.action}>{action}</div>
    </Component>
  );
}
