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
  push?: FbqFn;
  callMethod?: (...args: unknown[]) => void;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

const PIXEL_ID = import.meta.env.VITE_PUBLIC_META_PIXEL_ID as string | undefined;

let initialized = false;

export function initMetaPixel(): void {
  if (initialized || typeof window === 'undefined' || !PIXEL_ID) return;

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

  window.fbq?.('init', PIXEL_ID);
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

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : undefined;
}

export interface FbCookies {
  fbc?: string;
  fbp?: string;
}

/**
 * Reads the Meta first-party cookies. If `_fbc` is missing but the URL carries
 * an `fbclid`, reconstructs the `fbc` value per Meta's expected format.
 */
export function getFbCookies(): FbCookies {
  if (typeof window === 'undefined') return {};
  let fbc = getCookie('_fbc');
  const fbp = getCookie('_fbp');

  if (!fbc) {
    const fbclid = new URLSearchParams(window.location.search).get('fbclid');
    if (fbclid) {
      fbc = `fb.1.${Date.now()}.${fbclid}`;
    }
  }

  return { fbc, fbp };
}

export function generateEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
