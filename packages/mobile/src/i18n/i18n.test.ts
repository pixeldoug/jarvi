import { api, isSessionRejection, isSubscriptionRequired, localeHeaders, setSessionToken } from '@/api/client';
import { appEvents } from '@/lib/events';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatList,
  formatNumber,
  formatRelativeDay,
  formatRelativeTime,
  formatTime,
  getCurrentLocale,
  getWeekStartsOn,
  i18n,
  matchLocale,
  monthNames,
  resolveLocale,
  weekdayNames,
} from './index';

const en = { locale: 'en-US' } as const;
// Wednesday 28 Oct 2026, 10:00 local.
const NOW = new Date(2026, 9, 28, 10, 0);

describe('locale contract', () => {
  it('matches language tags to supported locales', () => {
    expect(matchLocale('en')).toBe('en-US');
    expect(matchLocale('en_GB')).toBe('en-US');
    expect(matchLocale('pt-PT')).toBe('pt-BR');
    expect(matchLocale('fr-FR')).toBeNull();
    expect(resolveLocale([null, 'fr', 'en-AU'])).toBe('en-US');
    expect(resolveLocale(['de'])).toBe('pt-BR');
  });

  it('starts tests in pt-BR', () => {
    expect(getCurrentLocale()).toBe('pt-BR');
    expect(i18n.t('actions.cancel')).toBe('Cancelar');
  });
});

describe('plurals', () => {
  afterEach(() => void i18n.changeLanguage('pt-BR'));

  it('treats only 1 as singular in pt-BR (0 is plural)', () => {
    expect(i18n.t('time.minutesAgo', { count: 1 })).toBe('há 1 minuto');
    expect(i18n.t('time.minutesAgo', { count: 0 })).toBe('há 0 minutos');
    expect(i18n.t('time.minutesAgo', { count: 5 })).toBe('há 5 minutos');
  });

  it('uses English plurals after a language switch', () => {
    void i18n.changeLanguage('en-US');
    expect(i18n.t('time.hoursAgo', { count: 1 })).toBe('1 hour ago');
    expect(i18n.t('time.hoursAgo', { count: 2 })).toBe('2 hours ago');
  });
});

describe('format (pt-BR keeps the app’s current output)', () => {
  const date = new Date(2026, 9, 28);

  it('formats date presets', () => {
    expect(formatDate(date)).toBe('28 Out');
    expect(formatDate('2025-01-07', 'dayMonthAuto', { now: NOW })).toBe('7 Jan 2025');
    expect(formatDate(date, 'dayMonthYear')).toBe('28 Out 2026');
    expect(formatDate(date, 'dayMonthLong')).toBe('28 de Outubro');
    expect(formatDate(date, 'weekdayDayMonthLong')).toBe('Quarta, 28 de outubro');
    expect(formatDate(date, 'monthYear')).toBe('Outubro 2026');
    expect(formatDate(date, 'weekdayFull')).toBe('quarta-feira');
    expect(formatDate(date, 'weekdayShort')).toBe('Qua');
    expect(formatDate(new Date(2026, 2, 5), 'numeric')).toBe('05/03/2026');
    expect(formatDate('not a date')).toBe('');
  });

  it('formats times', () => {
    expect(formatTime('9:00')).toBe('09:00');
    expect(formatTime('14:05:00')).toBe('14:05');
    expect(formatTime('14:00', 'hoursCompact')).toBe('14h');
    expect(formatTime('14:05', 'hours')).toBe('14h05');
    expect(formatDateTime(new Date(2026, 9, 28, 9, 0), 'dayMonth', { joiner: 'at' })).toBe('28 Out às 09:00');
  });

  it('formats relative days and times', () => {
    expect(formatRelativeDay('2026-10-28', { now: NOW })).toBe('Hoje');
    expect(formatRelativeDay('2026-10-29', { now: NOW })).toBe('Amanhã');
    expect(formatRelativeDay('2026-10-27', { now: NOW })).toBe('Ontem');
    expect(formatRelativeDay('2026-10-30', { now: NOW, weekdayThisWeek: true })).toBe('Sexta');
    expect(formatRelativeDay('2026-11-10', { now: NOW, weekdayThisWeek: true })).toBe('10 Nov');
    expect(formatRelativeTime(new Date(NOW.getTime() - 10_000), { now: NOW })).toBe('agora mesmo');
    expect(formatRelativeTime(new Date(NOW.getTime() - 5 * 60_000), { now: NOW })).toBe('há 5 minutos');
    expect(formatRelativeTime(new Date(NOW.getTime() - 2 * 3_600_000), { now: NOW })).toBe('há 2 horas');
    expect(formatRelativeTime(new Date(2026, 9, 27, 9), { now: NOW })).toBe('ontem');
    expect(formatRelativeTime(new Date(2026, 9, 25, 9), { now: NOW })).toBe('há 3 dias');
    expect(formatRelativeTime(new Date(2026, 9, 7, 9), { now: NOW })).toBe('em 7 Out');
  });

  it('formats lists, numbers and calendars', () => {
    expect(formatList(['A', 'B', 'C'])).toBe('A, B e C');
    expect(formatList(['A', 'B'], 'or')).toBe('A ou B');
    expect(formatNumber(1234.5)).toBe('1.234,5');
    expect(formatCurrency(2990, 'BRL').replace(/\s/g, ' ')).toBe('R$ 29,90');
    expect(getWeekStartsOn()).toBe(1);
    expect(weekdayNames('short')).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
    expect(monthNames('short')[1]).toBe('Fev');
  });
});

describe('format (en-US)', () => {
  const date = new Date(2026, 9, 28);

  it('uses US order, 12h clocks and Sunday weeks', () => {
    expect(formatDate(date, 'dayMonth', en)).toBe('Oct 28');
    expect(formatDate('2025-01-07', 'dayMonthAuto', { ...en, now: NOW })).toBe('Jan 7, 2025');
    expect(formatDate(date, 'weekdayDayMonthLong', en)).toBe('Wednesday, October 28');
    expect(formatDate(new Date(2026, 2, 5), 'numeric', en)).toBe('3/5/2026');
    expect(formatTime('09:00', 'clock', en)).toBe('9:00 AM');
    expect(formatTime('00:30', 'clock', en)).toBe('12:30 AM');
    expect(formatTime('12:00', 'hoursCompact', en)).toBe('12 PM');
    expect(formatRelativeDay('2026-10-29', { ...en, now: NOW })).toBe('Tomorrow');
    expect(formatRelativeTime(new Date(2026, 9, 7, 9), { ...en, now: NOW })).toBe('on Oct 7');
    expect(formatList(['A', 'B', 'C'], 'and', en)).toBe('A, B, and C');
    expect(formatNumber(1234.5, undefined, en)).toBe('1,234.5');
    expect(getWeekStartsOn(en)).toBe(0);
    expect(weekdayNames('short', undefined, en)[0]).toBe('Sun');
  });
});

describe('api client and locale', () => {
  afterEach(() => {
    void i18n.changeLanguage('pt-BR');
    setSessionToken(null);
  });

  it('sends X-Jarvi-Locale with the current language', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
    globalThis.fetch = fetchMock;
    await api.get('/api/tasks');
    expect(fetchMock.mock.calls[0][1].headers['X-Jarvi-Locale']).toBe('pt-BR');
    void i18n.changeLanguage('en-US');
    expect(localeHeaders()).toEqual({ 'X-Jarvi-Locale': 'en-US' });
  });

  it('recognises old (text) and new (code) backend errors', () => {
    expect(isSessionRejection(403, { error: 'Invalid token' })).toBe(true);
    expect(isSessionRejection(403, { error: 'Token inválido', code: 'INVALID_TOKEN' })).toBe(true);
    expect(isSessionRejection(403, { error: 'Forbidden' })).toBe(false);
    expect(isSubscriptionRequired(403, { error: 'subscription_required' })).toBe(true);
    expect(isSubscriptionRequired(403, { error: 'Subscription required', code: 'SUBSCRIPTION_REQUIRED' })).toBe(true);
  });

  it('opens the paywall on the new backend code', async () => {
    const onPaywall = jest.fn();
    const off = appEvents.on('subscription_required', onPaywall);
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: 'Your trial ended', code: 'SUBSCRIPTION_REQUIRED' }),
    });
    await expect(api.get('/api/tasks')).rejects.toMatchObject({ status: 403, code: 'SUBSCRIPTION_REQUIRED' });
    expect(onPaywall).toHaveBeenCalledTimes(1);
    off();
  });

  it('words network errors in the current language', async () => {
    void i18n.changeLanguage('en-US');
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(api.get('/api/tasks')).rejects.toMatchObject({ status: 0, message: expect.stringContaining('internet') });
  });
});
