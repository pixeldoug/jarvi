/**
 * Strip stored-XSS payloads from note content while keeping markdown text.
 * Removes script/iframe tags, inline event handlers, and javascript: URLs.
 */
export function sanitizeNoteContent(content: unknown): string {
  if (typeof content !== 'string' || content.length === 0) {
    return '';
  }

  return content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?script\b[^>]*>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<\/?iframe\b[^>]*>/gi, '')
    .replace(/on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}
