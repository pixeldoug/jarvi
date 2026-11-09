/**
 * ConvertToTasksDialog — "Sincronizar com tarefas": pick the summary's next
 * steps that become tasks (DeleteNoteDialog pattern). Rows read like TaskItem
 * (one-line title, the step's category and date as chips on the right); items
 * already converted are listed, disabled.
 *
 * A step the user already has as an open task (`matches`, looked for when the
 * dialog opens) is tied to that task instead of repeating it: its row says so
 * and offers "Criar nova" for when it really is another task. Confirming
 * waits for that lookup.
 */

import { useState } from 'react';
import { Button, Chip, Dialog } from '../../ui';
import { TaskCheckbox } from '../tasks/TaskCheckbox';
import { formatTaskDate } from '../../../lib/utils';
import type { SummaryTaskItem } from './summaryTasks';
import type { ExistingTask } from './useSummaryTasks';
import styles from './ConvertToTasksDialog.module.css';

export interface ConvertToTasksDialogProps {
  isOpen: boolean;
  /** The summary's task items with text, in document order */
  items: SummaryTaskItem[];
  /** Tasks the user already has, by item `index`; null while they are being looked for */
  matches: ReadonlyMap<number, ExistingTask> | null;
  isCreating: boolean;
  onClose: () => void;
  /** `useExisting`: item `index` → the user's task it is tied to instead of a new one */
  onConfirm: (items: SummaryTaskItem[], useExisting: ReadonlyMap<number, string>) => void;
}

export function ConvertToTasksDialog({
  isOpen,
  items,
  matches,
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
        matches={matches}
        isCreating={isCreating}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    </Dialog>
  );
}

/** Same words, ignoring case, accents and punctuation. */
function sameWords(a: string, b: string): boolean {
  const fold = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return fold(a) === fold(b);
}

/**
 * What happens to a step the user already has as a task: marked, it uses that
 * task (or gets a new one, after "Criar nova"); unmarked, nothing happens.
 */
function matchNote(stepText: string, match: ExistingTask, useExisting: boolean, selected: boolean): string {
  const renamed = !sameWords(match.title, stepText);
  if (!selected) return renamed ? `Já está nas suas tarefas como “${match.title}”` : 'Já está nas suas tarefas';
  if (!useExisting) return 'Vai virar uma tarefa nova';
  return renamed ? `Vai usar a tarefa que você já tem: “${match.title}”` : 'Vai usar a tarefa que você já tem';
}

function ConvertToTasksBody({
  items,
  matches,
  isCreating,
  onClose,
  onConfirm,
}: Omit<ConvertToTasksDialogProps, 'isOpen'>) {
  // Default: every next step still open and not converted yet.
  const [selected, setSelected] = useState<ReadonlySet<number>>(
    () => new Set(items.filter((item) => !item.taskId && !item.checked).map((item) => item.index)),
  );
  // Steps with a task the user already has that should get a new one anyway.
  const [createNew, setCreateNew] = useState<ReadonlySet<number>>(() => new Set());
  const isMatching = matches === null;

  const toggle = (item: SummaryTaskItem) => {
    if (item.taskId || isCreating) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.index)) next.delete(item.index);
      else next.add(item.index);
      return next;
    });
  };

  const toggleCreateNew = (item: SummaryTaskItem) => {
    if (isCreating) return;
    setCreateNew((prev) => {
      const next = new Set(prev);
      if (next.has(item.index)) next.delete(item.index);
      else next.add(item.index);
      return next;
    });
  };

  const existingFor = (item: SummaryTaskItem): ExistingTask | null =>
    (!item.taskId && !createNew.has(item.index) && matches?.get(item.index)) || null;

  const picked = items.filter((item) => !item.taskId && selected.has(item.index));
  const useExisting = new Map(
    picked.flatMap((item) => {
      const existing = existingFor(item);
      return existing ? [[item.index, existing.id] as const] : [];
    }),
  );
  const hasMatches = !!matches && matches.size > 0;

  return (
    <div className={styles.body}>
      <div className={styles.textBlock}>
        <h2 className={styles.title}>Sincronizar com tarefas</h2>
        <p className={styles.description} aria-live="polite">
          {isMatching
            ? 'Conferindo se algum passo já está nas suas tarefas…'
            : hasMatches
              ? 'Os passos marcados vão para Tarefas. Se um já estiver lá, a nota usa a tarefa que você já tem, sem repetir.'
              : 'Os próximos passos selecionados vão para Tarefas.'}
        </p>
      </div>

      <ul className={styles.list} aria-label="Próximos passos">
        {items.map((item) => {
          const isLinked = !!item.taskId;
          const isSelected = isLinked || selected.has(item.index);
          const match = !isLinked ? matches?.get(item.index) ?? null : null;
          const existing = existingFor(item);
          return (
            <li
              key={item.index}
              className={`${styles.row} ${isLinked ? styles.rowLinked : ''} ${match ? styles.rowMatched : ''}`}
              onClick={() => toggle(item)}
            >
              <TaskCheckbox
                checked={isSelected}
                onChange={() => toggle(item)}
                ariaLabel={item.text}
                disabled={isLinked}
              />
              <div className={styles.itemMain}>
                <span className={styles.itemText} title={item.text}>
                  {item.text}
                </span>
                {match && (
                  <span className={styles.itemNote} title={match.title}>
                    {matchNote(item.text, match, !!existing, isSelected)}
                  </span>
                )}
              </div>
              <div className={styles.chips}>
                {isLinked ? (
                  <Chip label="Já é tarefa" size="small" chipStyle="filled" />
                ) : (
                  <>
                    {!existing && item.category && <Chip label={item.category} size="small" />}
                    {!existing && item.dueDate && (
                      <Chip label={formatTaskDate(item.dueDate, item.time ?? undefined) ?? item.dueDate} size="small" />
                    )}
                    {match && (
                      <Button
                        variant="ghost"
                        size="small"
                        disabled={isCreating}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleCreateNew(item);
                        }}
                      >
                        {existing ? 'Criar nova' : 'Usar a existente'}
                      </Button>
                    )}
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
          onClick={() => onConfirm(picked, useExisting)}
          disabled={picked.length === 0 || isMatching}
          loading={isCreating}
        >
          Sincronizar tarefas
        </Button>
      </div>
    </div>
  );
}
