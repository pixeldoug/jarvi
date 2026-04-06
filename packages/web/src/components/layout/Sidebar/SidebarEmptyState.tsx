/**
 * SidebarEmptyState Component
 *
 * Empty state displayed inside a Sidebar group (Categorias / Filtros) when
 * there are no items yet.
 *
 * Figma: https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001337-180505
 */

import { Ghost } from '@phosphor-icons/react';
import { Button } from '../../ui/Button/Button';
import styles from './SidebarEmptyState.module.css';

export interface SidebarEmptyStateProps {
  description: string;
  buttonLabel: string;
  onButtonClick?: () => void;
}

export function SidebarEmptyState({
  description,
  buttonLabel,
  onButtonClick,
}: SidebarEmptyStateProps) {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <Ghost size={20} weight="regular" />
          <p className={styles.title}>Nada por aqui ainda</p>
        </div>
        <p className={styles.description}>{description}</p>
      </div>

      <Button
        variant="secondary"
        size="small"
        fullWidth
        onClick={onButtonClick}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
