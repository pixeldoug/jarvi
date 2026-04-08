import whatsappIcon from '../assets/icons/whatsapp.svg';
import { Task } from '../contexts/TaskContext';

export interface TaskAppSource {
  name: string;
  icon: string;
}

/**
 * Derives the external app source from a task, used to render the app chip.
 * Returns null if the task was not created from an external app.
 */
export function getTaskAppSource(task: Task): TaskAppSource | null {
  if (task.original_whatsapp_content) {
    return { name: 'Whatsapp', icon: whatsappIcon };
  }
  return null;
}
