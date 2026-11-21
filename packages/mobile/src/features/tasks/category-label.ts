import { i18n, type FormatOptions } from '@/i18n';

/**
 * Default category names are stored data ("Trabalho", "Pessoal", "Compras").
 * Only the label on screen is translated, and only while the stored name is
 * still exactly the default (docs/decisions/0005-i18n.md). Anything the user
 * typed is shown as it is, and filters and payloads keep the stored name.
 *
 * Components pass `{ locale }` (from `useLocale()`): with the React Compiler
 * on, a call without it keeps its first result after a language switch.
 */
const DEFAULT_CATEGORY_KEYS = {
  Trabalho: 'work',
  Pessoal: 'personal',
  Compras: 'shopping',
} as const;

type DefaultCategoryName = keyof typeof DEFAULT_CATEGORY_KEYS;

function isDefaultCategoryName(name: string): name is DefaultCategoryName {
  return Object.prototype.hasOwnProperty.call(DEFAULT_CATEGORY_KEYS, name);
}

/** "Trabalho" → "Work" in en-US; any other name is returned unchanged. */
export function categoryLabel(name: string, options?: FormatOptions): string;
export function categoryLabel(name: string | null | undefined, options?: FormatOptions): string | null | undefined;
export function categoryLabel(name: string | null | undefined, options?: FormatOptions): string | null | undefined {
  if (!name || !isDefaultCategoryName(name)) return name;
  return i18n.t(`tasks:categories.defaults.${DEFAULT_CATEGORY_KEYS[name]}`, { lng: options?.locale });
}
