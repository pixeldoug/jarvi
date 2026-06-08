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

/**
 * Words/expressions that, when immediately preceding a "13h"/"2h" token, mean a
 * DURATION ("em 2h", "por 3h", "leva 2h") rather than a clock time. Anchored to
 * the end of the substring that sits right before the candidate match.
 */
const DURATION_BEFORE =
  /\b(?:em|daqui(?:\s+a)?|h[aá]|faz|por|durante|dentro\s+de|a\s+cada|cada|leva|levou|dura|durou|demora|demorou|atrasad[oa]|atraso\s+de)\s*$/i;

/**
 * Expressions that, when immediately following the candidate match, mean a
 * DURATION ("2h de duração", "3h de atraso").
 */
const DURATION_AFTER = /^\s*(?:de\s+)?(?:duraç|atras|espera)/i;

const SPECIAL_TIMES: Array<[RegExp, string]> = [
  [/\bmeio[\s-]?dia\b/i, '12:00'],
  [/\bmeia[\s-]?noite\b/i, '00:00'],
];

/**
 * Deterministic fallback that extracts a clock time from free text written in
 * Brazilian-Portuguese notation. This is a safety net for when the LLM fails to
 * populate the `time` field even though the user clearly stated one (e.g.
 * "Corte de cabelo quarta 13h30" → "13:30").
 *
 * Recognizes: `13h30`, `13h`, `9h45`, `13h30min`, `13:30`, `às 14h`,
 * `meio-dia`, `meia-noite`. Guards against duration phrases ("em 2h",
 * "por 3h de duração") and out-of-range values (hour > 23, minute > 59).
 *
 * Returns `HH:MM` or `null` when no confident match is found.
 */
export function extractTimeFromText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  // Numeric forms first — they are the most explicit signal.
  const candidateRe = /(\d{1,2})\s*(?::|h)\s*(\d{2})?(?:\s*min)?/gi;
  let match: RegExpExecArray | null;
  while ((match = candidateRe.exec(text)) !== null) {
    const usesColon = match[0].includes(':');
    const minStr = match[2];

    // A colon separator without minutes ("13:") is not a valid time; the "h"
    // separator without minutes ("13h") is valid and means top of the hour.
    if (usesColon && minStr === undefined) continue;

    const hour = Number(match[1]);
    const minute = minStr !== undefined ? Number(minStr) : 0;
    if (hour > 23 || minute > 59) continue;

    const before = text.slice(Math.max(0, match.index - 24), match.index);
    if (DURATION_BEFORE.test(before)) continue;

    const after = text.slice(match.index + match[0].length);
    if (DURATION_AFTER.test(after)) continue;

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  for (const [re, normalized] of SPECIAL_TIMES) {
    if (re.test(text)) return normalized;
  }

  return null;
}
