import whatsappIcon from '../assets/icons/whatsapp.svg';
import gmailIcon from '../assets/icons/gmail.svg';
import { Task } from '../contexts/TaskContext';

export interface TaskAppSource {
  name: string;
  icon: string;
}

/**
 * Derives the external app source from a task, used to render the app chip.
 * Returns null if the task was not created from an external app.
 * For WhatsApp tasks, shows the nickname of the originating number.
 */
export function getTaskAppSource(task: Task): TaskAppSource | null {
  if (task.source === 'gmail') {
    return { name: 'Gmail', icon: gmailIcon };
  }
  if (task.source === 'whatsapp' || task.original_whatsapp_content) {
    const label = task.whatsapp_nickname || 'Whatsapp';
    return { name: label, icon: whatsappIcon };
  }
  return null;
}
