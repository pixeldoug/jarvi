/**
 * Structured task references inside assistant text.
 *
 * The backend writes `{{task:<id>|<title>}}` when it confirms a write
 * ("Pronto, Doug! Criei {{task:abc|Marcar dermatologista}}."). The chat
 * renders the token as the inline task mention; anything that needs plain
 * text (the history sent back to the model) gets the quoted title instead.
 */

export const TASK_REF_REGEX = /\{\{task:([^|}]*)\|([^}]*)\}\}/g;

export interface TaskRef {
  id: string;
  title: string;
}

export type TaskRefSegment = { type: 'text'; text: string } | { type: 'task'; ref: TaskRef };

export function splitTaskRefs(text: string): TaskRefSegment[] {
  const segments: TaskRefSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TASK_REF_REGEX)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: 'text', text: text.slice(last, index) });
    segments.push({ type: 'task', ref: { id: match[1].trim(), title: match[2].trim() } });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
  return segments;
}

export function hasTaskRefs(text: string): boolean {
  TASK_REF_REGEX.lastIndex = 0;
  return TASK_REF_REGEX.test(text);
}

/** `{{task:id|Title}}` → `"Title"` (for text surfaces and the model history). */
export function stripTaskRefs(text: string): string {
  return text.replace(TASK_REF_REGEX, (_m, _id: string, title: string) => `"${title.trim()}"`);
}
