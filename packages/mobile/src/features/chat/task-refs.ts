/**
 * `{{task:<id>|<title>}}` tokens the backend writes when it confirms a change
 * ("Criei {{task:abc|Marcar dermatologista}}."). Port of web lib/taskRefs.ts.
 */

const TASK_REF_REGEX = /\{\{task:([^|}]*)\|([^}]*)\}\}/g;

export type TaskRefSegment = { type: 'text'; text: string } | { type: 'task'; id: string; title: string };

export function splitTaskRefs(text: string): TaskRefSegment[] {
  const segments: TaskRefSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TASK_REF_REGEX)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: 'text', text: text.slice(last, index) });
    segments.push({ type: 'task', id: match[1]!.trim(), title: match[2]!.trim() });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
  return segments;
}

/** `{{task:id|Title}}` → `"Title"`, for the history sent back to the model. */
export function stripTaskRefs(text: string): string {
  return text.replace(TASK_REF_REGEX, (_match, _id: string, title: string) => `"${title.trim()}"`);
}
