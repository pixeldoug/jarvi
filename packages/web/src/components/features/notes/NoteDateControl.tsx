/**
 * NoteDateControl — the note's date chip, like the task form's: set (the
 * chosen day, or the creation day) with an "×" that removes it, or "Data"
 * once removed. Opens the tasks' date picker in `day` mode (Hoje / Ontem,
 * calendar, no time). Read-only users get a plain chip, or none without a
 * date.
 */

import { useRef, useState } from 'react';
import { CalendarDots } from '@phosphor-icons/react';
import { Chip } from '../../ui';
import { toast } from '../../ui/Sonner';
import { TaskDatePicker } from '../tasks/TaskDatePicker';
import { useNoteMutations } from '../../../hooks/useNotes';
import { formatDateChip, noteDay, toNoteDateValue } from './noteText';

export interface NoteDateControlProps {
  note: { id: string; note_date: string | null; date_removed: boolean; created_at: string };
  readOnly: boolean;
}

export function NoteDateControl({ note, readOnly }: NoteDateControlProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { updateNoteMeta } = useNoteMutations();
  const day = noteDay(note);

  const handleSelect = async (date: Date | null) => {
    if (!date) return;
    // A single choice (no time to set afterwards, unlike tasks): close on pick
    setIsOpen(false);
    const value = toNoteDateValue(date);
    if (!note.date_removed && value === toNoteDateValue(day)) return;
    try {
      await updateNoteMeta(note.id, { note_date: value });
    } catch (error) {
      console.error('Failed to update note date:', error);
      toast.error('Não foi possível alterar a data.');
    }
  };

  const handleRemove = async () => {
    try {
      await updateNoteMeta(note.id, { note_date: null });
    } catch (error) {
      console.error('Failed to remove note date:', error);
      toast.error('Não foi possível remover a data.');
    }
  };

  if (readOnly && note.date_removed) return null;

  const chip = (
    <Chip
      label={note.date_removed ? 'Data' : formatDateChip(day)}
      icon={<CalendarDots size={16} weight="regular" />}
      size="medium"
      interactive={!readOnly}
      active={!note.date_removed || isOpen}
      onClear={readOnly || note.date_removed ? undefined : () => void handleRemove()}
      onClick={readOnly ? undefined : () => setIsOpen((open) => !open)}
    />
  );

  if (readOnly) return chip;

  return (
    <>
      <div ref={anchorRef} style={{ display: 'inline-flex' }}>
        {chip}
      </div>
      <TaskDatePicker
        mode="day"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        selectedDate={note.date_removed ? undefined : day}
        onDateSelect={(date) => void handleSelect(date)}
        anchorRef={anchorRef}
      />
    </>
  );
}
