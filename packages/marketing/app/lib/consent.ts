export const CONSENT_STORAGE_KEY = 'jarvi_cookie_consent';

export type CookieConsentValue = 'accepted' | 'rejected';

export function getStoredConsent(): CookieConsentValue | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (value === 'accepted' || value === 'rejected') return value;
  } catch {
    /* ignore */
  }
  return null;
}

export function storeConsent(value: CookieConsentValue): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}
