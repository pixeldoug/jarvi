/**
 * Draft reminder editor — Figma nodes 40001738:13762, 40001746:14748
 */

import { useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import type { ReminderChannel, TaskReminderDraft } from '@jarvi/shared';
import { Dropdown, ListItem } from '../../../ui';
import {
  dateToIsoDateString,
  formatChannelLabel,
  formatChannelOptionLabel,
  formatCustomDateLabel,
  formatReminderLabel,
  getWhenDropdownPresets,
  REMINDER_CHANNEL_OPTIONS,
  type RelativeReminderPreset,
} from '../../../../lib/reminders';
import { ReminderCustomDatePicker } from './ReminderCustomDatePicker';
import { ReminderCustomTimePicker } from './ReminderCustomTimePicker';
import styles from './ReminderPicker.module.css';

export interface ReminderDraftEditorProps {
  draft: TaskReminderDraft;
  canUseRelative: boolean;
  taskDueDate?: Date | null;
  channelConfirmed: boolean;
  onChange: (draft: TaskReminderDraft) => void;
  onChannelConfirm: (confirmed: boolean) => void;
}

export function ReminderDraftEditor({
  draft,
  canUseRelative,
  taskDueDate,
  channelConfirmed,
  onChange,
  onChannelConfirm,
}: ReminderDraftEditorProps) {
  const quandoTriggerRef = useRef<HTMLButtonElement>(null);
  const dataTriggerRef = useRef<HTMLButtonElement>(null);
  const horarioTriggerRef = useRef<HTMLButtonElement>(null);
  const canalTriggerRef = useRef<HTMLButtonElement>(null);

  const [quandoOpen, setQuandoOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [horarioOpen, setHorarioOpen] = useState(false);
  const [canalOpen, setCanalOpen] = useState(false);
  const [isCustomWhen, setIsCustomWhen] = useState(!canUseRelative);
  const [customDate, setCustomDate] = useState<Date | null>(() => taskDueDate ?? null);
  const [customTime, setCustomTime] = useState<string | null>(null);

  const setCustomWhen = (active: boolean) => {
    setIsCustomWhen(active);
  };

  const showAbsoluteFields = !canUseRelative || isCustomWhen;

  const relativePresets = getWhenDropdownPresets(canUseRelative);

  const quandoLabel = isCustomWhen ? 'Customizado' : formatReminderLabel(draft);
  const dataLabel = customDate ? formatCustomDateLabel(customDate) : 'Definir';
  const horarioLabel = customTime ?? 'Definir';
  const canalLabel = channelConfirmed ? formatChannelLabel(draft.channel) : 'Definir';

  const applyAbsoluteSchedule = (date: Date, time: string) => {
    onChange({
      id: draft.id,
      channel: draft.channel,
      type: 'absolute',
      scheduledAt: `${dateToIsoDateString(date)}T${time}`,
    });
  };

  const applyRelative = (preset: RelativeReminderPreset) => {
    setCustomWhen(false);
    setCustomDate(null);
    setCustomTime(null);
    onChange({
      id: draft.id,
      channel: draft.channel,
      type: 'relative',
      offset: preset.offset,
    });
    setQuandoOpen(false);
  };

  const enterCustomWhen = () => {
    setCustomWhen(true);
    setQuandoOpen(false);
    if (draft.type !== 'unset') {
      onChange({
        id: draft.id,
        channel: draft.channel,
        type: 'unset',
      });
    }
  };

  const handleDateSelect = (date: Date) => {
    setCustomDate(date);
    setDataOpen(false);
    if (customTime) {
      applyAbsoluteSchedule(date, customTime);
    }
  };

  const handleTimeSelect = (time: string) => {
    setCustomTime(time);
    if (customDate) {
      applyAbsoluteSchedule(customDate, time);
    }
  };

  const applyChannel = (channel: ReminderChannel) => {
    onChange({ ...draft, channel });
    onChannelConfirm(true);
    setCanalOpen(false);
  };

  return (
    <div className={styles.draftRows}>
      <div className={[styles.rowCard, showAbsoluteFields && styles.rowCardStacked].filter(Boolean).join(' ')}>
        {canUseRelative && (
          <div className={styles.row}>
            <span className={styles.rowLabel} id={`quando-label-${draft.id}`}>
              Quando
            </span>
            <button
              ref={quandoTriggerRef}
              type="button"
              className={[styles.rowTrigger, quandoOpen && styles.rowTriggerOpen].filter(Boolean).join(' ')}
              onClick={() => setQuandoOpen((open) => !open)}
              aria-labelledby={`quando-label-${draft.id}`}
              aria-haspopup="listbox"
              aria-expanded={quandoOpen}
            >
              <span className={styles.rowTriggerValue}>{quandoLabel}</span>
              <span className={[styles.rowTriggerIcon, quandoOpen && styles.rowTriggerIconOpen].filter(Boolean).join(' ')}>
                <CaretDown size={16} weight="regular" />
              </span>
            </button>

            <Dropdown
              isOpen={quandoOpen}
              onClose={() => setQuandoOpen(false)}
              anchorRef={quandoTriggerRef}
              width={220}
              align="right"
              position="auto-top"
              forceTheme="dark"
              gap={4}
              disableOutsideIgnoreCheck
              zIndex={1050}
            >
              <div className={styles.quandoOptions}>
                {relativePresets.map((preset) => (
                  <ListItem
                    key={preset.id}
                    label={preset.label}
                    onClick={() => applyRelative(preset)}
                    buttonProps={{ role: 'option' }}
                  />
                ))}
                <ListItem
                  label="Customizado"
                  onClick={enterCustomWhen}
                  buttonProps={{ role: 'option' }}
                />
              </div>
            </Dropdown>
          </div>
        )}

        {showAbsoluteFields && (
          <>
            <div className={styles.row}>
              <span className={styles.rowLabel} id={`data-label-${draft.id}`}>
                Data
              </span>
              <button
                ref={dataTriggerRef}
                type="button"
                className={[styles.rowTrigger, dataOpen && styles.rowTriggerOpen].filter(Boolean).join(' ')}
                onClick={() => setDataOpen((open) => !open)}
                aria-labelledby={`data-label-${draft.id}`}
                aria-haspopup="dialog"
                aria-expanded={dataOpen}
              >
                <span className={styles.rowTriggerValue}>{dataLabel}</span>
                <span className={[styles.rowTriggerIcon, dataOpen && styles.rowTriggerIconOpen].filter(Boolean).join(' ')}>
                  <CaretDown size={16} weight="regular" />
                </span>
              </button>

              <ReminderCustomDatePicker
                isOpen={dataOpen}
                onClose={() => setDataOpen(false)}
                anchorRef={dataTriggerRef}
                selectedDate={customDate}
                onDateSelect={handleDateSelect}
              />
            </div>

            <div className={styles.row}>
              <span className={styles.rowLabel} id={`horario-label-${draft.id}`}>
                Horário
              </span>
              <button
                ref={horarioTriggerRef}
                type="button"
                className={[styles.rowTrigger, horarioOpen && styles.rowTriggerOpen].filter(Boolean).join(' ')}
                onClick={() => setHorarioOpen((open) => !open)}
                aria-labelledby={`horario-label-${draft.id}`}
                aria-haspopup="listbox"
                aria-expanded={horarioOpen}
              >
                <span className={styles.rowTriggerValue}>{horarioLabel}</span>
                <span className={[styles.rowTriggerIcon, horarioOpen && styles.rowTriggerIconOpen].filter(Boolean).join(' ')}>
                  <CaretDown size={16} weight="regular" />
                </span>
              </button>

              <ReminderCustomTimePicker
                isOpen={horarioOpen}
                onClose={() => setHorarioOpen(false)}
                anchorRef={horarioTriggerRef}
                selectedTime={customTime}
                onTimeSelect={handleTimeSelect}
              />
            </div>
          </>
        )}
      </div>

      <div className={styles.rowCard}>
        <div className={styles.row}>
          <span className={styles.rowLabel} id={`canal-label-${draft.id}`}>
            Canal
          </span>
          <button
            ref={canalTriggerRef}
            type="button"
            className={[styles.rowTrigger, canalOpen && styles.rowTriggerOpen].filter(Boolean).join(' ')}
            onClick={() => setCanalOpen((open) => !open)}
            aria-labelledby={`canal-label-${draft.id}`}
            aria-haspopup="listbox"
            aria-expanded={canalOpen}
          >
            <span className={styles.rowTriggerValue}>{canalLabel}</span>
            <span className={[styles.rowTriggerIcon, canalOpen && styles.rowTriggerIconOpen].filter(Boolean).join(' ')}>
              <CaretDown size={16} weight="regular" />
            </span>
          </button>

          <Dropdown
            isOpen={canalOpen}
            onClose={() => setCanalOpen(false)}
            anchorRef={canalTriggerRef}
            width={220}
            align="right"
            position="auto-top"
            forceTheme="dark"
            gap={4}
            disableOutsideIgnoreCheck
            zIndex={1050}
          >
            <div className={styles.quandoOptions}>
              {REMINDER_CHANNEL_OPTIONS.map((channel) => (
                <ListItem
                  key={channel}
                  label={formatChannelOptionLabel(channel)}
                  onClick={() => applyChannel(channel)}
                  buttonProps={{ role: 'option' }}
                />
              ))}
            </div>
          </Dropdown>
        </div>
      </div>
    </div>
  );
}
