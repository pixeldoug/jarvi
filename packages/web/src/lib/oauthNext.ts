/** Only return paths that continue the Jarvi OAuth consent screen. */
export function readOAuthNext(search: string): string | null {
  const next = new URLSearchParams(search).get('next');
  if (!next) return null;
  if (next !== '/oauth/consent' && !next.startsWith('/oauth/consent?')) return null;
  if (next.includes('\\') || next.includes('://')) return null;
  return next;
}
