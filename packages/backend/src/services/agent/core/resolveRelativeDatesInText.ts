/**
 * Converts relative date words in persistent task text to absolute dates.
 *
 * Task descriptions are read days or weeks later — "hoje" must not survive
 * past midnight. Used as a deterministic safety net when the agent persists
 * description markdown.
 */

import { addDaysToIsoDate } from './tasks';
import { getDateTimeForTimezone } from './time';

function isoToDdMmYyyy(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Replace common relative date words with `em DD/MM/AAAA` using the user's timezone.
 */
export function resolveRelativeDatesInText(text: string, timezone: string): string {
  const { isoDate } = getDateTimeForTimezone(timezone);
  const yesterday = isoToDdMmYyyy(addDaysToIsoDate(isoDate, -1));
  const today = isoToDdMmYyyy(isoDate);
  const tomorrow = isoToDdMmYyyy(addDaysToIsoDate(isoDate, 1));
  const dayAfterTomorrow = isoToDdMmYyyy(addDaysToIsoDate(isoDate, 2));

  // `\b` is ASCII-only in JS, so "amanhã" needs a Unicode-aware end boundary.
  return text
    .replace(/\bdepois de amanh[aã](?![\p{L}\p{N}])/giu, `em ${dayAfterTomorrow}`)
    .replace(/\bontem\b/gi, `em ${yesterday}`)
    .replace(/\bamanh[aã](?![\p{L}\p{N}])/giu, `em ${tomorrow}`)
    .replace(/\bhoje\b/gi, `em ${today}`);
}
