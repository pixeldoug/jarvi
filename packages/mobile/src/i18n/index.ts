/**
 * i18n for packages/mobile. Rules: compliance.md › "Textos e idiomas".
 * Contract: docs/decisions/0005-i18n.md.
 *
 * `src/app/_layout.tsx` imports this module first thing, which initialises
 * i18next synchronously (bundled catalogs, stored choice, device language).
 *
 * Text in components:
 *   import { useTranslation } from 'react-i18next';
 *   const { t } = useTranslation('tasks');        // or useTranslation() for common
 *   t('toast.created')                            // tasks:toast.created
 *   t('actions.save', { ns: 'common' })           // another namespace
 *   t('counts.tasks', { count })                  // plural: tasks_one / tasks_other
 *   // `ns:key` prefixes type-check for namespaces passed to the hook:
 *   const { t } = useTranslation(['tasks', 'common']); t('common:actions.save')
 *
 * Text outside React (lib/, hooks, Alert titles built in callbacks):
 *   import { i18n } from '@/i18n';
 *   i18n.t('tasks:toast.created')     // at the moment it is shown, never at module load
 *
 * Dates, times, numbers, money, lists: `useFormat()` in components,
 * `formatDate` & co. elsewhere (./format.ts).
 *
 * Changing the language: `changeLocale(locale)` (also saves it on the
 * account). The current one: `useLocale()` / `getCurrentLocale()`.
 */
import i18n from './instance';

export { i18n };
export {
  applyLocale,
  detectInitialLocale,
  getCurrentLocale,
  getDeviceLocale,
  readStoredLocale,
  type ApplyLocaleOptions,
} from './instance';
export { applyUserLocale, changeLocale } from './change-locale';
export { useFormat, useLocale } from './hooks';
export { DEFAULT_NAMESPACE, NAMESPACES, type Namespace } from './resources';
export { LOCALE_NATIVE_NAMES, LOCALE_STORAGE_KEY } from './constants';
export {
  DEFAULT_LOCALE,
  LOCALE_HEADER,
  SUPPORTED_LOCALES,
  isLocale,
  localeCurrency,
  localeLanguage,
  matchLocale,
  resolveLocale,
  type Locale,
} from './locale';
export * from './format';
export default i18n;
