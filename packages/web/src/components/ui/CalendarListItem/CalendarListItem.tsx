import styles from './CalendarListItem.module.css';

export type CalendarListItemState = 'active' | 'default';

export interface CalendarListItemProps {
  /** Day label, e.g. "Seg 30" or "Qua 2" */
  label: string;
  state?: CalendarListItemState;
  onClick?: () => void;
  className?: string;
}

/**
 * CalendarListItem – a day tab used in calendar navigation bars.
 *
 * Active state shows a solid purple bottom border and purple text;
 * default state shows a dashed border and primary text color.
 */
export function CalendarListItem({
  label,
  state = 'default',
  onClick,
  className,
}: CalendarListItemProps) {
  const isActive = state === 'active';

  return (
    <button
      type="button"
      className={`${styles.item}${isActive ? ` ${styles.active}` : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-pressed={isActive}
    >
      <span className={styles.label}>{label}</span>
    </button>
  );
}
