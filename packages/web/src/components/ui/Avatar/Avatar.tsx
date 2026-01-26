/**
 * Avatar Component - Jarvi Web
 * 
 * Reusable avatar component with size variants
 * Following JarviDS design system from Figma
 * 
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-Web
 * Node: 40000223-14354
 */

import { useState, useEffect } from 'react';
import styles from './Avatar.module.css';

export interface AvatarProps {
  /** Image source URL */
  src?: string | null;
  /** User name for generating initials fallback */
  name: string;
  /** Avatar size */
  size?: 'medium' | 'large';
  /** Additional CSS classes */
  className?: string;
  /** Alt text for the image */
  alt?: string;
}

/**
 * Get initials from a name
 * @param name - Full name
 * @returns Initials (1-2 characters)
 */
const getInitials = (name: string): string => {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export function Avatar({
  src,
  name,
  size = 'medium',
  className = '',
  alt,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  // Reset error state when src changes
  useEffect(() => {
    setImageError(false);
  }, [src]);

  const showImage = src && !imageError;
  const initials = getInitials(name);

  const containerClasses = [
    styles.avatar,
    styles[size],
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {showImage ? (
        <img
          src={src}
          alt={alt || name}
          className={styles.image}
          onError={() => setImageError(true)}
        />
      ) : (
        <div className={styles.fallback}>
          {initials}
        </div>
      )}
    </div>
  );
}
