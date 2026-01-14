/**
 * TaskItemV2 Component - Jarvi Web
 * 
 * Clean implementation based on Figma design
 * Layout: [checkbox] [date chip] [title] ... [category] [actions on hover]
 */

import React, { useState, useEffect, useRef, memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '../../../../contexts/TaskContext';
import { Chip } from '../../../ui';
import { TaskCheckbox } from '../TaskCheckbox';
import { formatTaskDate } from '../../../../lib/utils';
import { 
  PencilSimple, 
  Trash, 
  DotsSixVertical, 
  Hash,
  Calendar,
} from '@phosphor-icons/react';
import styles from './TaskItemV2.module.css';

export interface TaskItemV2Props {
  task: Task;
  section: string;
  onToggleCompletion: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onUpdateTask: (taskId: string, taskData: any, showLoading?: boolean) => Promise<void>;
  onOpenDatePicker?: (task: Task, triggerElement?: HTMLElement) => void;
  onClick?: (task: Task) => void;
  showInsertionLine?: boolean;
}

const TaskItemV2Component: React.FC<TaskItemV2Props> = ({
  task,
  section,
  onToggleCompletion,
  onEdit,
  onDelete,
  onUpdateTask,
  onOpenDatePicker,
  onClick,
  showInsertionLine = false,
}) => {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const renderCountRef = useRef(0);
  const wasEditingRef = useRef(false);
  
  // #region agent log
  useEffect(() => {
    const prevCount = renderCountRef.current;
    renderCountRef.current += 1;
    
    // Detect if component was remounted (count reset to 1)
    if (prevCount > 0 && renderCountRef.current === 1) {
      fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:remount',message:'Component REMOUNTED - state lost',data:{taskId:task.id,wasEditing:wasEditingRef.current,editingTitle,titleValue},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
    }
    
    fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:render',message:'Component rendered',data:{taskId:task.id,editingTitle,titleValue,taskTitle:task.title,renderCount:renderCountRef.current,prevCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
    
    wasEditingRef.current = editingTitle;
  });
  // #endregion
  
  // #region agent log
  useEffect(() => {
    return () => {
      fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:unmount',message:'Component UNMOUNTING',data:{taskId:task.id,editingTitle,titleValue},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
    };
  }, []);
  // #endregion
  
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:taskPropChange',message:'Task prop changed',data:{taskId:task.id,oldTitle:task.title,editingTitle,titleValue},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  }, [task.id, task.title]);
  // #endregion
  
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:editingTitleChange',message:'editingTitle state changed',data:{taskId:task.id,editingTitle,titleValue},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  }, [editingTitle]);
  // #endregion

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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:handleTitleClick',message:'Title click handler called',data:{taskId:task.id,taskTitle:task.title},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    setEditingTitle(true);
    setTitleValue(task.title);
  };

  const handleTitleSave = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:handleTitleSave:entry',message:'handleTitleSave called',data:{taskId:task.id,titleValue,titleValueLength:titleValue.length,editingTitle},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    const trimmedTitle = titleValue.trim();
    if (!trimmedTitle) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:handleTitleSave:empty',message:'Title is empty, canceling',data:{taskId:task.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setEditingTitle(false);
      setTitleValue('');
      return;
    }

    setEditingTitle(false);
    setTitleValue('');

    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:handleTitleSave:beforeUpdate',message:'Before onUpdateTask call',data:{taskId:task.id,trimmedTitle},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      await onUpdateTask(task.id, { 
        title: trimmedTitle,
        description: task.description,
        priority: task.priority,
        category: task.category,
        completed: task.completed,
        dueDate: task.due_date,
        time: task.time,
      }, false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:handleTitleSave:afterUpdate',message:'After onUpdateTask call',data:{taskId:task.id,trimmedTitle},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:handleTitleSave:error',message:'Error updating task',data:{taskId:task.id,error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      console.error('Failed to update task title:', error);
      setEditingTitle(true);
      setTitleValue(trimmedTitle);
    }
  };

  const handleTitleCancel = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:handleTitleCancel',message:'Title cancel handler called',data:{taskId:task.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    setEditingTitle(false);
    setTitleValue('');
  };

  // Format date chip label
  const dateLabel = task.due_date 
    ? formatTaskDate(task.due_date, task.time) || 'Definir'
    : 'Definir';

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
            {/* Date chip - always present */}
            <Chip
              label={dateLabel}
              icon={<Calendar weight="regular" />}
              interactive
              onClick={() => onOpenDatePicker?.(task)}
              size="small"
            />

            {/* Title - inline editing */}
            {editingTitle ? (
              <input
                ref={inputRef}
                type="text"
                value={titleValue}
                onChange={(e) => {
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:onChange',message:'Input onChange',data:{taskId:task.id,newValue:e.target.value,oldValue:titleValue},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                  // #endregion
                  setTitleValue(e.target.value);
                }}
                onBlur={(e) => {
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:onBlur',message:'Input onBlur triggered',data:{taskId:task.id,titleValue,relatedTarget:e.relatedTarget?.tagName,activeElement:document.activeElement?.tagName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                  // #endregion
                  handleTitleSave();
                }}
                onKeyDown={(e) => {
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:onKeyDown',message:'Input onKeyDown',data:{taskId:task.id,key:e.key,titleValue},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                  // #endregion
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleTitleSave();
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
                className={`${styles.title} ${task.completed ? styles.titleCompleted : ''}`}
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

        {/* Right: Category + Actions */}
        <div className={styles.taskMeta}>
          {/* Category chip */}
          <Chip 
            label={task.category || 'Categoria'}
            icon={<Hash weight="regular" />}
            size="small"
          />

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
        </div>
      </div>
    </>
  );
};

// Memoize component to prevent unnecessary re-renders when task object reference changes
// but actual task data hasn't changed. This preserves local state during editing.
export const TaskItemV2 = memo(TaskItemV2Component, (prevProps, nextProps) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7a353b60-0aaa-4282-a1d6-54b3f3b2ca1c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskItemV2.tsx:memoCompare',message:'Memo comparison called',data:{taskId:prevProps.task.id,prevTaskTitle:prevProps.task.title,nextTaskTitle:nextProps.task.title,taskRefChanged:prevProps.task !== nextProps.task},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  
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
    prevProps.task.category !== nextProps.task.category;
  
  // If task data changed, allow re-render
  if (taskChanged) return false;
  
  // Otherwise, prevent re-render (props are equal)
  return true;
});

