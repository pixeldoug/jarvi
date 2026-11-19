/**
 * TaskDescriptionVersionsDialog — "Versões anteriores" of a task description.
 *
 * Lists what the description said before each change made by the AI (or before
 * a restore). Picking a version shows it in the same dialog, read-only, with
 * "Restaurar esta versão": one overlay, the content swaps (compliance.md).
 * Restoring keeps the current text as a version too, so nothing is lost.
 */

import { useEffect, useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { Button, Dialog, ListItem } from '../../../ui';
import { RichTextEditor } from '../../../ui/RichTextEditor/RichTextEditor';
import type {
  TaskDescriptionVersion,
  TaskDescriptionVersionSource,
} from '../../../../lib/taskDescriptionVersionsApi';
import styles from './TaskDescriptionVersionsDialog.module.css';

const SOURCE_LABELS: Record<TaskDescriptionVersionSource, string> = {
  agent_web: 'Antes de uma alteração da IA',
  agent_whatsapp: 'Antes de uma alteração da IA pelo WhatsApp',
  mcp: 'Antes de uma alteração por um app conectado',
  restore: 'Antes de restaurar outra versão',
};

/** "19 Nov, 14:32" (with the year when it isn't this one) */
function formatVersionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = date
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .replace(/^./, (char) => char.toUpperCase());
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const year = date.getFullYear() === new Date().getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${month}${year}, ${time}`;
}

/** The row's second line: what this version has, or still lacks, compared with what came next. */
function describeVersion(version: TaskDescriptionVersion): string {
  const { change } = version;
  if (!change) return version.preview;
  const more = change.more > 0 ? ` (e mais ${change.more})` : '';
  return change.kind === 'had' ? `Ainda tinha: ${change.line}${more}` : `Ainda não tinha: ${change.line}${more}`;
}

const noop = () => {};

export interface TaskDescriptionVersionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Newest first */
  versions: TaskDescriptionVersion[];
  /** The version being restored */
  restoringId: string | null;
  /** Resolves to whether the restore worked (the dialog closes when it did) */
  onRestore: (versionId: string) => Promise<boolean>;
}

export function TaskDescriptionVersionsDialog({
  isOpen,
  onClose,
  versions,
  restoringId,
  onRestore,
}: TaskDescriptionVersionsDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = versions.find((version) => version.id === selectedId) ?? null;
  const isRestoring = restoringId !== null;

  // Always opens on the list.
  useEffect(() => {
    if (!isOpen) setSelectedId(null);
  }, [isOpen]);

  const handleRestore = async () => {
    if (!selected) return;
    if (await onRestore(selected.id)) onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isRestoring ? noop : onClose}
      width="lg"
      showCloseButton={!isRestoring}
      contentClassName={styles.dialogContent}
    >
      {selected ? (
        <div className={styles.body}>
          <div className={styles.textBlock}>
            <h2 className={styles.title}>Versão de {formatVersionDate(selected.created_at)}</h2>
            <p className={styles.description}>{SOURCE_LABELS[selected.source] ?? SOURCE_LABELS.agent_web}.</p>
          </div>

          <div className={styles.preview}>
            <RichTextEditor
              key={selected.id}
              content={selected.description}
              onChange={noop}
              readOnly
              variant="document"
              placeholder=""
              ariaLabel="Versão anterior da descrição"
            />
          </div>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setSelectedId(null)} disabled={isRestoring}>
              Voltar
            </Button>
            <Button variant="primary" onClick={() => void handleRestore()} loading={isRestoring}>
              Restaurar esta versão
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.textBlock}>
            <h2 className={styles.title}>Versões anteriores</h2>
            <p className={styles.description}>
              O que a descrição dizia antes de cada alteração feita pela IA. Restaurar uma versão não apaga a
              atual: ela também fica guardada aqui.
            </p>
          </div>

          {versions.length === 0 ? (
            <p className={styles.empty}>Ainda não há versões anteriores desta descrição.</p>
          ) : (
            <div className={styles.list} role="list">
              {versions.map((version) => (
                <div key={version.id} role="listitem">
                  <ListItem
                    label={formatVersionDate(version.created_at)}
                    description={describeVersion(version)}
                    trailing={<CaretRight size={16} weight="regular" aria-hidden="true" />}
                    className={styles.row}
                    onClick={() => setSelectedId(version.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
