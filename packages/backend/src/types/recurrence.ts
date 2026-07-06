/**
 * Recurrence contract - Jarvi Backend
 *
 * Formal shape of `tasks.recurrence_type` / `tasks.recurrence_config`.
 * Mirrors `packages/shared/src/types/recurrence.ts` 1:1 (also duplicated in
 * `packages/web/src/lib/recurrence.ts`'s import). Deliberately NOT imported
 * from `@jarvi/shared`: Railway's build for this service only copies
 * `packages/backend` into the build context (Root Directory scoping), so a
 * `file:../shared` dependency resolves during `npm install` but breaks at
 * build time because the sibling package is no longer on disk. Keep this
 * file in sync by hand whenever the shared contract changes.
 */

export type RecurrenceType =
  | 'none'
  | 'hourly'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'custom';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/** Default clock time used when a recurrence only specifies a period of day. */
export const TIME_OF_DAY_DEFAULTS: Record<TimeOfDay, string> = {
  morning: '09:00',
  afternoon: '14:00',
  evening: '19:00',
  night: '00:00',
};

/** `weekdays` (Mon-Fri) always implies this fixed set, even with no day-picker UI. */
export const WEEKDAYS_DAYS_OF_WEEK: number[] = [1, 2, 3, 4, 5];

export interface RecurrenceUntil {
  type: 'never' | 'onDate';
  /** ISO date (YYYY-MM-DD), present when type === 'onDate'. */
  date?: string;
}

export interface CustomRecurrenceConfig {
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  /** "every N <frequency>" — e.g. interval=2 + frequency='weekly' = "a cada 2 semanas". */
  interval: number;
  /** 0=Sun...6=Sat, only when frequency === 'weekly'. */
  daysOfWeek?: number[];
  /** 1-31, only when frequency === 'monthly'. */
  monthDay?: number;
}

export interface RecurrenceConfig {
  /** hourly */
  everyHours?: number;
  /** daily / weekdays / weekly */
  timeOfDay?: TimeOfDay;
  /** weekly — 0=Sun...6=Sat */
  daysOfWeek?: number[];
  /** monthly — 1-31 */
  monthDay?: number;
  /** exact "HH:MM", used by monthly/custom */
  time?: string;
  /** only present when recurrence_type === 'custom' */
  custom?: CustomRecurrenceConfig;
  /** mirrors the `recurrence_until` column so the UI can rebuild picker state from the JSON alone */
  until: RecurrenceUntil;
}
