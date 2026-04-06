/**
 * SidebarGroupHeader Component
 *
 * Collapsible group header row used inside the Sidebar for "Categorias" and
 * "Filtros" sections. Shows a label + caret; on hover reveals an optional
 * add (+) action button.
 *
 * Figma: https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001332-124364
 */

import { type RefObject } from 'react';
import { CaretDown, Plus } from '@phosphor-icons/react';
import styles from './SidebarGroupHeader.module.css';

export interface SidebarGroupHeaderProps {
  label: string;
  isExpanded: boolean;
  onToggle: () => void;
  /** Show the + action button on hover */
  showAddButton?: boolean;
  onAdd?: () => void;
  addButtonRef?: RefObject<HTMLButtonElement>;
}

export function SidebarGroupHeader({
  label,
  isExpanded,
  onToggle,
  showAddButton,
  onAdd,
  addButtonRef,
}: SidebarGroupHeaderProps) {
  return (
    <div className={styles.header}>
      <button
        className={styles.toggle}
        onClick={onToggle}
        type="button"
        aria-expanded={isExpanded}
      >
        <span className={styles.label}>{label}</span>
        <span
          className={styles.chevron}
          style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        >
          <CaretDown size={12} weight="fill" />
        </span>
      </button>

      {showAddButton && (
        <button
          ref={addButtonRef}
          className={styles.addButton}
          onClick={onAdd}
          type="button"
          aria-label={`Adicionar em ${label}`}
        >
          <Plus size={12} weight="bold" />
        </button>
      )}
    </div>
  );
}
