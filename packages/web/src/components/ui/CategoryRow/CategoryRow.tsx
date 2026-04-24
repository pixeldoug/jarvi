/**
 * CategoryRow Component - Jarvi Web
 *
 * Row for managing categories in settings.
 * Layout: [drag handle (hover)] [#] [label] ... [edit (hover)] [delete (hover)] [visibility]
 *
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App
 * Node: 40001344-4909
 */

import { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsSixVertical, Hash, PencilSimple, Trash, Eye, EyeSlash, type Icon } from '@phosphor-icons/react';
import { Tooltip } from '../Tooltip';
import styles from './CategoryRow.module.css';

export interface CategoryRowProps {
  id: string;
  label: string;
  /** Icon rendered before the label (defaults to Hash) */
  icon?: Icon;
  visible?: boolean;
  draggable?: boolean;
  /** Whether to render the visibility toggle button (default: true) */
  showVisibility?: boolean;
  /** Tooltip / aria-label for the edit button (default: "Editar categoria") */
  editLabel?: string;
  /** Inline editing */
  editing?: boolean;
  editValue?: string;
  onEditChange?: (value: string) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleVisibility?: () => void;
}

export function CategoryRow({
  id,
  label,
  icon: RowIcon = Hash,
  visible = true,
  draggable = true,
  showVisibility = true,
  editLabel = 'Editar categoria',
  editing = false,
  editValue = '',
  onEditChange,
  onEditSave,
  onEditCancel,
  onEdit,
  onDelete,
  onToggleVisibility,
}: CategoryRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable || editing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.row} ${isDragging ? styles.dragging : ''} ${editing ? styles.editing : ''}`}
    >
      {/* Drag handle — visible on hover via CSS */}
      {draggable && !editing && (
        <div className={styles.dragHandle} {...attributes} {...listeners}>
          <DotsSixVertical size={16} weight="bold" className={styles.dragHandleIcon} />
        </div>
      )}

      {/* Row icon */}
      <span className={styles.hashIcon}>
        <RowIcon size={16} weight="regular" />
      </span>

      {/* Label or inline input */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => onEditChange?.(e.target.value)}
          onBlur={() => onEditSave?.()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onEditSave?.(); }
            if (e.key === 'Escape') { e.preventDefault(); onEditCancel?.(); }
            e.stopPropagation();
          }}
          className={styles.labelInput}
        />
      ) : (
        <p className={styles.label}>{label}</p>
      )}

      {/* Actions */}
      {!editing && (
        <div className={styles.actions}>
          {/* Edit — hover only */}
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionHoverOnly}`}
            onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
            title={editLabel}
          >
            <PencilSimple size={16} weight="regular" className={styles.actionIcon} />
          </button>

          {/* Delete — hover only */}
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionHoverOnly}`}
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            title="Deletar categoria"
          >
            <Trash size={16} weight="regular" className={styles.actionIcon} />
          </button>

          {/* Visibility — conditionally rendered */}
          {showVisibility && (
            <Tooltip
              label={visible ? 'Ocultar da barra lateral' : 'Mostrar na barra lateral'}
              position="top"
            >
              <button
                type="button"
                className={`${styles.actionBtn} ${!visible ? styles.actionInactive : ''}`}
                onClick={(e) => { e.stopPropagation(); onToggleVisibility?.(); }}
                aria-label={visible ? 'Ocultar da barra lateral' : 'Mostrar na barra lateral'}
              >
                {visible ? (
                  <Eye size={16} weight="regular" className={styles.actionIcon} />
                ) : (
                  <EyeSlash size={16} weight="regular" className={styles.actionIcon} />
                )}
              </button>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
