/**
 * Calendar popover for custom reminder date — Figma node 40001738:13020
 */

import { useMemo } from 'react';
import { Calendar } from '../../../ui/Calendar';
import { Dropdown } from '../../../ui';
import { formatCustomDateLabel } from '../../../../lib/reminders';
import datePickerStyles from '../TaskDatePicker/TaskDatePicker.module.css';

export interface ReminderCustomDatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  selectedDate?: Date | null;
  onDateSelect: (date: Date) => void;
}

export function ReminderCustomDatePicker({
  isOpen,
  onClose,
  anchorRef,
  selectedDate,
  onDateSelect,
}: ReminderCustomDatePickerProps) {
  const headerTitle = useMemo(() => {
    if (!selectedDate) return 'Selecionar data';
    return formatCustomDateLabel(selectedDate);
  }, [selectedDate]);

  return (
    <Dropdown
      isOpen={isOpen}
      onClose={onClose}
      anchorRef={anchorRef}
      width={288}
      align="right"
      position="auto-top"
      forceTheme="dark"
      gap={4}
      disableOutsideIgnoreCheck
      zIndex={1100}
      className={datePickerStyles.reminderDateDropdown}
    >
      <div className={datePickerStyles.reminderDatePicker}>
        <div className={datePickerStyles.header}>
          <span className={datePickerStyles.headerTitle}>{headerTitle}</span>
        </div>
        <hr className={datePickerStyles.divider} />
        <div className={datePickerStyles.calendarSection} data-theme="dark">
          <Calendar
            selectedDate={selectedDate ?? undefined}
            onDateSelect={onDateSelect}
            showOutsideDays
          />
        </div>
      </div>
    </Dropdown>
  );
}
