/**
 * Changing the language, and following the one saved on the account.
 */
import { ApiError, api, getSessionToken } from '@/api/client';
import { applyLocale } from './instance';
import { isLocale, matchLocale, type Locale } from './locale';

/**
 * The one way to change the language from the UI (`LanguagePicker`).
 *
 * Switches the screens right away, remembers the choice on this device and,
 * when someone is signed in, saves it on the account with
 * `PATCH /api/users/locale { locale }` so e-mails, WhatsApp, reminders and
 * the AI follow. An old backend without the route (404) is ignored. Any other
 * failure rejects (show `common:language.changeError`); the UI language stays
 * changed either way. Callers that hold the user should also
 * `updateUser({ locale })` so the in-memory profile matches.
 */
export async function changeLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  await applyLocale(locale);
  if (!getSessionToken()) return;
  try {
    await api.patch<{ locale: Locale }>('/api/users/locale', { locale });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return;
    throw error;
  }
}

/**
 * Applies `user.locale` from a freshly loaded profile (the server wins over
 * the device). Missing or unknown values (old backend) change nothing.
 * Returns the applied locale, or null.
 */
export async function applyUserLocale(userLocale: string | null | undefined): Promise<Locale | null> {
  const locale = matchLocale(userLocale);
  if (!locale) return null;
  await applyLocale(locale);
  return locale;
}
