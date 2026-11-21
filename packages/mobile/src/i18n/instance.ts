/**
 * The i18next instance and the first language. Import from `@/i18n`
 * (index.ts), not from here — except `@/api/client`, which imports this file
 * directly to avoid an import cycle (changeLocale uses the API client).
 *
 * Language order (docs/decisions/0005-i18n.md, "Celular"):
 *   user.locale saved on the server (applied by AuthProvider once the
 *   profile loads: the server wins)
 *   → the language picked on this device (SecureStore `jarvi_locale`)
 *   → the device languages (expo-localization `getLocales()`)
 *   → pt-BR
 *
 * Init is synchronous: catalogs are bundled and the stored choice is read
 * with SecureStore's sync API, so the first frame already has the right
 * language and `t()` works at import time of any screen.
 */
import { createInstance } from 'i18next';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { initReactI18next } from 'react-i18next';

import { storage } from '@/lib/storage';
import { LOCALE_STORAGE_KEY } from './constants';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, matchLocale, resolveLocale, type Locale } from './locale';
import { DEFAULT_NAMESPACE, NAMESPACES, resources } from './resources';

/**
 * The app's own instance (not i18next's global default): always import it
 * from `@/i18n`, never `import i18next from 'i18next'`.
 */
const i18n = createInstance();

// ── Reading the first language ──────────────────────────────────────────────

/** Device languages in the user's order of preference (`['en-US', 'pt-BR']`). */
function deviceLanguageTags(): string[] {
  try {
    return getLocales()
      .map((entry) => entry.languageTag)
      .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
  } catch {
    return [];
  }
}

/** Best supported locale from the device settings, else pt-BR. */
export function getDeviceLocale(): Locale {
  return resolveLocale(deviceLanguageTags());
}

/** The language picked on this device, if any (sync read; null on any failure). */
export function readStoredLocale(): Locale | null {
  try {
    return matchLocale(SecureStore.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** The language to start with, before the user's profile is known. */
export function detectInitialLocale(): Locale {
  return resolveLocale([readStoredLocale(), ...deviceLanguageTags()]);
}

// ── Plurals ─────────────────────────────────────────────────────────────────

/**
 * `count === 1` is `_one`, everything else (0 included) is `_other`.
 *
 * Portuguese: this is the rule the app has always used. CLDR would make 0
 * `_one` ("0 tarefa") and add `_many` for millions; we keep today's text.
 * English: same as CLDR for whole numbers. It is also the fallback when the
 * engine has no `Intl.PluralRules` (Hermes builds without it), so plurals
 * never depend on the JS engine. Catalogs only use `_one` / `_other`
 * (+ optional `_zero`, which i18next picks for count 0 on its own).
 */
const ONE_OTHER_RULE = {
  select: (count: number) => (count === 1 ? 'one' : 'other'),
  resolvedOptions: () => ({ pluralCategories: ['one', 'other'] }),
};

function installPluralRules(): void {
  const resolver = i18n.services.pluralResolver as
    | { getRule: (code: string, options?: { ordinal?: boolean }) => unknown }
    | undefined;
  if (!resolver || typeof resolver.getRule !== 'function') return;
  const original = resolver.getRule.bind(resolver);
  resolver.getRule = (code, options = {}) => {
    if (!options.ordinal && /^(pt|en)([-_]|$)/i.test(code)) return ONE_OTHER_RULE;
    try {
      return original(code, options) ?? ONE_OTHER_RULE;
    } catch {
      return ONE_OTHER_RULE;
    }
  };
}

// ── Init ────────────────────────────────────────────────────────────────────

void i18n.use(initReactI18next).init({
  resources,
  lng: detectInitialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: [...SUPPORTED_LOCALES],
  ns: [...NAMESPACES],
  defaultNS: DEFAULT_NAMESPACE,
  // Resources are bundled: init (and changeLanguage) run synchronously.
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
  returnEmptyString: false,
  react: { useSuspense: false },
});

installPluralRules();

/** The active language, always one of SUPPORTED_LOCALES. */
export function getCurrentLocale(): Locale {
  return matchLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE;
}

export interface ApplyLocaleOptions {
  /** Remember it on this device (SecureStore). Default true. */
  persist?: boolean;
}

/**
 * Switches the UI language (no server call). Screens re-render through
 * react-i18next. Most code wants `changeLocale` from `@/i18n` instead, which
 * also saves the choice on the account.
 */
export async function applyLocale(locale: Locale, { persist = true }: ApplyLocaleOptions = {}): Promise<void> {
  if (!isLocale(locale)) return;
  if (getCurrentLocale() !== locale || i18n.language !== locale) await i18n.changeLanguage(locale);
  if (persist) await storage.set(LOCALE_STORAGE_KEY, locale);
}

export default i18n;
