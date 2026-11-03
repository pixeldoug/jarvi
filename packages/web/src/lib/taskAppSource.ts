import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { NoteIcon } from '../components/ui/icons';
import whatsappIcon from '../assets/icons/whatsapp.svg';
import gmailIcon from '../assets/icons/gmail.svg';
import { Task } from '../contexts/TaskContext';

export interface TaskAppSource {
  name: string;
  /** App logo (image URL) */
  icon?: string;
  /** Phosphor icon, for sources inside Jarvi (no logo) */
  Icon?: ComponentType<IconProps>;
  /** Note the task came from: the chip opens it */
  noteId?: string;
}

/**
 * Derives the external app source from a task, used to render the app chip.
 * Returns null if the task was not created from an external app.
 */
export function getTaskAppSource(task: Task): TaskAppSource | null {
  if (task.source === 'notes') {
    // The note was deleted: no link left to show.
    return task.source_note_id ? { name: 'Nota', Icon: NoteIcon, noteId: task.source_note_id } : null;
  }
  if (task.source === 'gmail') {
    return { name: 'Gmail', icon: gmailIcon };
  }
  if (task.source === 'whatsapp' || task.original_whatsapp_content) {
    return { name: 'Whatsapp', icon: whatsappIcon };
  }
  if (import.meta.env.DEV && !task.source) {
    return { name: 'Whatsapp', icon: whatsappIcon };
  }
  return null;
}
