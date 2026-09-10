/**
 * OpenAI Ads Measurement Pixel for app.jarvi.life.
 *
 * Loads the Pixel base code, persists the ChatGPT click reference (`oppref`)
 * on `.jarvi.life`, and exposes helpers to fire conversion events.
 *
 * `registration_completed` is the campaign optimization event. Fire it only
 * when the account is actually created/verified — not on form start.
 */

import { persistAttribution } from './attribution';

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

let initialized = false;

export function initOpenAiPixel(): void {
  if (initialized || typeof window === 'undefined' || !PIXEL_ID) return;

  persistAttribution();

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
  persistAttribution();
  const options = eventId ? { event_id: eventId } : undefined;
  if (options) {
    window.oaiq('measure', 'registration_completed', { type: 'customer_action' }, options);
  } else {
    window.oaiq('measure', 'registration_completed', { type: 'customer_action' });
  }
}
