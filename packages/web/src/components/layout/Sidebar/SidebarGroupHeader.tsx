/**
 * SidebarGroupHeader Component
 *
 * Collapsible group header row used inside the Sidebar for the "Categorias"
 * and "Chats" sections. Shows a label + caret; on hover reveals the group's
 * actions (e.g. Chats: novo chat, buscar, expandir) and an optional add (+)
 * action button.
 *
 * Figma: https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001332-124364
 */

import { type RefObject } from 'react';
import { CaretDown, Plus, type Icon } from '@phosphor-icons/react';
import { Button, Tooltip } from '../../ui';
import styles from './SidebarGroupHeader.module.css';

export interface SidebarGroupHeaderAction {
  icon: Icon;
  label: string;
  onClick: () => void;
}

export interface SidebarGroupHeaderProps {
  label: string;
  isExpanded: boolean;
  onToggle: () => void;
  /** Show the + action button on hover */
  showAddButton?: boolean;
  onAdd?: () => void;
  /** The + button's wrapper (an anchor for popovers) */
  addButtonRef?: RefObject<HTMLSpanElement>;
  /** Icon buttons revealed on hover, before the + button */
  actions?: SidebarGroupHeaderAction[];
  /** Keep the actions shown, not only on hover */
  actionsVisible?: boolean;
}

export function SidebarGroupHeader({
  label,
  isExpanded,
  onToggle,
  showAddButton,
  onAdd,
  addButtonRef,
  actions,
  actionsVisible,
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

      {actions && actions.length > 0 && (
        <div className={styles.actions} data-visible={actionsVisible || undefined}>
          {actions.map(({ icon: ActionIcon, label: actionLabel, onClick }) => (
            <Tooltip key={actionLabel} label={actionLabel} position="top" showDelay={300}>
              <Button
                variant="ghost"
                size="small"
                icon={ActionIcon}
                iconPosition="icon-only"
                aria-label={actionLabel}
                onClick={onClick}
              />
            </Tooltip>
          ))}
        </div>
      )}

      {showAddButton && (
        <span ref={addButtonRef} className={styles.addButton}>
          <Tooltip label={`Adicionar em ${label}`} position="top" showDelay={300}>
            <Button
              variant="ghost"
              size="small"
              icon={Plus}
              iconPosition="icon-only"
              aria-label={`Adicionar em ${label}`}
              onClick={onAdd}
            />
          </Tooltip>
        </span>
      )}
    </div>
  );
}
