/**
 * ControlBarToggleButton — one button of the ControlBar's dark segmented
 * group (AI mode / task mode). Exported so a page's control placed in that
 * group (the `leading` slot, e.g. Notes recording) shares the exact look.
 *
 * Icon-only by default (40×40); with `children` it widens into a pill.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './ControlBar.module.css';

export interface ControlBarToggleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected look (raised, full opacity) */
  active?: boolean;
  /** 18px Phosphor icon element */
  icon?: ReactNode;
  children?: ReactNode;
}

export const ControlBarToggleButton = forwardRef<HTMLButtonElement, ControlBarToggleButtonProps>(
  function ControlBarToggleButton({ active = false, icon, children, className, type = 'button', ...rest }, ref) {
    const classes = [
      styles.toggleButton,
      active ? styles.toggleButtonActive : '',
      children ? styles.toggleButtonWide : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button ref={ref} type={type} className={classes} {...rest}>
        {icon}
        {children}
      </button>
    );
  },
);
