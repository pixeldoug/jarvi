/**
 * Configured reminder — Figma filled row (node 40001735:27173)
 */

import { Bell, Trash } from '@phosphor-icons/react';
import type { TaskReminderDraft } from '@jarvi/shared';
import { formatReminderLabel } from '../../../../lib/reminders';
import styles from './ReminderPicker.module.css';

export interface ReminderSummaryRowProps {
  reminder: Exclude<TaskReminderDraft, { type: 'unset' }>;
  onRemove: () => void;
}

export function ReminderSummaryRow({ reminder, onRemove }: ReminderSummaryRowProps) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryContent}>
        <Bell size={16} weight="regular" className={styles.summaryIcon} aria-hidden />
        <span className={styles.summaryLabel}>{formatReminderLabel(reminder)}</span>
      </div>
      <button
        type="button"
        className={styles.summaryDeleteButton}
        onClick={onRemove}
        aria-label={`Remover lembrete ${formatReminderLabel(reminder)}`}
      >
        <Trash size={20} weight="regular" />
      </button>
    </div>
  );
}
