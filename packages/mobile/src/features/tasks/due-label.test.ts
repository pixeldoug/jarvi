import { i18n } from '@/i18n';
import { categoryLabel } from './category-label';
import { formatDueLabel } from './due-label';

// Wednesday 2026-10-28, local time.
const NOW = new Date(2026, 9, 28, 15, 30);

describe('formatDueLabel', () => {
  it.each([
    ['2026-10-28', null, 'Hoje'],
    ['2026-10-29', '09:00', 'Amanhã, 09:00'],
    ['2026-10-27', null, 'Ontem'],
    ['2026-10-30', '14:05', 'Sexta, 14:05'],
    ['2026-11-20', null, '20 Nov'],
    ['2025-01-07', null, '7 Jan 2025'],
  ])('pt-BR: %s %s → %s', (dueDate, time, expected) => {
    expect(formatDueLabel(dueDate, time, { now: NOW })).toBe(expected);
  });

  it.each([
    ['2026-10-28', null, 'Today'],
    ['2026-10-29', '09:00', 'Tomorrow, 9:00 AM'],
    ['2026-10-30', '14:05', 'Friday, 2:05 PM'],
    ['2026-11-20', null, 'Nov 20'],
    ['2025-01-07', null, 'Jan 7, 2025'],
  ])('en-US: %s %s → %s', (dueDate, time, expected) => {
    expect(formatDueLabel(dueDate, time, { now: NOW, locale: 'en-US' })).toBe(expected);
  });

  it('is null without a date', () => {
    expect(formatDueLabel(null, '09:00', { now: NOW })).toBeNull();
  });
});

describe('categoryLabel', () => {
  afterEach(() => void i18n.changeLanguage('pt-BR'));

  it('translates only untouched default names', () => {
    expect(categoryLabel('Trabalho')).toBe('Trabalho');
    void i18n.changeLanguage('en-US');
    expect(categoryLabel('Trabalho')).toBe('Work');
    expect(categoryLabel('Pessoal')).toBe('Personal');
    expect(categoryLabel('trabalho')).toBe('trabalho');
    expect(categoryLabel('Casa')).toBe('Casa');
    expect(categoryLabel(null)).toBeNull();
  });
});
