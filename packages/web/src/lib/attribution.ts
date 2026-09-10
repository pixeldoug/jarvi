/**
 * Paid-traffic identifiers that must survive jarvi.life → app.jarvi.life.
 * Keep this list in sync with `packages/marketing/app/lib/attribution.ts`.
 */
export const ATTRIBUTION_KEYS = [
  'fbclid',
  'gclid',
  'ttclid',
  'oppref',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'campaign_id',
  'ad_id',
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type AttributionMap = Partial<Record<AttributionKey, string>>;

const ATTRIBUTION_COOKIE = '__jarvi_attr';
const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const MAX_VALUE_LENGTH = 200;

function isJarviHost(hostname: string): boolean {
  return hostname === 'jarvi.life' || hostname.endsWith('.jarvi.life');
}

function cookieFlags(): string {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const domain = isJarviHost(window.location.hostname) ? '; Domain=.jarvi.life' : '';
  return `Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}${domain}`;
}

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'),
  );
  return match ? decodeURIComponent(match[1]) : '';
}

function setCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; ${cookieFlags()}`;
}

function sanitize(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_VALUE_LENGTH);
}

export function readAttribution(): AttributionMap {
  if (typeof window === 'undefined') return {};
  const stored = new URLSearchParams(getCookie(ATTRIBUTION_COOKIE));
  const fromUrl = new URLSearchParams(window.location.search);
  const result: AttributionMap = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = sanitize(fromUrl.get(key) || stored.get(key));
    if (value) result[key] = value;
  }
  if (!result.oppref) {
    const legacy = sanitize(getCookie('__oppref'));
    if (legacy) result.oppref = legacy;
  }
  return result;
}

export function persistAttribution(): AttributionMap {
  const attrs = readAttribution();
  const params = new URLSearchParams();
  for (const key of ATTRIBUTION_KEYS) {
    const value = attrs[key];
    if (value) params.set(key, value);
  }
  if (params.toString()) {
    setCookie(ATTRIBUTION_COOKIE, params.toString());
  }
  if (attrs.oppref) setCookie('__oppref', attrs.oppref);
  return attrs;
}

/**
 * Copies stored click ids onto the current URL before PostHog's first
 * pageview, so a hop that dropped the query string still records UTM/oppref.
 */
export function restoreAttributionToUrl(): AttributionMap {
  const attrs = persistAttribution();
  if (typeof window === 'undefined') return attrs;

  const url = new URL(window.location.href);
  let changed = false;
  for (const key of ATTRIBUTION_KEYS) {
    const value = attrs[key];
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
      changed = true;
    }
  }
  if (changed) {
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return attrs;
}

export function attributionForLead(): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
} {
  const attrs = persistAttribution();
  return {
    utmSource: attrs.utm_source ?? null,
    utmMedium: attrs.utm_medium ?? null,
    utmCampaign: attrs.utm_campaign ?? attrs.campaign_id ?? null,
  };
}
