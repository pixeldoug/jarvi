/**
 * OpenAI Ads Measurement Pixel for app.jarvi.life.
 *
 * Loads the Pixel base code, persists the ChatGPT click reference (`oppref`)
 * on `.jarvi.life`, and exposes helpers to fire conversion events.
 *
 * `registration_completed` is the campaign optimization event. Fire it only
 * when the account is actually created/verified — not on form start.
 */

type OaiqFn = ((...args: unknown[]) => void) & {
  q?: unknown[];
};

declare global {
  interface Window {
    oaiq?: OaiqFn;
  }
}

export const DEFAULT_OPENAI_PIXEL_ID = '5szZUPcYMs17mumdMe8uLg';

const PIXEL_ID =
  (import.meta.env.VITE_PUBLIC_OPENAI_PIXEL_ID as string | undefined)?.trim() ||
  DEFAULT_OPENAI_PIXEL_ID;

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
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'),
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; ${cookieFlags()}`;
}

/**
 * Copies `oppref` from the landing hop onto `.jarvi.life` so later pages (and
 * the OpenAI SDK's `__oppref` cookie) keep the ChatGPT click reference.
 */
function ensureOpprefCookie(): void {
  if (typeof window === 'undefined') return;

  const fromUrl = new URLSearchParams(window.location.search).get('oppref');
  const existing = getCookie('__oppref');
  const value = fromUrl || existing;
  if (!value) return;

  if (isJarviHost(window.location.hostname) || fromUrl) {
    setCookie('__oppref', value);
  }
}

export function initOpenAiPixel(): void {
  if (initialized || typeof window === 'undefined' || !PIXEL_ID) return;

  ensureOpprefCookie();

  (function (w: Window, d: Document, s: string, u: string) {
    if (w.oaiq) return;
    const q = function () {
      (q as OaiqFn).q?.push(arguments);
    } as OaiqFn;
    q.q = [];
    w.oaiq = q;
    const js = d.createElement(s) as HTMLScriptElement;
    js.async = true;
    js.src = u;
    const f = d.getElementsByTagName(s)[0];
    f.parentNode?.insertBefore(js, f);
  })(window, document, 'script', 'https://bzrcdn.openai.com/sdk/oaiq.min.js');

  window.oaiq?.('init', { pixelId: PIXEL_ID });
  initialized = true;
}

export function trackRegistrationCompleted(eventId?: string): void {
  if (typeof window === 'undefined' || typeof window.oaiq !== 'function') return;
  ensureOpprefCookie();
  const options = eventId ? { event_id: eventId } : undefined;
  if (options) {
    window.oaiq('measure', 'registration_completed', { type: 'customer_action' }, options);
  } else {
    window.oaiq('measure', 'registration_completed', { type: 'customer_action' });
  }
}
