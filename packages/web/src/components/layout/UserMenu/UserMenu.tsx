/**
 * UserMenu Component - Jarvi Web
 * 
 * User profile, upgrade button and theme toggle in the top right corner
 * Following JarviDS design system from Figma
 * 
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-Web
 * Node: 40000503-11686
 */

import { useState } from 'react';
import { Sun, Moon } from '@phosphor-icons/react';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import { UpgradeButton } from '../../ui/UpgradeButton/UpgradeButton';
import styles from './UserMenu.module.css';

export interface UserMenuProps {
  /** Additional className */
  className?: string;
}

export function UserMenu({ className = '' }: UserMenuProps) {
  const { toggleTheme, isDark } = useTheme();
  const { user } = useAuth();
  const { hasActiveSubscription, isLoading: isSubscriptionLoading } = useSubscription();
  const [imageError, setImageError] = useState(false);

  // Show upgrade button only if user doesn't have an active subscription
  const showUpgradeButton = !isSubscriptionLoading && !hasActiveSubscription;

  // Get user initials for avatar fallback
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const userName = user?.name || 'Usuário';
  const userEmail = user?.email || 'usuario@email.com';
  const userAvatar = user?.avatar;
  const showAvatarImage = userAvatar && !imageError;

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
        <button className={styles.profileContent} type="button">
          <div className={styles.userDetails}>
            <p className={styles.userName}>{userName}</p>
            <p className={styles.userEmail}>{userEmail}</p>
          </div>
          
          <div className={styles.avatar}>
            {showAvatarImage ? (
              <img 
                src={userAvatar} 
                alt={userName}
                className={styles.avatarImage}
                onError={() => setImageError(true)}
              />
            ) : (
              <div className={styles.avatarFallback}>
                {getInitials(userName)}
              </div>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}









