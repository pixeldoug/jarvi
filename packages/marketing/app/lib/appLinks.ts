/**
 * App origin for CTA / login links. Override on preview deploys with
 * NEXT_PUBLIC_APP_URL (defaults to production).
 */
export const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.jarvi.life'
).replace(/\/$/, '');

const ATTRIBUTION_KEYS = [
  'fbclid',
  'gclid',
  'ttclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
] as const;

/**
 * Copies paid-traffic identifiers from the current landing URL onto an app
 * URL so attribution survives the jarvi.life → app.jarvi.life hop.
 */
export function withAttribution(appPath: string): string {
  const url = new URL(appPath, `${APP_URL}/`);
  if (typeof window === 'undefined') return url.toString();

  const incoming = new URLSearchParams(window.location.search);
  for (const key of ATTRIBUTION_KEYS) {
    const value = incoming.get(key);
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}
