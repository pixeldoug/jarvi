import { useState, useRef, KeyboardEvent } from 'react';
import styles from './SubTaskList.module.css';
import { SubTask } from '../../../../contexts/TaskContext';

interface SubTaskListProps {
  taskId: string;
  subtasks: SubTask[];
  onAdd: (title: string) => Promise<unknown>;
  onToggle: (subtaskId: string) => Promise<void>;
  onDelete: (subtaskId: string) => Promise<void>;
  onUpdateTitle: (subtaskId: string, title: string) => Promise<void>;
}

export function SubTaskList({
  subtasks,
  onAdd,
  onToggle,
  onDelete,
  onUpdateTitle,
}: SubTaskListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [addValue, setAddValue] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const completedCount = subtasks.filter(s => s.completed).length;
  const total = subtasks.length;
  const progressPct = total > 0 ? (completedCount / total) * 100 : 0;

  const handleAddConfirm = async () => {
    const title = addValue.trim();
    if (title) {
      await onAdd(title);
    }
    setAddValue('');
    setIsAdding(false);
  };

  const handleAddKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddConfirm();
    }
    if (e.key === 'Escape') {
      setAddValue('');
      setIsAdding(false);
    }
  };

  const startAdding = () => {
    setIsAdding(true);
    setTimeout(() => addInputRef.current?.focus(), 50);
  };

  const startEditing = (subtask: SubTask) => {
    setEditingId(subtask.id);
    setEditingValue(subtask.title);
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>, subtask: SubTask) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(subtask);
    }
    if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const commitEdit = async (subtask: SubTask) => {
    const title = editingValue.trim();
    if (title && title !== subtask.title) {
      await onUpdateTitle(subtask.id, title);
    }
    setEditingId(null);
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Sub-tasks</span>
        {total > 0 && (
          <span className={styles.progress}>
            {completedCount}/{total}
          </span>
        )}
      </div>

      {total > 0 && (
        <div className={styles.progressBarWrapper}>
          <div
            className={styles.progressBar}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {total > 0 && (
        <ul className={styles.itemsList}>
          {subtasks.map(subtask => (
            <li key={subtask.id} className={styles.item}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={subtask.completed}
                onChange={() => onToggle(subtask.id)}
              />

              {editingId === subtask.id ? (
                <input
                  className={styles.itemTitle}
                  value={editingValue}
                  onChange={e => setEditingValue(e.target.value)}
                  onKeyDown={e => handleEditKeyDown(e, subtask)}
                  onBlur={() => commitEdit(subtask)}
                  autoFocus
                />
              ) : (
                <span
                  className={subtask.completed ? styles.itemTitleCompleted : styles.itemTitle}
                  onClick={() => startEditing(subtask)}
                  style={{ cursor: 'text' }}
                >
                  {subtask.title}
                </span>
              )}

              <button
                type="button"
                className={styles.deleteBtn}
                onClick={() => onDelete(subtask.id)}
                title="Delete sub-task"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2 2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {isAdding ? (
        <div className={styles.addRow}>
          <div className={styles.addBtn}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M4 1v6M1 4h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <input
            ref={addInputRef}
            className={styles.addInput}
            value={addValue}
            onChange={e => setAddValue(e.target.value)}
            onKeyDown={handleAddKeyDown}
            onBlur={handleAddConfirm}
            placeholder="Nome da sub-task..."
          />
        </div>
      ) : (
        <div className={styles.addRow} onClick={startAdding}>
          <button type="button" className={styles.addBtn}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M4 1v6M1 4h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <span className={styles.addLabel}>Adicionar sub-task</span>
        </div>
      )}
    </div>
  );
}
