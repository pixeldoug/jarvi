/**
 * Meta Pixel (browser) for app.jarvi.life.
 *
 * Loads the Pixel base code, exposes typed helpers to fire events with an
 * `eventID` (for browser↔CAPI deduplication), and reads the `_fbc`/`_fbp`
 * cookies so they can be forwarded to the backend for server-side matching.
 *
 * CompleteRegistration is intentionally NOT fired here — it is sent server-side
 * via the Conversions API because email verification can happen off-session or
 * on another device.
 */

type FbqFn = ((...args: unknown[]) => void) & {
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

const PIXEL_ID = import.meta.env.VITE_PUBLIC_META_PIXEL_ID as string | undefined;

const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

let initialized = false;

function isJarviHost(hostname: string): boolean {
  return hostname === 'jarvi.life' || hostname.endsWith('.jarvi.life');
}

function cookieFlags(): string {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const domain = isJarviHost(window.location.hostname) ? '; Domain=.jarvi.life' : '';
  return `Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}${domain}`;
}

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; ${cookieFlags()}`;
}

export interface FbCookies {
  fbc?: string;
  fbp?: string;
}

/**
 * Writes `_fbc`/`_fbp` on `.jarvi.life` so the landing hop and CAPI share the
 * same click ids. Safe to call more than once.
 */
function ensureMetaCookies(): FbCookies {
  if (typeof window === 'undefined') return {};

  let fbc = getCookie('_fbc');
  let fbp = getCookie('_fbp');
  const share = isJarviHost(window.location.hostname);

  if (!fbc) {
    const fbclid = new URLSearchParams(window.location.search).get('fbclid');
    if (fbclid) {
      fbc = `fb.1.${Date.now()}.${fbclid}`;
      setCookie('_fbc', fbc);
    }
  } else if (share) {
    setCookie('_fbc', fbc);
  }

  if (!fbp) {
    fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 2147483647)}`;
    setCookie('_fbp', fbp);
  } else if (share) {
    setCookie('_fbp', fbp);
  }

  return { fbc, fbp };
}

export function initMetaPixel(): void {
  if (initialized || typeof window === 'undefined' || !PIXEL_ID) return;

  ensureMetaCookies();

  /* eslint-disable */
  (function (f: any, b: Document, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode?.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  const initOpts = isJarviHost(window.location.hostname)
    ? {
        cookieDomain: 'jarvi.life',
        cookieFlags: `domain=.jarvi.life;samesite=lax${
          window.location.protocol === 'https:' ? ';secure' : ''
        }`,
      }
    : {};
  window.fbq?.('init', PIXEL_ID, {}, initOpts);
  window.fbq?.('track', 'PageView');
  initialized = true;
}

export interface TrackOptions {
  params?: Record<string, unknown>;
  eventId?: string;
  /** Use trackCustom for non-standard events (e.g. RegistrationSubmitted). */
  custom?: boolean;
}

export function trackPixel(eventName: string, options: TrackOptions = {}): void {
  if (typeof window === 'undefined' || !window.fbq) return;
  const method = options.custom ? 'trackCustom' : 'track';
  const eventData = options.eventId ? { eventID: options.eventId } : undefined;
  window.fbq(method, eventName, options.params ?? {}, eventData);
}

/**
 * Reads the Meta first-party cookies. If `_fbc` is missing but the URL carries
 * an `fbclid`, reconstructs the `fbc` value and persists it on `.jarvi.life`.
 */
export function getFbCookies(): FbCookies {
  return ensureMetaCookies();
}

export function generateEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
