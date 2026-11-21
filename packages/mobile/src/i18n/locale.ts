/* eslint-disable @typescript-eslint/array-type -- verbatim copy of packages/shared (its lint style). */
/**
 * COPY of packages/shared/src/i18n/locale.ts (docs/decisions/0005-i18n.md).
 *
 * The native app does not depend on @jarvi/shared (Metro does not build it),
 * so the contract is copied here. Everything below the banner MUST stay
 * identical to the shared file: change both in the same PR. The only
 * differences are two `?? …` guards that this package's stricter tsconfig
 * (`noUncheckedIndexedAccess`) requires; they do not change behavior.
 * Mobile-only additions live in ./constants.ts and ./instance.ts, never here.
 */

// ── Verbatim copy of packages/shared/src/i18n/locale.ts ─────────────────────

/**
 * Locale contract shared by web, marketing, backend and mobile.
 * See docs/decisions/0005-i18n.md.
 */

export const SUPPORTED_LOCALES = ['pt-BR', 'en-US'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'pt-BR';

/** Cookie set on `.jarvi.life` so the site and the app agree on the language. */
export const LOCALE_COOKIE = 'jarvi_locale';

/** Query param the site uses to hand the language to the app (`?lang=en-US`). */
export const LOCALE_QUERY_PARAM = 'lang';

/** Header the web/mobile clients send on every API request. */
export const LOCALE_HEADER = 'X-Jarvi-Locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Maps any language tag (`en`, `en-GB`, `pt`, `pt-PT`, `EN_us`) to a supported
 * locale, or null when the language is not supported.
 */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const normalized = tag.trim().replace('_', '-').toLowerCase();
  if (!normalized) return null;
  const exact = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === normalized);
  if (exact) return exact;
  const language = normalized.split('-')[0];
  return SUPPORTED_LOCALES.find((l) => l.toLowerCase().split('-')[0] === language) ?? null;
}

/** First supported locale in the list, else the default. */
export function resolveLocale(candidates: Array<string | null | undefined>): Locale {
  for (const candidate of candidates) {
    const match = matchLocale(candidate);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** Parses an Accept-Language header into tags ordered by quality. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      const quality = q ? Number(q.trim().slice(2)) : 1;
      return { tag: (tag ?? '').trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag && entry.tag !== '*' && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.tag);
}

/** Language part only (`pt`, `en`), for APIs such as Whisper. */
export function localeLanguage(locale: Locale): string {
  return locale.split('-')[0] ?? locale;
}

/**
 * Billing currency for a locale. Currency is a market decision, not a UI
 * language: en-US users pay in USD, everyone else in BRL.
 */
export function localeCurrency(locale: Locale): 'BRL' | 'USD' {
  return locale === 'en-US' ? 'USD' : 'BRL';
}
