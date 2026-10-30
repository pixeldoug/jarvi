/**
 * NotesListView — pinned notes first ("Fixadas", latest pin first), then the
 * rest grouped by day (Hoje / Ontem / …). A row's hover actions: the
 * category, and the same "…" menu as the note page (pin / unpin, delete).
 */

import { useMemo } from 'react';
import { NotePencil, Waveform } from '@phosphor-icons/react';
import { Button, ListCard, ListCardGroup, Loading, NewNoteIcon, NoteIcon } from '../../ui';
import { toast } from '../../ui/Sonner';
import { useNoteMutations, useNotesList } from '../../../hooks/useNotes';
import type { NoteListItem } from '../../../lib/notesApi';
import { NoteActionsMenu } from './NoteActionsMenu';
import { NoteEmptyState } from './NoteEmptyState';
import {
  NOTE_DATE_GROUP_LABELS,
  formatClock,
  formatDateChip,
  noteDateGroup,
  noteDay,
  toNoteDateValue,
  type NoteDateGroup,
} from './noteText';
import styles from './NotesListView.module.css';

const GROUP_ORDER: NoteDateGroup[] = ['upcoming', 'today', 'yesterday', 'week', 'older'];
const PINNED_GROUP_LABEL = 'Fixadas';
const PREVIEW_MAX_CHARS = 110;

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * Today / yesterday: the time it was created, while the note still sits on
 * its creation day. Otherwise (older, or moved to another day): the date.
 */
function noteTime(note: NoteListItem, group: NoteDateGroup): string {
  const day = noteDay(note);
  const onCreationDay = toNoteDateValue(day) === toNoteDateValue(new Date(note.created_at));
  return (group === 'today' || group === 'yesterday') && onCreationDay
    ? formatClock(note.created_at)
    : formatDateChip(day);
}

/** Newest day first; same day: most recently edited first */
function compareNotes(a: NoteListItem, b: NoteListItem): number {
  return (
    noteDay(b).getTime() - noteDay(a).getTime() ||
    Date.parse(b.updated_at) - Date.parse(a.updated_at)
  );
}

export interface NotesListViewProps {
  onOpenNote: (noteId: string) => void;
  onCreateNote: () => void;
  isCreating: boolean;
  onRequestDelete: (noteId: string) => void;
}

export function NotesListView({
  onOpenNote,
  onCreateNote,
  isCreating,
  onRequestDelete,
}: NotesListViewProps) {
  const { data: notes, isLoading, isError, refetch, isRefetching } = useNotesList();
  const { setNotePinned } = useNoteMutations();

  const groups = useMemo(() => {
    const now = new Date();
    const pinned = (notes ?? [])
      .filter((note) => note.pinned_at)
      .sort((a, b) => Date.parse(b.pinned_at!) - Date.parse(a.pinned_at!));
    const byGroup = new Map<NoteDateGroup, NoteListItem[]>();
    [...(notes ?? [])]
      .filter((note) => !note.pinned_at)
      .sort(compareNotes)
      .forEach((note) => {
        const group = noteDateGroup(noteDay(note), now);
        byGroup.set(group, [...(byGroup.get(group) ?? []), note]);
      });
    return [
      ...(pinned.length > 0 ? [{ key: 'pinned', label: PINNED_GROUP_LABEL, notes: pinned }] : []),
      ...GROUP_ORDER.filter((group) => byGroup.has(group)).map((group) => ({
        key: group,
        label: NOTE_DATE_GROUP_LABELS[group],
        notes: byGroup.get(group) ?? [],
      })),
    ];
  }, [notes]);

  const togglePinned = (note: NoteListItem) => {
    setNotePinned(note.id, !note.pinned_at).catch((error) => {
      console.error('Failed to pin note:', error);
      toast.error(note.pinned_at ? 'Não foi possível desafixar a nota.' : 'Não foi possível fixar a nota.');
    });
  };

  if (isLoading) {
    return <Loading centered size="lg" />;
  }

  if (isError && !notes) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorText}>Não foi possível carregar suas notas.</p>
        <Button variant="secondary" onClick={() => void refetch()} loading={isRefetching}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!notes || notes.length === 0) {
    return (
      <NoteEmptyState
        icon={NotePencil}
        title="Nenhuma nota ainda"
        description="Capture ideias, reuniões e conversas. Crie uma nota ou toque em Gravar."
        action={
          <Button variant="primary" icon={NewNoteIcon} iconPosition="left" onClick={onCreateNote} loading={isCreating}>
            Nova nota
          </Button>
        }
      />
    );
  }

  const now = new Date();
  return (
    <div className={styles.list}>
      {groups.map(({ key, label, notes: groupNotes }) => (
        <section key={key} className={styles.group} aria-label={label}>
          <h2 className={styles.groupLabel}>{label}</h2>
          <ListCardGroup className={styles.cards}>
            {groupNotes.map((note) => (
              <ListCard
                key={note.id}
                as="li"
                className={styles.row}
                icon={
                  note.has_transcript ? (
                    <Waveform size={20} weight="regular" />
                  ) : (
                    <NoteIcon size={20} weight="regular" />
                  )
                }
                title={note.title.trim() || 'Nova nota'}
                description={note.preview ? truncate(note.preview, PREVIEW_MAX_CHARS) : 'Sem conteúdo'}
                truncateDescription
                onClick={() => onOpenNote(note.id)}
                action={
                  <div className={styles.trailing}>
                    <span className={styles.time}>{noteTime(note, noteDateGroup(noteDay(note), now))}</span>
                    {/* Revealed on row hover / keyboard focus, in place of the time */}
                    <div className={styles.actions}>
                      {/* Same menu as the note page's "…" */}
                      <NoteActionsMenu
                        items={[
                          { label: note.pinned_at ? 'Desafixar' : 'Fixar no topo', onSelect: () => togglePinned(note) },
                          { label: 'Excluir nota', onSelect: () => onRequestDelete(note.id) },
                        ]}
                      />
                    </div>
                  </div>
                }
              />
            ))}
          </ListCardGroup>
        </section>
      ))}
    </div>
  );
}
