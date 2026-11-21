import { formatRelativeDay, formatTime, i18n, type FormatOptions } from '@/i18n';
import { normalizeTime, parseDateKey } from '@/lib/dates';

/**
 * A task's due date in lists and toasts: "Hoje", "Amanhã", "Ontem", the
 * weekday for the next six days, otherwise "7 Jan" (with the year when it is
 * not this one); ", 09:00" appended when timed.
 *   pt "Sexta, 09:00"   en "Friday, 9:00 AM"
 *
 * Call it while rendering (pass `now: useToday()` and the `useLocale()`
 * locale), or at the moment the text is shown outside React.
 */
export function formatDueLabel(
  dueDate?: string | null,
  time?: string | null,
  options: FormatOptions = {},
): string | null {
  const date = parseDateKey(dueDate);
  if (!date) return null;
  const day = formatRelativeDay(date, { ...options, weekdayThisWeek: true });
  const clock = normalizeTime(time);
  if (!clock) return day;
  return i18n.t('common:time.dateWithTime', {
    lng: options.locale,
    date: day,
    time: formatTime(clock, 'clock', options),
  });
}
