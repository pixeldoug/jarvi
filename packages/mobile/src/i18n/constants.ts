/**
 * Mobile-only i18n constants. The shared contract (SUPPORTED_LOCALES,
 * matchLocale…) is in ./locale.ts, a copy of packages/shared.
 */
import type { Locale } from './locale';

/**
 * Each language written in itself, for the language picker. Not translated
 * on purpose (and kept out of the catalogs so nobody translates them):
 * someone who cannot read the current language must still find their own.
 */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  'pt-BR': 'Português',
  'en-US': 'English',
};

/** SecureStore key for the language picked on this device (same name as the web cookie). */
export const LOCALE_STORAGE_KEY = 'jarvi_locale';
