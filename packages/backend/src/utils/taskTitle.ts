/** Capitalize the first letter of a task title (pt-BR). Leaves the rest unchanged. */
export function capitalizeTaskTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase('pt-BR') + trimmed.slice(1);
}
