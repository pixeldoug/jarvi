/**
 * UserMenu Component - Jarvi Web
 * 
 * User profile, upgrade button and theme toggle in the top right corner
 * Following JarviDS design system from Figma
 * 
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-Web
 * Node: 40000503-11686
 */

import { useState, useRef } from 'react';
import { Sun, Moon, Gear, SignOut } from '@phosphor-icons/react';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import { UpgradeButton } from '../../ui/UpgradeButton/UpgradeButton';
import { Avatar, Dropdown, ListItem } from '../../ui';
import styles from './UserMenu.module.css';

export interface UserMenuProps {
  /** Additional className */
  className?: string;
}

export function UserMenu({ className = '' }: UserMenuProps) {
  const { toggleTheme, isDark } = useTheme();
  const { user, logout } = useAuth();
  const { hasActiveSubscription, isLoading: isSubscriptionLoading } = useSubscription();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  // Show upgrade button only if user doesn't have an active subscription
  const showUpgradeButton = !isSubscriptionLoading && !hasActiveSubscription;

  const handleLogout = () => {
    setIsDropdownOpen(false);
    logout();
  };

  const handleMyAccount = () => {
    setIsDropdownOpen(false);
    // TODO: Navigate to account page
  };

  const userName = user?.name || 'Usuário';
  const userEmail = user?.email || 'usuario@email.com';
  const userAvatar = user?.avatar;

  return (
    <div className={`${styles.container} ${className}`}>
      {/* Upgrade Button - Only show if user doesn't have active subscription */}
      {showUpgradeButton && (
        <UpgradeButton size="medium" label="Upgrade" />
      )}

      {/* Theme Toggle */}
      <div className={styles.themeToggle}>
        <button
          className={styles.themeButton}
          onClick={toggleTheme}
          type="button"
          title={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        >
          {isDark ? (
            <Sun size={20} weight="regular" />
          ) : (
            <Moon size={20} weight="regular" />
          )}
        </button>
      </div>

      {/* User Profile */}
      <div className={styles.userProfile}>
        <button 
          ref={profileButtonRef}
          className={styles.profileContent} 
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          aria-expanded={isDropdownOpen}
          aria-haspopup="menu"
        >
          <div className={styles.userDetails}>
            <p className={styles.userName}>{userName}</p>
            <p className={styles.userEmail}>{userEmail}</p>
          </div>
          
          <Avatar src={userAvatar} name={userName} size="medium" />
        </button>

        {/* User Dropdown Menu */}
        <Dropdown
          isOpen={isDropdownOpen}
          onClose={() => setIsDropdownOpen(false)}
          anchorRef={profileButtonRef}
          align="right"
          width={200}
        >
          <ListItem 
            label="Minha Conta" 
            icon={Gear} 
            onClick={handleMyAccount} 
          />
          <ListItem 
            label="Sair" 
            icon={SignOut} 
            onClick={handleLogout} 
          />
        </Dropdown>
      </div>
    </div>
  );
}









