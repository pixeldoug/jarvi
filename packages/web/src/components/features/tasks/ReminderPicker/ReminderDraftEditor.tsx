/**
 * Draft reminder editor — Figma empty/filled "Quando" card (node 40001735:27202)
 */

import { useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import type { TaskReminderDraft } from '@jarvi/shared';
import { Dropdown, ListItem, TextInput } from '../../../ui';
import {
  formatReminderLabel,
  getWhenDropdownPresets,
  type RelativeReminderPreset,
} from '../../../../lib/reminders';
import styles from './ReminderPicker.module.css';

export type CustomPanelMode = 'absolute' | 'recurring' | null;

function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultTime(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30 - (d.getMinutes() % 15));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface ReminderDraftEditorProps {
  draft: TaskReminderDraft;
  canUseRelative: boolean;
  onChange: (draft: TaskReminderDraft) => void;
}

export function ReminderDraftEditor({ draft, canUseRelative, onChange }: ReminderDraftEditorProps) {
  const quandoTriggerRef = useRef<HTMLButtonElement>(null);
  const [quandoOpen, setQuandoOpen] = useState(false);
  const [customPanel, setCustomPanel] = useState<CustomPanelMode>(null);
  const [absoluteDate, setAbsoluteDate] = useState(todayIsoDate());
  const [absoluteTime, setAbsoluteTime] = useState(defaultTime());
  const [recurringTime, setRecurringTime] = useState('14:30');
  const [recurringFrequency, setRecurringFrequency] = useState<'daily' | 'weekly'>('daily');
  const [recurringWeekday, setRecurringWeekday] = useState(() => new Date().getDay());

  const quandoLabel = formatReminderLabel(draft);
  const relativePresets = getWhenDropdownPresets(canUseRelative);

  const applyRelative = (preset: RelativeReminderPreset) => {
    setCustomPanel(null);
    onChange({
      id: draft.id,
      channel: 'whatsapp',
      type: 'relative',
      offset: preset.offset,
    });
    setQuandoOpen(false);
  };

  const applyAbsolute = () => {
    if (!absoluteDate) return;
    onChange({
      id: draft.id,
      channel: 'whatsapp',
      type: 'absolute',
      scheduledAt: absoluteTime ? `${absoluteDate}T${absoluteTime}` : absoluteDate,
    });
    setCustomPanel(null);
    setQuandoOpen(false);
  };

  const applyRecurring = () => {
    if (!recurringTime) return;
    onChange({
      id: draft.id,
      channel: 'whatsapp',
      type: 'recurring',
      time: recurringTime,
      frequency: recurringFrequency,
      ...(recurringFrequency === 'weekly' ? { weekday: recurringWeekday } : {}),
    });
    setCustomPanel(null);
    setQuandoOpen(false);
  };

  return (
    <div className={styles.draftCard}>
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
              onClick={() => {
                setCustomPanel('absolute');
                setQuandoOpen(false);
              }}
              buttonProps={{ role: 'option' }}
            />
          </div>
        </Dropdown>
      </div>

      {customPanel && (
        <div className={styles.customPanel}>
          <div className={styles.customTabs}>
            <button
              type="button"
              className={[styles.customTab, customPanel === 'absolute' && styles.customTabActive].filter(Boolean).join(' ')}
              onClick={() => setCustomPanel('absolute')}
            >
              Data e hora
            </button>
            <button
              type="button"
              className={[styles.customTab, customPanel === 'recurring' && styles.customTabActive].filter(Boolean).join(' ')}
              onClick={() => setCustomPanel('recurring')}
            >
              Repetir
            </button>
          </div>

          {customPanel === 'absolute' ? (
            <div className={styles.customFields}>
              <div className={styles.absoluteFields}>
                <TextInput label="Data" type="date" value={absoluteDate} onChange={(e) => setAbsoluteDate(e.target.value)} />
                <TextInput label="Horário" type="time" value={absoluteTime} onChange={(e) => setAbsoluteTime(e.target.value)} />
              </div>
              <button type="button" className={styles.applyButton} onClick={applyAbsolute}>
                Aplicar
              </button>
            </div>
          ) : (
            <div className={styles.customFields}>
              <label className={styles.fieldLabel}>
                Frequência
                <select
                  className={styles.select}
                  value={recurringFrequency}
                  onChange={(e) => setRecurringFrequency(e.target.value as 'daily' | 'weekly')}
                >
                  <option value="daily">Todos os dias</option>
                  <option value="weekly">Toda semana</option>
                </select>
              </label>
              {recurringFrequency === 'weekly' && (
                <label className={styles.fieldLabel}>
                  Dia da semana
                  <select
                    className={styles.select}
                    value={recurringWeekday}
                    onChange={(e) => setRecurringWeekday(Number(e.target.value))}
                  >
                    <option value={1}>Segunda-feira</option>
                    <option value={2}>Terça-feira</option>
                    <option value={3}>Quarta-feira</option>
                    <option value={4}>Quinta-feira</option>
                    <option value={5}>Sexta-feira</option>
                    <option value={6}>Sábado</option>
                    <option value={0}>Domingo</option>
                  </select>
                </label>
              )}
              <TextInput label="Horário" type="time" value={recurringTime} onChange={(e) => setRecurringTime(e.target.value)} />
              <button type="button" className={styles.applyButton} onClick={applyRecurring}>
                Aplicar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
