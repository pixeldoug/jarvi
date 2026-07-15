/**
 * Task reminder contract — Jarvi Backend
 *
 * Mirrors `packages/shared/src/types/reminder.ts` 1:1. Deliberately NOT imported
 * from `@jarvi/shared`: Railway's build for this service only copies
 * `packages/backend` into the build context, so keep this file in sync by hand
 * whenever the shared contract changes.
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
      scheduledAt: string;
    }
  | {
      id: string;
      channel: ReminderChannel;
      type: 'recurring';
      time: string;
      frequency: RecurringReminderFrequency;
      weekday?: number;
    };

export type TaskReminderSchedule =
  | {
      type: 'relative';
      offset: RelativeReminderOffset;
    }
  | {
      type: 'absolute';
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
  triggerAt: string | null;
  timezone: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateTaskReminderInput = {
  channel: ReminderChannel;
} & TaskReminderSchedule;
