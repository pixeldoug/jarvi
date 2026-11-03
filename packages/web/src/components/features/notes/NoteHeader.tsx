/**
 * NoteTopBar — back button and the note actions, spanning the page width.
 * NoteHeader — the editable title, at the top of the document column.
 */

import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { Button, Tooltip } from '../../ui';
import { NoteActionsMenu } from './NoteActionsMenu';
import { NoteCopyMenu, type NoteCopyMenuProps } from './NoteCopyMenu';
import styles from './NoteHeader.module.css';

export const NOTE_TITLE_MAX_LENGTH = 200;

export interface NoteTopBarProps {
  onBack: () => void;
  /** The copy menu: one item per tab */
  copy: NoteCopyMenuProps;
  /** Pinned to the top of the user's list (any reader: the pin is theirs) */
  pinned: boolean;
  onTogglePin: () => void;
  /** Owner only */
  onRequestDelete?: () => void;
}

export function NoteTopBar({ onBack, copy, pinned, onTogglePin, onRequestDelete }: NoteTopBarProps) {
  const menuItems = [
    { label: pinned ? 'Desafixar' : 'Fixar no topo', onSelect: onTogglePin },
    ...(onRequestDelete ? [{ label: 'Excluir nota', onSelect: onRequestDelete }] : []),
  ];
  return (
    <div className={styles.topBar}>
      <Tooltip label="Notas" position="bottom">
        <Button
          variant="secondary"
          size="medium"
          icon={ArrowLeft}
          iconPosition="icon-only"
          aria-label="Voltar para notas"
          onClick={onBack}
        />
      </Tooltip>
      <div className={styles.actions}>
        <NoteCopyMenu {...copy} />
        <NoteActionsMenu triggerVariant="secondary" triggerSize="medium" items={menuItems} />
      </div>
    </div>
  );
}

export interface NoteHeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  onTitleBlur: () => void;
  readOnly: boolean;
}

export function NoteHeader({ title, onTitleChange, onTitleBlur, readOnly }: NoteHeaderProps) {
  // A textarea (not an input) so long titles wrap instead of being cut off on
  // narrow screens; it grows with its content and never holds a line break.
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = titleRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [title]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <header className={styles.header}>
      <textarea
        ref={titleRef}
        className={styles.titleInput}
        rows={1}
        value={title}
        placeholder="Nova nota"
        aria-label="Título da nota"
        maxLength={NOTE_TITLE_MAX_LENGTH}
        readOnly={readOnly}
        onChange={(event) => onTitleChange(event.target.value.replace(/[\r\n]+/g, ' '))}
        onBlur={onTitleBlur}
        onKeyDown={handleKeyDown}
      />
    </header>
  );
}
