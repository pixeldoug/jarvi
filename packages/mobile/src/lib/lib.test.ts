import { i18n } from '@/i18n';

import {
  MONTHS_SHORT_PT,
  dateKeyOf,
  formatDueLabel,
  formatLongDate,
  monthGrid,
  nextMonday,
  normalizeTime,
  startOfWeek,
  toDateKey,
  toTimeString,
} from './dates';
import { parseDescription, serializeDescription } from './description';
import { formatE164, formatNationalNumber, toE164, validateNationalNumber } from './phone';
import { REPEAT_OPTION_LABELS_PT, buildDefaultRecurrenceConfig, formatRecurrence } from './recurrence';
import {
  CHANNEL_LABELS,
  RELATIVE_REMINDER_PRESETS,
  formatReminder,
  formatReminderWithChannel,
  reminderFromApi,
  reminderToApi,
} from './reminders';

const NOW = new Date(2026, 9, 28, 15, 30); // Wednesday

describe('dates', () => {
  it('builds local date keys without shifting through UTC', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dateKeyOf('2026-10-28T23:00:00.000Z')).toBe('2026-10-28');
    expect(dateKeyOf('')).toBeNull();
    expect(dateKeyOf('not a date')).toBeNull();
  });

  it('finds week boundaries (Monday first)', () => {
    expect(toDateKey(startOfWeek(NOW))).toBe('2026-10-26');
    expect(toDateKey(nextMonday(NOW))).toBe('2026-11-02');
    expect(toDateKey(nextMonday(new Date(2026, 10, 1)))).toBe('2026-11-02');
    expect(toDateKey(nextMonday(new Date(2026, 10, 2)))).toBe('2026-11-09');
  });

  it('normalizes times', () => {
    expect(normalizeTime('9:05')).toBe('09:05');
    expect(normalizeTime('14:30:00')).toBe('14:30');
    expect(normalizeTime('null')).toBeNull();
    expect(normalizeTime('')).toBeNull();
  });

  it.each([
    ['2026-10-28', null, 'Hoje'],
    ['2026-10-28', '09:00', 'Hoje, 09:00'],
    ['2026-10-29', null, 'Amanhã'],
    ['2026-10-27', null, 'Ontem'],
    ['2026-10-31', null, 'Sábado'],
    ['2026-11-04', null, '4 Nov'],
    ['2027-01-07', '08:00', '7 Jan 2027, 08:00'],
  ])('labels %s %s as %s', (date, time, expected) => {
    expect(formatDueLabel(date, time, NOW)).toBe(expected);
  });

  it('builds whole weeks for a month grid', () => {
    const days = monthGrid(new Date(2026, 9, 1));
    expect(days.length % 7).toBe(0);
    expect(toDateKey(days[0]!)).toBe('2026-09-28');
    expect(toDateKey(days[days.length - 1]!)).toBe('2026-11-01');
  });

  it('keeps the Portuguese long date and legacy name lists', () => {
    expect(formatLongDate(NOW)).toBe('Quarta, 28 de outubro');
    expect(MONTHS_SHORT_PT[9]).toBe('Out');
    expect(MONTHS_SHORT_PT.length).toBe(12);
  });
});

describe('recurrence', () => {
  it('formats each type like the web chip', () => {
    expect(formatRecurrence('none', null)).toBeNull();
    expect(formatRecurrence('daily', null)).toBe('Diariamente');
    expect(formatRecurrence('hourly', { everyHours: 2, until: { type: 'never' } })).toBe('A cada 2h');
    expect(formatRecurrence('weekly', '{"daysOfWeek":[5,1,3],"until":{"type":"never"}}')).toBe('Seg, Qua, Sex');
    expect(formatRecurrence('monthly', { monthDay: 5, until: { type: 'never' } })).toBe('Todo dia 5');
    expect(
      formatRecurrence('custom', { custom: { frequency: 'weekly', interval: 2 }, until: { type: 'never' } }),
    ).toBe('A cada 2 semanas');
    expect(formatRecurrence('weekly', 'not json')).toBe('Semanalmente');
    expect(formatRecurrence('custom', { custom: { frequency: 'monthly', interval: 3 }, until: { type: 'never' } })).toBe(
      'A cada 3 meses',
    );
    expect(REPEAT_OPTION_LABELS_PT.none).toBe('Não repetir');
  });

  it('seeds defaults from the base date', () => {
    const friday = new Date(2026, 9, 30);
    expect(buildDefaultRecurrenceConfig('weekly', friday)).toEqual({ daysOfWeek: [5], until: { type: 'never' } });
    expect(buildDefaultRecurrenceConfig('monthly', friday)).toEqual({ monthDay: 30, until: { type: 'never' } });
    expect(buildDefaultRecurrenceConfig('none', friday)).toBeNull();
  });
});

describe('reminders', () => {
  it('labels presets and schedules', () => {
    expect(
      formatReminder({ id: 'r', channel: 'whatsapp', type: 'relative', offset: { amount: 15, unit: 'minutes', direction: 'before' } }),
    ).toBe('15 min antes');
    expect(
      formatReminder({ id: 'r', channel: 'call', type: 'relative', offset: { amount: 3, unit: 'hours', direction: 'after' } }),
    ).toBe('3 horas depois');
    expect(formatReminder({ id: 'r', channel: 'call', type: 'absolute', scheduledAt: '2026-11-05T14:30' })).toBe(
      '5 Nov às 14:30',
    );
    expect(formatReminder({ id: 'r', channel: 'whatsapp', type: 'recurring', frequency: 'weekly', weekday: 1, time: '08:00' })).toBe(
      'Toda segunda-feira às 08:00',
    );
    expect(formatReminder({ id: 'r', channel: 'whatsapp', type: 'recurring', frequency: 'daily', time: '18:30' })).toBe(
      'Todos os dias às 18:30',
    );
    expect(formatReminder({ id: 'r', channel: 'call', type: 'relative', offset: { amount: 1, unit: 'days', direction: 'before' } })).toBe(
      '1 dia antes',
    );
    expect(formatReminder({ id: 'r', channel: 'call', type: 'absolute', scheduledAt: '2026-11-05' })).toBe('5 Nov 2026');
    expect(formatReminder({ id: 'r', channel: 'call', type: 'unset' })).toBe('Definir');
    expect(
      formatReminderWithChannel({ id: 'r', channel: 'call', type: 'relative', offset: { amount: 0, unit: 'minutes', direction: 'before' } }),
    ).toBe('Ligação · No horário');
    expect(CHANNEL_LABELS.whatsapp).toBe('WhatsApp');
  });

  it('round-trips the API shape', () => {
    const fromApi = reminderFromApi({
      id: 'r1',
      taskId: 't1',
      userId: 'u1',
      channel: 'whatsapp',
      schedule: { type: 'relative', offset: { amount: 1, unit: 'days', direction: 'before' } },
      status: 'scheduled',
      triggerAt: null,
      timezone: 'America/Sao_Paulo',
      sentAt: null,
      createdAt: '',
      updatedAt: '',
    });
    expect(reminderToApi(fromApi)).toEqual({
      id: 'r1',
      channel: 'whatsapp',
      type: 'relative',
      offset: { amount: 1, unit: 'days', direction: 'before' },
    });
  });
});

describe('en-US', () => {
  beforeEach(() => {
    void i18n.changeLanguage('en-US');
  });
  afterEach(() => {
    void i18n.changeLanguage('pt-BR');
  });

  it.each([
    ['2026-10-28', null, 'Today'],
    ['2026-10-28', '09:00', 'Today, 9:00 AM'],
    ['2026-10-29', '14:30', 'Tomorrow, 2:30 PM'],
    ['2026-10-27', null, 'Yesterday'],
    ['2026-10-31', null, 'Saturday'],
    ['2026-11-04', null, 'Nov 4'],
    ['2027-01-07', '08:00', 'Jan 7, 2027, 8:00 AM'],
  ])('labels %s %s as %s', (date, time, expected) => {
    expect(formatDueLabel(date, time, NOW)).toBe(expected);
  });

  it('starts weeks on Sunday and keeps stored times in 24h', () => {
    expect(toDateKey(startOfWeek(NOW))).toBe('2026-10-25');
    const days = monthGrid(new Date(2026, 9, 1));
    expect(days.length % 7).toBe(0);
    expect(toDateKey(days[0]!)).toBe('2026-09-27');
    expect(toDateKey(days[days.length - 1]!)).toBe('2026-10-31');
    expect(toTimeString(new Date(2026, 9, 28, 14, 5))).toBe('14:05');
    expect(formatLongDate(NOW)).toBe('Wednesday, October 28');
    expect(MONTHS_SHORT_PT[9]).toBe('Oct');
  });

  it('formats recurrence', () => {
    expect(formatRecurrence('daily', null)).toBe('Daily');
    expect(formatRecurrence('hourly', { everyHours: 2, until: { type: 'never' } })).toBe('Every 2 hours');
    expect(formatRecurrence('weekly', '{"daysOfWeek":[5,1,3],"until":{"type":"never"}}')).toBe('Mon, Wed, Fri');
    expect(formatRecurrence('monthly', { monthDay: 5, until: { type: 'never' } })).toBe('Monthly on day 5');
    expect(
      formatRecurrence('custom', { custom: { frequency: 'weekly', interval: 2 }, until: { type: 'never' } }),
    ).toBe('Every 2 weeks');
    expect(REPEAT_OPTION_LABELS_PT.none).toBe("Don't repeat");
  });

  it('formats reminders', () => {
    expect(RELATIVE_REMINDER_PRESETS.map((p) => p.label)).toEqual([
      'At the time',
      '5 min before',
      '15 min before',
      '30 min before',
      '1 hour before',
      '2 hours before',
      '1 day before',
    ]);
    expect(CHANNEL_LABELS.call).toBe('Phone call');
    expect(
      formatReminder({ id: 'r', channel: 'call', type: 'relative', offset: { amount: 3, unit: 'hours', direction: 'after' } }),
    ).toBe('3 hours after');
    expect(formatReminder({ id: 'r', channel: 'call', type: 'absolute', scheduledAt: '2026-11-05T14:30' })).toBe(
      'Nov 5 at 2:30 PM',
    );
    expect(formatReminder({ id: 'r', channel: 'whatsapp', type: 'recurring', frequency: 'weekly', weekday: 1, time: '08:00' })).toBe(
      'Every Monday at 8:00 AM',
    );
    expect(formatReminder({ id: 'r', channel: 'whatsapp', type: 'recurring', frequency: 'daily', time: '18:30' })).toBe(
      'Every day at 6:30 PM',
    );
    expect(
      formatReminderWithChannel({ id: 'r', channel: 'whatsapp', type: 'relative', offset: { amount: 15, unit: 'minutes', direction: 'before' } }),
    ).toBe('WhatsApp · 15 min before');
  });
});

describe('description', () => {
  it('passes plain text through', () => {
    expect(parseDescription('Comprar pão')).toEqual({ text: 'Comprar pão', editable: true, attachmentCount: 0 });
    expect(parseDescription(null).text).toBe('');
  });

  it('reads web editor docs and only allows editing plain paragraphs', () => {
    const plain = serializeDescription('Linha 1\n\nLinha 3');
    expect(parseDescription(plain)).toEqual({ text: 'Linha 1\n\nLinha 3', editable: true, attachmentCount: 0 });

    const rich = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Importante', marks: [{ type: 'bold' }] }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'um' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'dois' }] }] },
          ],
        },
      ],
      _attachments: [{ name: 'foto' }],
    });
    expect(parseDescription(rich)).toEqual({ text: 'Importante\n• um\n• dois', editable: false, attachmentCount: 1 });
  });

  it('serializes empty text as an empty string', () => {
    expect(serializeDescription('   ')).toBe('');
  });
});

describe('phone', () => {
  it('masks Brazilian and US numbers', () => {
    expect(formatNationalNumber('11990009900', 'BR')).toBe('(11) 99000-9900');
    expect(formatNationalNumber('119', 'BR')).toBe('(11) 9');
    expect(formatNationalNumber('5551234567', 'US')).toBe('(555) 123-4567');
  });

  it('formats stored E.164 numbers for display', () => {
    expect(formatE164('+5511990009900')).toBe('+55 (11) 99000-9900');
    expect(formatE164('+15551234567')).toBe('+1 (555) 123-4567');
    expect(formatE164('+999')).toBe('+999');
  });

  it('builds E.164 and validates length', () => {
    expect(toE164('55', '(11) 99000-9900')).toBe('+5511990009900');
    expect(validateNationalNumber('(11) 9900', 'BR')).toBe('Digite um número válido com DDD.');
    expect(validateNationalNumber('(11) 99000-9900', 'BR')).toBeNull();
    expect(validateNationalNumber('1234567', 'PT')).toBe('Digite um número válido.');
  });
});
