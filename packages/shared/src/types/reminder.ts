/**
 * Task reminder types — JAR-14
 *
 * Reminders are independent entities linked to a task.
 * Channel is WhatsApp for now; timezone follows the user's current timezone at scheduling time.
 */

export type ReminderChannel = 'whatsapp';

export type ReminderStatus =
  | 'pending'
  | 'scheduled'
  | 'sent'
  | 'cancelled'
  | 'skipped';

export type RelativeReminderOffsetUnit = 'minutes' | 'hours' | 'days';

export interface RelativeReminderOffset {
  amount: number;
  unit: RelativeReminderOffsetUnit;
  direction: 'before' | 'after';
}

/** Fixed schedule independent of the task due date (e.g. every day at 14:30). */
export type RecurringReminderFrequency = 'daily' | 'weekly';

export type TaskReminderDraft =
  | {
      id: string;
      channel: ReminderChannel;
      type: 'unset';
    }
  | {
      id: string;
      channel: ReminderChannel;
      type: 'relative';
      offset: RelativeReminderOffset;
    }
  | {
      id: string;
      channel: ReminderChannel;
      type: 'absolute';
      /** ISO 8601 local datetime string (YYYY-MM-DDTHH:mm) */
      scheduledAt: string;
    }
  | {
      id: string;
      channel: ReminderChannel;
      type: 'recurring';
      /** Local time HH:mm */
      time: string;
      frequency: RecurringReminderFrequency;
      /** 0 = Sunday … 6 = Saturday; required when frequency is weekly */
      weekday?: number;
    };
