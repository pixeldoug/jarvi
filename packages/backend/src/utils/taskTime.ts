/**
 * Normalize a time string coming from any source (frontend form, AI tool call,
 * external webhook) before persisting it.
 *
 * Returns `null` when the value is semantically empty so the database stores
 * SQL NULL instead of the literal text "null" / "NULL" / "undefined", which
 * would otherwise leak into the UI as "NULL, 25 Abr".
 */
export function sanitizeTimeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed === '') return null;

  const lower = trimmed.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return null;

  return trimmed;
}
