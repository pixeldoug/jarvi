/**
 * Paid-traffic identifiers that must survive jarvi.life → app.jarvi.life.
 *
 * `oppref` is injected by OpenAI Ads (do not put it in the Ads Manager tracking
 * field). `campaign_id` / `ad_id` come from that field. UTMs are ours.
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

export const ATTRIBUTION_COOKIE = '__jarvi_attr';
const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const MAX_VALUE_LENGTH = 200;

function isJarviHost(hostname: string): boolean {
  return hostname === 'jarvi.life' || hostname.endsWith('.jarvi.life');
}

function cookieFlags(): string {
  if (typeof window === 'undefined') return `Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
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
  const stored = new URLSearchParams(getCookie(ATTRIBUTION_COOKIE));
  const fromUrl =
    typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
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
 * Inline fragment for the beforeInteractive pixel bootstrap. Expects
 * `flags` and `getCookie` to already be in scope.
 */
export function getAttributionPersistSnippet(): string {
  const keys = ATTRIBUTION_KEYS.map((key) => `'${key}'`).join(',');
  return `var KEYS=[${keys}];
  try{
    var stored=new URLSearchParams(getCookie('${ATTRIBUTION_COOKIE}')||'');
    var incoming=new URLSearchParams(location.search);
    var changed=false;
    KEYS.forEach(function(k){
      var v=incoming.get(k);
      if(v){stored.set(k,String(v).slice(0,${MAX_VALUE_LENGTH}));changed=true;}
    });
    if(changed){
      document.cookie='${ATTRIBUTION_COOKIE}='+encodeURIComponent(stored.toString())+flags;
    }
    var oppref=incoming.get('oppref')||stored.get('oppref')||getCookie('__oppref');
    if(oppref){
      document.cookie='__oppref='+encodeURIComponent(oppref)+flags;
    }
  }catch(e){}`;
}
