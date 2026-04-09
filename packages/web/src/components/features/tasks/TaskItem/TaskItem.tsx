/**
 * TaskItem Component - Jarvi Web
 * 
 * Clean implementation based on Figma design
 * Layout: [checkbox] [date chip] [title] ... [category] [actions on hover]
 */

import React, { useState, useRef, memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '../../../../contexts/TaskContext';
import { Chip } from '../../../ui';
import { TaskCheckbox } from '../TaskCheckbox';
import { getTaskAppSource } from '../../../../lib/taskAppSource';
import { formatTaskDate, formatTaskDateWeekday, isToday } from '../../../../lib/utils';
import { 
  PencilSimple, 
  Trash, 
  DotsSixVertical, 
  Hash,
  Calendar,
  FireSimple,
} from '@phosphor-icons/react';
import styles from './TaskItem.module.css';

export interface TaskItemProps {
  task: Task;
  section: string;
  onToggleCompletion: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onUpdateTask: (taskId: string, taskData: any, showLoading?: boolean) => Promise<void>;
  onOpenDatePicker?: (task: Task, triggerElement?: HTMLElement) => void;
  onClick?: (task: Task) => void;
  showInsertionLine?: boolean;
  isActive?: boolean;
  hideCategoryChip?: boolean;
  showDayOfWeek?: boolean;
}

const TaskItemComponent: React.FC<TaskItemProps> = ({
  task,
  section,
  onToggleCompletion,
  onEdit,
  onDelete,
  onUpdateTask,
  onOpenDatePicker,
  onClick,
  showInsertionLine = false,
  isActive = false,
  hideCategoryChip = false,
  showDayOfWeek = false,
}) => {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: task.id,
    data: {
      task: task,
      section: section,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Inline editing handlers
  const handleTitleClick = () => {
    setEditingTitle(true);
    setTitleValue(task.title);
  };

  const handleTitleSave = async () => {
    const trimmedTitle = titleValue.trim();
    if (!trimmedTitle) {
      setEditingTitle(false);
      setTitleValue('');
      return;
    }

    setEditingTitle(false);
    setTitleValue('');

    try {
      await onUpdateTask(task.id, { 
        title: trimmedTitle,
        description: task.description,
        priority: task.priority,
        category: task.category,
        completed: task.completed,
        dueDate: task.due_date,
        time: task.time,
      }, false);
    } catch (error) {
      console.error('Failed to update task title:', error);
      setEditingTitle(true);
      setTitleValue(trimmedTitle);
    }
  };

  const handleTitleCancel = () => {
    setEditingTitle(false);
    setTitleValue('');
  };

  // Format date chip label.
  // When the due date is today, show only the time (if set) — the section header
  // already makes it clear it's today, so repeating the date is redundant.
  const dateLabel = (() => {
    if (!task.due_date) return 'Definir';
    if (isToday(task.due_date)) return task.time ?? null;
    if (showDayOfWeek) {
      return formatTaskDateWeekday(task.due_date, task.time) || formatTaskDate(task.due_date, task.time) || 'Definir';
    }
    return formatTaskDate(task.due_date, task.time) || 'Definir';
  })();

  // Handle click on task item (but not on interactive elements)
  const handleTaskItemClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't trigger if clicking on interactive elements
    const target = e.target as HTMLElement;
    const isInteractiveElement = 
      target.closest('button') ||
      target.closest('input') ||
      target.closest('[role="button"]') ||
      target.closest(`.${styles.dragHandle}`) ||
      target.closest(`.${styles.actionButton}`) ||
      target.closest(`.${styles.titleInput}`);
    
    if (!isInteractiveElement && onClick) {
      onClick(task);
    }
  };

  return (
    <>
      {showInsertionLine && <div className={styles.insertionLine} />}
      
      <div
        ref={setNodeRef}
        style={style}
        className={`${styles.taskItem} ${isDragging ? styles.dragging : ''}`}
        onClick={handleTaskItemClick}
      >
        {/* Drag Handle */}
        <div className={styles.dragHandle} {...attributes} {...listeners}>
          <DotsSixVertical className={styles.dragHandleIcon} weight="bold" />
        </div>

        {/* Left: Checkbox + Date + Title */}
        <div className={styles.taskContent}>
          <TaskCheckbox
            checked={task.completed}
            onChange={() => onToggleCompletion(task.id)}
            ariaLabel={task.completed ? 'Marcar como não concluída' : 'Marcar como concluída'}
          />

          <div className={styles.taskTitle}>
            {/* Date chip — hidden when task is today and has no time set */}
            {dateLabel !== null && (
              <Chip
                label={dateLabel}
                icon={!task.due_date ? <Calendar weight="regular" /> : undefined}
                interactive
                onClick={() => onOpenDatePicker?.(task)}
                size="small"
              />
            )}

            {/* Priority icon */}
            {task.priority && (
              <FireSimple
                weight="fill"
                className={`${styles.priorityIcon} ${task.completed ? styles.priorityDisabled : styles[`priority_${task.priority}`]}`}
              />
            )}

            {/* Title - inline editing */}
            {editingTitle ? (
              <input
                ref={inputRef}
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={() => void handleTitleSave()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleTitleSave();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleTitleCancel();
                  }
                  e.stopPropagation();
                }}
                className={styles.titleInput}
                autoFocus
              />
            ) : (
              <p
                className={`${styles.title} ${task.completed ? styles.titleCompleted : ''} ${isActive ? styles.titleActive : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleTitleClick();
                }}
                title="Clique para editar o título"
              >
                {task.title}
              </p>
            )}
          </div>
        </div>

        {/* Right: Actions + App chip + Category */}
        <div className={styles.taskMeta}>
          {/* Action buttons - appear on hover */}
          <div className={styles.actions}>
            <button
              className={styles.actionButton}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(task);
              }}
              title="Editar tarefa"
            >
              <PencilSimple className={styles.actionButtonIcon} />
            </button>
            <button
              className={styles.actionButton}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(task.id);
              }}
              title="Deletar tarefa"
            >
              <Trash className={styles.actionButtonIcon} />
            </button>
          </div>

          {/* App chip - shown when task originated from an external app */}
          {(() => {
            const appSource = getTaskAppSource(task);
            return appSource ? (
              <Chip
                label={appSource.name}
                icon={<img src={appSource.icon} alt={appSource.name} />}
                chipStyle="filled"
                size="small"
              />
            ) : null;
          })()}

          {/* Category chip - hidden when details sidebar is open */}
          {!hideCategoryChip && (
            <Chip 
              label={task.category || 'Categoria'}
              icon={<Hash weight="regular" />}
              size="small"
            />
          )}
        </div>
      </div>
    </>
  );
};

// Memoize component to prevent unnecessary re-renders when task object reference changes
// but actual task data hasn't changed. This preserves local state during editing.
export const TaskItem = memo(TaskItemComponent, (prevProps, nextProps) => {
  // Don't re-render if task data is the same (compare by id and relevant fields)
  // but allow re-render if task actually changed or if editing-related props changed
  if (prevProps.task.id !== nextProps.task.id) return false;
  if (prevProps.showInsertionLine !== nextProps.showInsertionLine) return false;
  if (prevProps.section !== nextProps.section) return false;
  
  // Compare task properties that matter for rendering
  const taskChanged = 
    prevProps.task.title !== nextProps.task.title ||
    prevProps.task.completed !== nextProps.task.completed ||
    prevProps.task.due_date !== nextProps.task.due_date ||
    prevProps.task.time !== nextProps.task.time ||
    prevProps.task.category !== nextProps.task.category ||
    prevProps.task.priority !== nextProps.task.priority ||
    prevProps.task.original_whatsapp_content !== nextProps.task.original_whatsapp_content;
  
  // If task data changed, allow re-render
  if (taskChanged) return false;
  
  // Otherwise, prevent re-render (props are equal)
  return true;
});
