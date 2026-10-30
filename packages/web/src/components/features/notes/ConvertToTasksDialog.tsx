/**
 * ConvertToTasksDialog — "Sincronizar com tarefas": pick the summary's next
 * steps that become tasks (DeleteNoteDialog pattern). Rows read like TaskItem
 * (one-line title, the step's category and date as chips on the right); items
 * already converted are listed, disabled.
 */

import { useState } from 'react';
import { Button, Chip, Dialog } from '../../ui';
import { TaskCheckbox } from '../tasks/TaskCheckbox';
import { formatTaskDate } from '../../../lib/utils';
import type { SummaryTaskItem } from './summaryTasks';
import styles from './ConvertToTasksDialog.module.css';

export interface ConvertToTasksDialogProps {
  isOpen: boolean;
  /** The summary's task items with text, in document order */
  items: SummaryTaskItem[];
  isCreating: boolean;
  onClose: () => void;
  onConfirm: (items: SummaryTaskItem[]) => void;
}

export function ConvertToTasksDialog({
  isOpen,
  items,
  isCreating,
  onClose,
  onConfirm,
}: ConvertToTasksDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={isCreating ? () => {} : onClose}
      width="lg"
      className={styles.dialog}
      showCloseButton={!isCreating}
      contentClassName={styles.dialogContent}
    >
      {/* Mounted only while open: the selection starts fresh every time. */}
      <ConvertToTasksBody
        items={items}
        isCreating={isCreating}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    </Dialog>
  );
}

function ConvertToTasksBody({
  items,
  isCreating,
  onClose,
  onConfirm,
}: Omit<ConvertToTasksDialogProps, 'isOpen'>) {
  // Default: every next step still open and not converted yet.
  const [selected, setSelected] = useState<ReadonlySet<number>>(
    () => new Set(items.filter((item) => !item.taskId && !item.checked).map((item) => item.index)),
  );

  const toggle = (item: SummaryTaskItem) => {
    if (item.taskId || isCreating) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.index)) next.delete(item.index);
      else next.add(item.index);
      return next;
    });
  };

  const picked = items.filter((item) => !item.taskId && selected.has(item.index));

  return (
    <div className={styles.body}>
      <div className={styles.textBlock}>
        <h2 className={styles.title}>Sincronizar com tarefas</h2>
        <p className={styles.description}>
          Os próximos passos selecionados vão para Tarefas.
        </p>
      </div>

      <ul className={styles.list} aria-label="Próximos passos">
        {items.map((item) => {
          const isLinked = !!item.taskId;
          const isSelected = isLinked || selected.has(item.index);
          return (
            <li
              key={item.index}
              className={`${styles.row} ${isLinked ? styles.rowLinked : ''}`}
              onClick={() => toggle(item)}
            >
              <TaskCheckbox
                checked={isSelected}
                onChange={() => toggle(item)}
                ariaLabel={item.text}
                disabled={isLinked}
              />
              <span className={styles.itemText} title={item.text}>
                {item.text}
              </span>
              <div className={styles.chips}>
                {isLinked ? (
                  <Chip label="Já é tarefa" size="small" chipStyle="filled" />
                ) : (
                  <>
                    {item.category && <Chip label={item.category} size="small" />}
                    {item.dueDate && <Chip label={formatTaskDate(item.dueDate, item.time ?? undefined) ?? item.dueDate} size="small" />}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose} disabled={isCreating}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={() => onConfirm(picked)}
          disabled={picked.length === 0}
          loading={isCreating}
        >
          Sincronizar tarefas
        </Button>
      </div>
    </div>
  );
}
