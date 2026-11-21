/** Phone helpers for WhatsApp sign-in. Same countries and masks as the web. */
import { i18n, type Locale } from '@/i18n';

export type CountryIso = 'BR' | 'PT' | 'US' | 'AR';

export interface CountryDial {
  iso: CountryIso;
  flag: string;
  dial: string;
}

export const COUNTRY_DIALS: CountryDial[] = [
  { iso: 'BR', flag: '🇧🇷', dial: '55' },
  { iso: 'PT', flag: '🇵🇹', dial: '351' },
  { iso: 'US', flag: '🇺🇸', dial: '1' },
  { iso: 'AR', flag: '🇦🇷', dial: '54' },
];

/** Placeholder of the number field (`auth` keys; resolve with `t()` at render). */
export const PHONE_PLACEHOLDER_KEYS = {
  BR: 'whatsapp.placeholders.BR',
  PT: 'whatsapp.placeholders.PT',
  US: 'whatsapp.placeholders.US',
  AR: 'whatsapp.placeholders.AR',
} as const satisfies Record<CountryIso, string>;

/**
 * Country the sign-in starts on: the US for en-US, Brazil otherwise. The UI
 * language is only a hint here (language is not country); the person can
 * still pick another one.
 */
export function defaultCountryIso(locale: Locale): CountryIso {
  return locale === 'en-US' ? 'US' : 'BR';
}

export function countryByIso(iso: string): CountryDial {
  return COUNTRY_DIALS.find((country) => country.iso === iso) ?? COUNTRY_DIALS[0]!;
}

export function formatNationalNumber(input: string, iso: string): string {
  const value = input.replace(/\D/g, '');
  if (iso === 'BR') {
    const digits = value.slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (iso === 'US') {
    const digits = value.slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value.slice(0, 15).replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

export function toE164(dial: string, national: string): string {
  return `+${dial}${national.replace(/\D/g, '')}`;
}

/**
 * Error message (current language) for an invalid national number, or null
 * when it looks fine. Call it when validating, never at module load.
 */
export function validateNationalNumber(national: string, iso: string): string | null {
  const digits = national.replace(/\D/g, '');
  if (iso === 'BR' && digits.length < 10) return i18n.t('auth:whatsapp.errors.invalidWithAreaCode');
  if (digits.length < 8) return i18n.t('auth:whatsapp.errors.invalid');
  return null;
}

/** "+5511990009900" → "+55 (11) 99000-9900" for display. */
export function formatE164(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const country = COUNTRY_DIALS.find((c) => digits.startsWith(c.dial) && digits.length > c.dial.length);
  return country ? `+${country.dial} ${formatNationalNumber(digits.slice(country.dial.length), country.iso)}` : e164;
}
