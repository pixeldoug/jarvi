/**
 * Normalizes task description tone to second person ("você").
 *
 * Descriptions are read by the task owner — same voice as the chat, not
 * third-person reportage ("o usuário fez X").
 */

export function normalizeDescriptionVoice(text: string): string {
  return text
    .replace(/\b[Oo] usu[aá]rio\b/g, (match) => (match[0] === 'O' ? 'Você' : 'você'))
    .replace(/\b[Aa] usu[aá]ria\b/g, (match) => (match[0] === 'A' ? 'Você' : 'você'));
}
