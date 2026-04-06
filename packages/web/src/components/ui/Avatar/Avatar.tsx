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
import { getGenderFromName } from '../../../utils/gender';
import avatarFemale from '../../../assets/avatars/avatar-female.avif';
import avatarMale from '../../../assets/avatars/avatar-male.avif';
import styles from './Avatar.module.css';

export interface AvatarProps {
  /** Image source URL */
  src?: string | null;
  /** User name for selecting the default avatar */
  name: string;
  /** Avatar size */
  size?: 'small' | 'medium' | 'large';
  /** Additional CSS classes */
  className?: string;
  /** Alt text for the image */
  alt?: string;
}

export function Avatar({
  src,
  name,
  size = 'small',
  className = '',
  alt,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [src]);

  const showImage = src && !imageError;
  const defaultAvatar = getGenderFromName(name) === 'female' ? avatarFemale : avatarMale;

  const containerClasses = [
    styles.avatar,
    styles[size],
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      <img
        src={showImage ? src : defaultAvatar}
        alt={alt || name}
        className={styles.image}
        onError={showImage ? () => setImageError(true) : undefined}
      />
    </div>
  );
}
