/**
 * Task reminder types — JAR-14
 *
 * Reminders are independent entities linked to a task.
 * Channels: WhatsApp message or phone call (voice); timezone follows the user's
 * current timezone at scheduling time.
 */

export type ReminderChannel = 'whatsapp' | 'call';

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

/** Persisted reminder schedule (API / database). */
export type TaskReminderSchedule =
  | {
      type: 'relative';
      offset: RelativeReminderOffset;
    }
  | {
      type: 'absolute';
      /** ISO 8601 local datetime string (YYYY-MM-DDTHH:mm) */
      scheduledAt: string;
    }
  | {
      type: 'recurring';
      time: string;
      frequency: RecurringReminderFrequency;
      weekday?: number;
    };

export interface TaskReminder {
  id: string;
  taskId: string;
  userId: string;
  channel: ReminderChannel;
  schedule: TaskReminderSchedule;
  status: ReminderStatus;
  /** UTC ISO timestamp for the next fire time, or null when not schedulable. */
  triggerAt: string | null;
  timezone: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateTaskReminderInput = {
  channel: ReminderChannel;
} & TaskReminderSchedule;
