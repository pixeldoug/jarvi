/**
 * SidebarUserMenu Component
 *
 * User row inside the Sidebar: avatar + name + plan label.
 * Handles default, hover, and active (dropdown open) visual states.
 *
 * Figma: https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001333-124555
 */

import { forwardRef } from 'react';
import { Avatar } from '../../ui/Avatar/Avatar';
import styles from './SidebarUserMenu.module.css';

export interface SidebarUserMenuProps {
  /** Avatar image URL */
  src?: string | null;
  /** User display name */
  name: string;
  /** Plan label shown below the name */
  plan: string;
  /** Whether the dropdown is open (active visual state) */
  isActive?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Additional CSS class */
  className?: string;
}

export const SidebarUserMenu = forwardRef<HTMLButtonElement, SidebarUserMenuProps>(
  function SidebarUserMenu(
    { src, name, plan, isActive = false, onClick, className = '' },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        className={[styles.button, isActive ? styles.active : '', className]
          .filter(Boolean)
          .join(' ')}
        onClick={onClick}
        aria-expanded={isActive}
        aria-haspopup="menu"
      >
        <Avatar src={src} name={name} size="medium" />
        <div className={styles.details}>
          <p className={styles.name}>{name}</p>
          <p className={styles.plan}>{plan}</p>
        </div>
      </button>
    );
  },
);
