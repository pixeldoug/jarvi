/**
 * FrequencyPicker Component - Jarvi Web
 *
 * Popover for configuring a task's recurrence ("Frequência" chip), opened
 * from ControlBar (task creation) and TaskDetailsSidebar (task editing).
 *
 * Unlike TaskDatePicker/PriorityPicker/CategoryPicker (hand-rolled portal +
 * click-outside), this is built on top of the shared `Dropdown` component —
 * same portal/positioning/click-outside/Esc behavior, but one that already
 * knows how to ignore clicks landing inside a NESTED overlay
 * (`data-dialog-outside-click-ignore`). This picker nests several row
 * triggers plus two more `Dropdown`s (compact calendar / exact time fields),
 * and a hand-rolled outside-click handler would close the whole popover the
 * moment a nested option is clicked. `FilterPopover` already established
 * this same pattern for nesting `Select` inside a `Dropdown`.
 *
 * Layout follows the "Frequência" Dropdown design in Figma
 * (node 40001716:70617): a header, then fields grouped into cards, each
 * field rendered as a row with its label on the left and a ghost trigger
 * button (value + chevron) on the right, rather than a full-width bordered
 * select box.
 */

import { useEffect, useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import {
  RecurrenceConfig,
  RecurrenceType,
  type CustomRecurrenceConfig,
} from '@jarvi/shared';
import { Calendar, Dropdown, ListItem, TextInput } from '../../../ui';
import type { SelectOption } from '../../../ui';
import {
  REPEAT_OPTION_LABELS_PT,
  WEEKDAY_SHORT_PT,
  buildDefaultRecurrenceConfig,
} from '../../../../lib/recurrence';
import styles from './FrequencyPicker.module.css';

export interface FrequencyValue {
  recurrenceType: RecurrenceType;
  recurrenceConfig: RecurrenceConfig | null;
}

export interface FrequencyPickerProps {
  /** Whether the popover is open */
  isOpen: boolean;
  /** Callback when the popover should close */
  onClose: () => void;
  /** Anchor element reference for positioning */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Current recurrence type + config */
  value: FrequencyValue;
  /** Callback whenever any field changes (applied immediately, no Save button) */
  onChange: (value: FrequencyValue) => void;
  /** Anchor date for defaults (weekday/day-of-month). Falls back to today when absent. */
  baseDate?: Date;
  /** Additional CSS classes */
  className?: string;
}

const REPEAT_TYPES: RecurrenceType[] = ['daily', 'weekly', 'monthly', 'custom'];

const REPEAT_SELECT_OPTIONS: SelectOption[] = REPEAT_TYPES.map((type) => ({
  value: type,
  label: REPEAT_OPTION_LABELS_PT[type],
}));

const HOURLY_OPTIONS: SelectOption[] = Array.from({ length: 8 }, (_, i) => {
  const n = i + 1;
  return { value: String(n), label: n === 1 ? '1 hora' : `${n} horas` };
});

const CUSTOM_FREQUENCY_OPTIONS: SelectOption[] = [
  { value: 'hourly', label: 'Hora em hora' },
  { value: 'daily', label: 'Dias' },
  { value: 'weekly', label: 'Semanas' },
  { value: 'monthly', label: 'Meses' },
];

const CUSTOM_UNIT_LABEL_PT: Record<CustomRecurrenceConfig['frequency'], string> = {
  hourly: 'horas',
  daily: 'dias',
  weekly: 'semanas',
  monthly: 'meses',
};

const UNTIL_OPTIONS: SelectOption[] = [
  { value: 'never', label: 'Sem término' },
  { value: 'onDate', label: 'Em uma data' },
];

function formatUntilDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  return `${day} ${months[month - 1]} ${year}`;
}

function generateTimeSlots(startHour = 6, endHour = 23, interval = 30): string[] {
  const slots: string[] = [];
  for (let hour = startHour; hour <= endHour; hour++) {
    for (let minute = 0; minute < 60; minute += interval) {
      if (hour === endHour && minute > 0) break;
      slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
    }
  }
  return slots;
}

// ============================================================================
// Local subcomponents
// ============================================================================

interface RowTriggerProps {
  isOpen: boolean;
  onClick: () => void;
  value: string;
  triggerRef: React.RefObject<HTMLButtonElement>;
}

function RowTrigger({ isOpen, onClick, value, triggerRef }: RowTriggerProps) {
  return (
    <button
      ref={triggerRef}
      type="button"
      className={[styles.rowTrigger, isOpen && styles.rowTriggerOpen].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <span className={styles.rowTriggerValue}>{value}</span>
      <span className={[styles.rowTriggerIcon, isOpen && styles.rowTriggerIconOpen].filter(Boolean).join(' ')}>
        <CaretDown size={16} weight="regular" />
      </span>
    </button>
  );
}

interface SelectFieldRowProps {
  label: string;
  value: string;
  options: SelectOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

function SelectFieldRow({
  label,
  value,
  options,
  onSelect,
  placeholder = 'Definir',
  isOpen,
  onOpenChange,
}: SelectFieldRowProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <RowTrigger
        triggerRef={triggerRef}
        isOpen={isOpen}
        onClick={() => onOpenChange(!isOpen)}
        value={selectedOption?.label ?? placeholder}
      />

      <Dropdown
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        anchorRef={triggerRef}
        width={220}
        forceTheme="dark"
        disableOutsideIgnoreCheck
      >
        <div className={styles.options} role="listbox" aria-label={label}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <ListItem
                key={option.value}
                label={option.label}
                active={isSelected}
                onClick={() => {
                  onSelect(option.value);
                  onOpenChange(false);
                }}
                buttonProps={{ role: 'option', 'aria-selected': isSelected }}
              />
            );
          })}
        </div>
      </Dropdown>
    </div>
  );
}

interface CalendarFieldRowProps {
  label: string;
  triggerLabel: string | null;
  placeholder: string;
  selectedDate?: Date;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (date: Date) => void;
}

function CalendarFieldRow({
  label,
  triggerLabel,
  placeholder,
  selectedDate,
  isOpen,
  onOpenChange,
  onSelect,
}: CalendarFieldRowProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <RowTrigger
        triggerRef={triggerRef}
        isOpen={isOpen}
        onClick={() => onOpenChange(!isOpen)}
        value={triggerLabel || placeholder}
      />

      <Dropdown
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        anchorRef={triggerRef}
        width={280}
        disableOutsideIgnoreCheck
      >
        <Calendar selectedDate={selectedDate} onDateSelect={onSelect} showOutsideDays />
      </Dropdown>
    </div>
  );
}

interface ExactTimeFieldRowProps {
  label: string;
  value?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (time: string) => void;
}

function ExactTimeFieldRow({ label, value, isOpen, onOpenChange, onSelect }: ExactTimeFieldRowProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [manualTime, setManualTime] = useState(value || '');
  const timeSlots = generateTimeSlots();

  useEffect(() => {
    setManualTime(value || '');
  }, [value]);

  const handleManualTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualTime(e.target.value.replace(/[^\d:]/g, '').slice(0, 5));
  };

  const commitManualTime = () => {
    const match = manualTime.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);
    if (match) {
      onSelect(`${match[1].padStart(2, '0')}:${match[2]}`);
    }
  };

  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <RowTrigger
        triggerRef={triggerRef}
        isOpen={isOpen}
        onClick={() => onOpenChange(!isOpen)}
        value={value || 'Definir'}
      />

      <Dropdown
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        anchorRef={triggerRef}
        width={220}
        disableOutsideIgnoreCheck
        buttonSection={(
          <TextInput
            placeholder="00:00"
            value={manualTime}
            onChange={handleManualTimeChange}
            onBlur={commitManualTime}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitManualTime();
                onOpenChange(false);
              }
            }}
            showLabel={false}
          />
        )}
      >
        <div className={styles.timeOptions}>
          {timeSlots.map((time) => (
            <ListItem
              key={time}
              label={time}
              onClick={() => onSelect(time)}
              buttonProps={{ role: 'option', 'aria-selected': time === value }}
            />
          ))}
        </div>
      </Dropdown>
    </div>
  );
}

interface WeekdayDropdownRowProps {
  value: number[];
  onToggle: (day: number) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

function WeekdayDropdownRow({ value, onToggle, isOpen, onOpenChange }: WeekdayDropdownRowProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  const triggerLabel = value.length === 0
    ? 'Definir'
    : [...value].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT_PT[d]).join(', ');

  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>Dias da semana</span>
      <RowTrigger
        triggerRef={triggerRef}
        isOpen={isOpen}
        onClick={() => onOpenChange(!isOpen)}
        value={triggerLabel}
      />

      <Dropdown
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        anchorRef={triggerRef}
        width={220}
        forceTheme="dark"
        disableOutsideIgnoreCheck
      >
        <div className={styles.options} role="listbox" aria-label="Dias da semana" aria-multiselectable="true">
          {WEEKDAY_SHORT_PT.map((label, day) => {
            const isSelected = value.includes(day);
            const isOnlyOne = value.length <= 1 && isSelected;
            return (
              <ListItem
                key={day}
                label={label}
                active={isSelected}
                disabled={isOnlyOne}
                onClick={() => {
                  if (!isOnlyOne) onToggle(day);
                }}
                buttonProps={{ role: 'option', 'aria-selected': isSelected }}
              />
            );
          })}
        </div>
      </Dropdown>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function FrequencyPicker({
  isOpen,
  onClose,
  anchorRef,
  value,
  onChange,
  baseDate,
  className = '',
}: FrequencyPickerProps) {
  const [openField, setOpenField] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) setOpenField(null);
  }, [isOpen]);

  const effectiveBaseDate = baseDate ?? new Date();
  const { recurrenceType, recurrenceConfig: config } = value;

  const emit = (nextType: RecurrenceType, nextConfig: RecurrenceConfig | null) => {
    onChange({ recurrenceType: nextType, recurrenceConfig: nextConfig });
  };

  const patchConfig = (patch: Partial<RecurrenceConfig>) => {
    if (!config) return;
    emit(recurrenceType, { ...config, ...patch });
  };

  const handleRepeatChange = (nextTypeValue: string) => {
    const nextType = nextTypeValue as RecurrenceType;
    const nextConfig = buildDefaultRecurrenceConfig(nextType, effectiveBaseDate, config?.until);
    emit(nextType, nextConfig);
  };

  const custom = config?.custom;
  const until = config?.until ?? { type: 'never' as const };

  const handleCustomFrequencyChange = (frequencyValue: string) => {
    const frequency = frequencyValue as CustomRecurrenceConfig['frequency'];
    patchConfig({
      custom: {
        frequency,
        interval: custom?.interval || 1,
        daysOfWeek: frequency === 'weekly' ? [effectiveBaseDate.getDay()] : undefined,
        monthDay: frequency === 'monthly' ? effectiveBaseDate.getDate() : undefined,
      },
    });
  };

  const handleCustomIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!custom) return;
    const n = Math.max(1, parseInt(e.target.value, 10) || 1);
    patchConfig({ custom: { ...custom, interval: n } });
  };

  const handleCustomWeekdayToggle = (day: number) => {
    if (!custom) return;
    const current = custom.daysOfWeek ?? [];
    const isSelected = current.includes(day);
    if (isSelected && current.length <= 1) return; // always keep at least 1 selected
    const next = isSelected ? current.filter((d: number) => d !== day) : [...current, day];
    patchConfig({ custom: { ...custom, daysOfWeek: next } });
  };

  if (!isOpen) return null;

  return (
    <Dropdown
      isOpen={isOpen}
      onClose={onClose}
      anchorRef={anchorRef}
      width={304}
      position="auto-top"
      forceTheme="dark"
      className={className}
    >
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>Recorrência</span>
        </div>

        <div className={styles.card}>
          <SelectFieldRow
            label="Repetir"
            value={recurrenceType === 'none' ? '' : recurrenceType}
            options={REPEAT_SELECT_OPTIONS}
            onSelect={handleRepeatChange}
            isOpen={openField === 'repeat'}
            onOpenChange={(open) => setOpenField(open ? 'repeat' : null)}
          />

          {recurrenceType === 'hourly' && config && (
            <SelectFieldRow
              label="A cada"
              value={String(config.everyHours ?? 1)}
              options={HOURLY_OPTIONS}
              onSelect={(val) => patchConfig({ everyHours: Number(val) })}
              isOpen={openField === 'everyHours'}
              onOpenChange={(open) => setOpenField(open ? 'everyHours' : null)}
            />
          )}

          {(recurrenceType === 'daily' || recurrenceType === 'weekdays') && config && (
            <ExactTimeFieldRow
              label="Horário"
              value={config.time}
              isOpen={openField === 'timeOfDay'}
              onOpenChange={(open) => setOpenField(open ? 'timeOfDay' : null)}
              onSelect={(time) => {
                patchConfig({ time });
                setOpenField(null);
              }}
            />
          )}

          {recurrenceType === 'weekly' && config && (
            <>
              <WeekdayDropdownRow
                value={config.daysOfWeek ?? []}
                onToggle={(day) => {
                  const current = config.daysOfWeek ?? [];
                  const isSelected = current.includes(day);
                  if (isSelected && current.length <= 1) return;
                  const next = isSelected ? current.filter((d: number) => d !== day) : [...current, day];
                  patchConfig({ daysOfWeek: next });
                }}
                isOpen={openField === 'weekdays'}
                onOpenChange={(open) => setOpenField(open ? 'weekdays' : null)}
              />
              <ExactTimeFieldRow
                label="Horário"
                value={config.time}
                isOpen={openField === 'timeOfDay'}
                onOpenChange={(open) => setOpenField(open ? 'timeOfDay' : null)}
                onSelect={(time) => {
                  patchConfig({ time });
                  setOpenField(null);
                }}
              />
            </>
          )}

          {recurrenceType === 'monthly' && config && (
            <>
              <CalendarFieldRow
                label="Dia do mês"
                triggerLabel={config.monthDay ? `Todo mês no dia ${config.monthDay}` : null}
                placeholder="Definir dia"
                selectedDate={effectiveBaseDate}
                isOpen={openField === 'monthDay'}
                onOpenChange={(open) => setOpenField(open ? 'monthDay' : null)}
                onSelect={(date) => {
                  patchConfig({ monthDay: date.getDate() });
                  setOpenField(null);
                }}
              />
              <ExactTimeFieldRow
                label="Horário"
                value={config.time}
                isOpen={openField === 'exactTime'}
                onOpenChange={(open) => setOpenField(open ? 'exactTime' : null)}
                onSelect={(time) => {
                  patchConfig({ time });
                  setOpenField(null);
                }}
              />
            </>
          )}

          {recurrenceType === 'custom' && config && custom && (
            <>
              <SelectFieldRow
                label="Recorrência"
                value={custom.frequency}
                options={CUSTOM_FREQUENCY_OPTIONS}
                onSelect={handleCustomFrequencyChange}
                isOpen={openField === 'customFrequency'}
                onOpenChange={(open) => setOpenField(open ? 'customFrequency' : null)}
              />

              <div className={styles.cardBlock}>
                <div className={styles.intervalRow}>
                  <TextInput
                    type="number"
                    label="A cada"
                    value={String(custom.interval)}
                    onChange={handleCustomIntervalChange}
                    className={styles.intervalInput}
                  />
                  <span className={styles.intervalUnit}>{CUSTOM_UNIT_LABEL_PT[custom.frequency]}</span>
                </div>
              </div>

              {custom.frequency === 'weekly' && (
                <WeekdayDropdownRow
                  value={custom.daysOfWeek ?? []}
                  onToggle={handleCustomWeekdayToggle}
                  isOpen={openField === 'customWeekdays'}
                  onOpenChange={(open) => setOpenField(open ? 'customWeekdays' : null)}
                />
              )}

              {custom.frequency === 'monthly' && (
                <CalendarFieldRow
                  label="Dia do mês"
                  triggerLabel={custom.monthDay ? `Todo mês no dia ${custom.monthDay}` : null}
                placeholder="Definir dia"
                selectedDate={effectiveBaseDate}
                isOpen={openField === 'customMonthDay'}
                  onOpenChange={(open) => setOpenField(open ? 'customMonthDay' : null)}
                  onSelect={(date) => {
                    patchConfig({ custom: { ...custom, monthDay: date.getDate() } });
                    setOpenField(null);
                  }}
                />
              )}

              {custom.frequency !== 'hourly' && (
                <ExactTimeFieldRow
                  label="Horário exato"
                  value={config.time}
                  isOpen={openField === 'customExactTime'}
                  onOpenChange={(open) => setOpenField(open ? 'customExactTime' : null)}
                  onSelect={(time) => {
                    patchConfig({ time });
                    setOpenField(null);
                  }}
                />
              )}
            </>
          )}
        </div>

        <div className={styles.card}>
          <SelectFieldRow
            label="Termina"
            value={until.type}
            options={UNTIL_OPTIONS}
            onSelect={(val) => {
              const type = val as 'never' | 'onDate';
              const nextUntil =
                type === 'never'
                  ? { type: 'never' as const }
                  : { type: 'onDate' as const, date: until.date ?? new Date().toISOString().split('T')[0] };
              if (config) {
                patchConfig({ until: nextUntil });
              }
            }}
            isOpen={openField === 'untilType'}
            onOpenChange={(open) => setOpenField(open ? 'untilType' : null)}
          />

          {until.type === 'onDate' && (
            <CalendarFieldRow
              label="Data"
              triggerLabel={until.date ? formatUntilDate(until.date) : null}
              placeholder="Definir data"
              selectedDate={until.date ? new Date(`${until.date}T00:00:00`) : effectiveBaseDate}
              isOpen={openField === 'untilDate'}
              onOpenChange={(open) => setOpenField(open ? 'untilDate' : null)}
              onSelect={(date) => {
                patchConfig({ until: { type: 'onDate', date: date.toISOString().split('T')[0] } });
                setOpenField(null);
              }}
            />
          )}
        </div>
      </div>
    </Dropdown>
  );
}
