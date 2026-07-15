/**
 * ReminderPicker — JAR-14
 *
 * Empty: Figma node 40001738:13758
 * Filled: Figma node 40001735:27169
 */

import { useEffect, useState } from 'react';
import type { TaskReminderDraft } from '@jarvi/shared';
import { SecondaryButton, Dropdown } from '../../../ui';
import {
  createDefaultReminderDraft,
  hasDuplicateReminder,
  isConfiguredReminder,
  taskHasSchedule,
} from '../../../../lib/reminders';
import { ReminderDraftEditor } from './ReminderDraftEditor';
import { ReminderSummaryRow } from './ReminderSummaryRow';
import styles from './ReminderPicker.module.css';

export interface ReminderPickerProps {
  isOpen: boolean;
  onClose: () => void;
  reminders: TaskReminderDraft[];
  onChange: (reminders: TaskReminderDraft[]) => void;
  taskDueDate?: Date | null;
  taskDueTime?: string;
  anchorRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

export function ReminderPicker({
  isOpen,
  onClose,
  reminders,
  onChange,
  taskDueDate,
  taskDueTime,
  anchorRef,
  className = '',
}: ReminderPickerProps) {
  const canUseRelative = taskHasSchedule(taskDueDate, taskDueTime);
  const [draft, setDraft] = useState<TaskReminderDraft>(() => createDefaultReminderDraft());
  const [channelConfirmed, setChannelConfirmed] = useState(false);

  const configured = reminders.filter(isConfiguredReminder);
  const canAdd =
    isConfiguredReminder(draft) &&
    channelConfirmed &&
    !hasDuplicateReminder(configured, draft);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(createDefaultReminderDraft());
    setChannelConfirmed(false);
  }, [isOpen]);

  const handleRemove = (id: string) => {
    onChange(configured.filter((r) => r.id !== id));
  };

  const handleAddReminder = () => {
    if (!canAdd) return;
    onChange([...configured, draft]);
    setDraft(createDefaultReminderDraft());
    setChannelConfirmed(false);
  };

  if (!isOpen || !anchorRef) return null;

  return (
    <Dropdown
      isOpen={isOpen}
      onClose={onClose}
      anchorRef={anchorRef}
      width={258}
      position="auto-top"
      align="left"
      forceTheme="dark"
      className={className}
      buttonSection={
        <SecondaryButton size="small" fullWidth disabled={!canAdd} onClick={handleAddReminder}>
          Adicionar lembrete
        </SecondaryButton>
      }
    >
      <div className={styles.container}>
        <div className={styles.header}>
          <p className={styles.headerTitle}>Lembretes</p>
        </div>

        {configured.length > 0 && (
          <div className={styles.summaryList}>
            {configured.map((reminder) => (
              <ReminderSummaryRow
                key={reminder.id}
                reminder={reminder}
                onRemove={() => handleRemove(reminder.id)}
              />
            ))}
          </div>
        )}

        <div className={styles.draftSection}>
          <ReminderDraftEditor
            key={draft.id}
            draft={draft}
            canUseRelative={canUseRelative}
            taskDueDate={taskDueDate}
            channelConfirmed={channelConfirmed}
            onChange={setDraft}
            onChannelConfirm={setChannelConfirmed}
          />
        </div>
      </div>
    </Dropdown>
  );
}
