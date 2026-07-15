/**
 * Time list popover for custom reminder — matches TaskDatePicker time UI
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { XCircle } from '@phosphor-icons/react';
import { Dropdown, ListItem, TextInput } from '../../../ui';
import { generateTimeSlots } from '../../../../lib/timeSlots';
import timePickerStyles from '../TaskDatePicker/TaskDatePicker.module.css';

export interface ReminderCustomTimePickerProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  selectedTime?: string | null;
  onTimeSelect: (time: string) => void;
}

export function ReminderCustomTimePicker({
  isOpen,
  onClose,
  anchorRef,
  selectedTime,
  onTimeSelect,
}: ReminderCustomTimePickerProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [manualTime, setManualTime] = useState(selectedTime || '');
  const timeSlots = useMemo(() => generateTimeSlots(), []);

  useEffect(() => {
    setManualTime(selectedTime || '');
  }, [selectedTime]);

  useEffect(() => {
    if (!isOpen) return;

    const initialTime = selectedTime || '09:00';
    const selectedTimeItem = listRef.current?.querySelector(
      `[data-time-value="${initialTime}"]`,
    ) as HTMLButtonElement | null;

    selectedTimeItem?.scrollIntoView({
      block: selectedTime ? 'center' : 'start',
      behavior: 'auto',
    });
  }, [isOpen, selectedTime]);

  const handleManualTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setManualTime(value.replace(/[^\d:]/g, '').slice(0, 5));
  };

  const commitManualTime = () => {
    const match = manualTime.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);
    if (!match) return;
    const formattedTime = `${match[1].padStart(2, '0')}:${match[2]}`;
    onTimeSelect(formattedTime);
    onClose();
  };

  const handleManualTimeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitManualTime();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleClearTime = () => {
    setManualTime('');
  };

  return (
    <Dropdown
      isOpen={isOpen}
      onClose={onClose}
      anchorRef={anchorRef}
      width={269}
      align="right"
      position="auto-top"
      forceTheme="dark"
      gap={4}
      disableOutsideIgnoreCheck
      zIndex={1100}
      className={timePickerStyles.reminderTimeDropdown}
    >
      <div className={timePickerStyles.reminderTimePicker}>
        <div className={timePickerStyles.timePickerHeader}>
          <span className={timePickerStyles.timePickerTitle}>Defina um horário</span>
        </div>
        <div ref={listRef} className={timePickerStyles.timePickerList}>
          {timeSlots.map((time) => (
            <ListItem
              key={time}
              label={time}
              onClick={() => {
                onTimeSelect(time);
                onClose();
              }}
              buttonProps={{
                role: 'option',
                'aria-selected': time === selectedTime,
                'data-time-value': time,
              }}
            />
          ))}
        </div>
        <div className={timePickerStyles.timePickerFooter}>
          <TextInput
            placeholder="00:00"
            value={manualTime}
            onChange={handleManualTimeChange}
            onBlur={commitManualTime}
            onKeyDown={handleManualTimeKeyDown}
            showLabel={false}
            actionIcon={manualTime ? XCircle : undefined}
            onActionClick={handleClearTime}
            actionAriaLabel="Limpar horário"
            className={timePickerStyles.timePickerInput}
          />
        </div>
      </div>
    </Dropdown>
  );
}
