import { i18n, type FormatOptions } from '@/i18n';

import { PLACEHOLDER_NAME } from './onboarding';

/**
 * WhatsApp sign-ups are stored with the sentinel name "Você" until the person
 * gives a real one. The stored value is never translated; only the label on
 * screen follows the language (pt-BR "Você", en-US "You"), like the web's
 * `isPlaceholderName` (docs/decisions/0005-i18n.md).
 */
export function isPlaceholderName(name: string | null | undefined): boolean {
  return (name ?? '').trim() === PLACEHOLDER_NAME;
}

/**
 * Shown name: preferred name, else name; the sentinel reads as `common:user.you`.
 * Components pass `{ locale }` so the label follows a language switch.
 */
export function displayName(user: { name: string; preferred_name?: string | null }, options?: FormatOptions): string {
  const name = user.preferred_name || user.name;
  return isPlaceholderName(name) ? i18n.t('common:user.you', { lng: options?.locale }) : name;
}
