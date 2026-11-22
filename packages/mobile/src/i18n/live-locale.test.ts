/**
 * The React Compiler (`experiments.reactCompiler`) memoizes what a component
 * computes from its inputs. A text helper that reads the global language is
 * not re-run after a language switch unless the component passes the locale,
 * so the old language stays on screen until the app restarts.
 * `npm run check:locales` checks that components pass it.
 */
import { displayName } from '@/features/onboarding/display-name';
import { categoryLabel } from '@/features/tasks/category-label';
import { formatRecurrence, getRepeatOptionLabel } from '@/lib/recurrence';
import { RELATIVE_REMINDER_PRESETS, formatReminderWithChannel, getChannelLabel, getPresetLabel } from '@/lib/reminders';
import { getCurrentLocale } from './index';

const en = { locale: 'en-US' } as const;

describe('text helpers follow the locale they are given', () => {
  it('ignores the current language when a locale is passed', () => {
    expect(getCurrentLocale()).toBe('pt-BR');
    expect(categoryLabel('Trabalho', en)).toBe('Work');
    expect(categoryLabel('Trabalho')).toBe('Trabalho');
    expect(displayName({ name: 'Você' }, en)).toBe('You');
    expect(getRepeatOptionLabel('daily', en)).toBe('Daily');
    expect(formatRecurrence('weekly', { daysOfWeek: [1, 3], until: { type: 'never' } }, en)).toBe('Mon, Wed');
    expect(getChannelLabel('call', en)).toBe('Phone call');
    expect(getPresetLabel(RELATIVE_REMINDER_PRESETS[0]!, en)).toBe('At the time');
    expect(
      formatReminderWithChannel(
        { id: 'r', channel: 'whatsapp', type: 'relative', offset: { amount: 15, unit: 'minutes', direction: 'before' } },
        en,
      ),
    ).toBe('WhatsApp · 15 min before');
  });
});
