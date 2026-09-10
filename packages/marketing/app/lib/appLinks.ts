import { ATTRIBUTION_KEYS, persistAttribution, readAttribution } from './attribution';

/**
 * App origin for CTA / login links. Override on preview deploys with
 * NEXT_PUBLIC_APP_URL (defaults to production).
 */
export const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.jarvi.life'
).replace(/\/$/, '');

const MAX_VALUE_LENGTH = 200;

type SearchRecord = Record<string, string | string[] | undefined>;

function firstSearchValue(
  search: URLSearchParams | SearchRecord,
  key: string,
): string | undefined {
  const raw = search instanceof URLSearchParams ? search.get(key) : search[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, MAX_VALUE_LENGTH) : undefined;
}

/**
 * Server-safe copy of landing query params onto an app URL (no cookie).
 * Used so the first HTML already has UTM/oppref on the CTA.
 */
export function withAttributionFromSearch(
  appPath: string,
  search: URLSearchParams | SearchRecord,
): string {
  const url = new URL(appPath, `${APP_URL}/`);
  for (const key of ATTRIBUTION_KEYS) {
    const value = firstSearchValue(search, key);
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/**
 * Copies paid-traffic identifiers from the current landing URL (and cookie)
 * onto an app URL so attribution survives the jarvi.life → app.jarvi.life hop.
 */
export function withAttribution(appPath: string): string {
  persistAttribution();
  const url = new URL(appPath, `${APP_URL}/`);
  if (typeof window === 'undefined') return url.toString();

  const attrs = readAttribution();
  for (const key of ATTRIBUTION_KEYS) {
    const value = attrs[key];
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}
