/**
 * ListItem Component - Jarvi Web
 * 
 * Generic list item for sidebars
 * Following JarviDS design system from Figma
 */

import { ReactNode, ElementType, ButtonHTMLAttributes } from 'react';
import styles from './ListItem.module.css';

type ListItemButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'className' | 'onClick' | 'children'
> & {
  [key: `data-${string}`]: string | number | boolean | undefined;
};

export interface ListItemProps {
  /** Text label */
  label: string;
  /** Icon component (Phosphor icon) */
  icon?: ElementType;
  /** Custom icon node (supports non-Phosphor/custom styling) */
  iconNode?: ReactNode;
  /** Emoji as icon alternative */
  emoji?: string;
  /** Whether this item is active/selected */
  active?: boolean;
  /** Whether this item is disabled */
  disabled?: boolean;
  /** Counter number (e.g., task count) */
  counter?: number;
  /** Counter visual style */
  counterVariant?: 'text' | 'chip';
  /** Click handler */
  onClick?: () => void;
  /** Additional className */
  className?: string;
  /** Render as different element */
  as?: 'button' | 'div' | 'a';
  /** Extra button attributes when rendered as button */
  buttonProps?: ListItemButtonProps;
  /** Children for custom content */
  children?: ReactNode;
}

export function ListItem({
  label,
  icon: Icon,
  iconNode,
  emoji,
  active = false,
  disabled = false,
  counter,
  counterVariant = 'text',
  onClick,
  className = '',
  as: Component = 'button',
  buttonProps,
}: ListItemProps) {
  const itemClasses = [
    styles.listItem,
    active && styles.active,
    disabled && styles.disabled,
    className,
  ].filter(Boolean).join(' ');

  const content = (
    <>
      {/* Icon or Emoji */}
      {iconNode && (
        <span className={styles.icon}>
          {iconNode}
        </span>
      )}
      {Icon && !iconNode && (
        <span className={styles.icon}>
          <Icon size={16} weight="regular" />
        </span>
      )}
      {emoji && !Icon && !iconNode && (
        <span className={`${styles.icon} ${styles.emoji}`}>
          {emoji}
        </span>
      )}

      {/* Label */}
      <span className={styles.label}>{label}</span>

      {/* Counter */}
      {counter !== undefined && counter > 0 && (
        <span
          className={[
            styles.counter,
            counterVariant === 'chip' && styles.counterChip,
          ].filter(Boolean).join(' ')}
        >
          {counter}
        </span>
      )}
    </>
  );

  if (Component === 'button') {
    return (
      <button
        {...buttonProps}
        className={itemClasses}
        onClick={onClick}
        type="button"
        disabled={disabled}
      >
        {content}
      </button>
    );
  }

  return (
    <Component
      className={itemClasses}
      onClick={onClick}
    >
      {content}
    </Component>
  );
}

