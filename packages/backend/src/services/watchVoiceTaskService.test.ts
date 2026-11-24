/**
 * Unit tests for the Apple Watch voice task parsing (no network, no OpenAI).
 * Run with `npm test` in packages/backend (node:test through ts-node).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isClockTime,
  isDateKey,
  mentionsDateOrTime,
  parseVoiceTask,
  quickTitle,
} from './watchVoiceTaskService';

const context = { today: '2026-11-23', now: '20:52', locale: 'pt-BR' as const };

describe('mentionsDateOrTime', () => {
  // Any of these must reach the completion, or the day/time is lost.
  const withSchedule = [
    'ligar para o dentista amanhã às 15h',
    'reunião às três',
    'pagar boleto dia vinte',
    'academia sexta-feira',
    'buscar o Pedro depois do almoço',
    'tomar remédio de manhã',
    'Lembrar de ligar pro João às 9',
    'entregar relatório semana que vem',
    'consulta segunda',
    'call mom tomorrow',
    'gym at 7',
    'meeting next Monday',
    'Renew insurance on May first',
    'Call Mom at half past eight',
    'pay rent on the twenty-third',
    'standup at quarter past nine',
  ];
  for (const text of withSchedule) {
    it(`needs the split: "${text}"`, () => assert.ok(mentionsDateOrTime(text)));
  }

  // The common case: no day, no time. These skip the completion.
  const withoutSchedule = [
    'comprar pão e leite',
    'Lembrar de comprar pão.',
    'ligar para o dentista',
    'regar as plantas',
    'pagar o condomínio',
    'agora preciso lavar o carro',
    'buy milk',
    'remind me to call mom',
  ];
  for (const text of withoutSchedule) {
    it(`skips the split: "${text}"`, () => assert.ok(!mentionsDateOrTime(text)));
  }
});

describe('quickTitle', () => {
  it('drops command words and the final period', () => {
    assert.equal(quickTitle('Lembrar de comprar pão.'), 'comprar pão');
    assert.equal(quickTitle('me lembre de regar as plantas'), 'regar as plantas');
    assert.equal(quickTitle('criar uma tarefa: pagar o condomínio'), 'pagar o condomínio');
    assert.equal(quickTitle('remind me to call mom'), 'call mom');
    assert.equal(quickTitle('comprar pão ou leite.'), 'comprar pão ou leite');
  });

  it('keeps the text when it is only a command word or starts like one', () => {
    assert.equal(quickTitle('tarefa.'), 'tarefa');
    assert.equal(quickTitle('lembrete do médico'), 'lembrete do médico');
  });
});

describe('parseVoiceTask', () => {
  it('keeps a valid day and time from the model', () => {
    assert.deepEqual(
      parseVoiceTask({ title: 'Ligar para o dentista', due_date: '2026-11-24', time: '15:00' }, 'x', context),
      { title: 'Ligar para o dentista', dueDate: '2026-11-24', time: '15:00' },
    );
  });

  it('sends a missing, past or invalid day to today and drops a bad time', () => {
    assert.equal(parseVoiceTask({ title: 'X', due_date: null }, 'x', context).dueDate, '2026-11-23');
    assert.equal(parseVoiceTask({ title: 'X', due_date: '2026-11-01' }, 'x', context).dueDate, '2026-11-23');
    assert.equal(parseVoiceTask({ title: 'X', due_date: '2026-02-30' }, 'x', context).dueDate, '2026-11-23');
    assert.equal(parseVoiceTask({ title: 'X', time: '25:00' }, 'x', context).time, null);
  });

  it('falls back to the whole transcript when the model gives nothing', () => {
    assert.deepEqual(parseVoiceTask(null, 'pagar o boleto do condomínio.', context), {
      title: 'Pagar o boleto do condomínio',
      dueDate: '2026-11-23',
      time: null,
    });
    assert.equal(parseVoiceTask({ title: '  ' }, 'regar as plantas', context).title, 'Regar as plantas');
  });
});

describe('date and time checks', () => {
  it('accepts only real dates and 24 h clock times', () => {
    assert.ok(isDateKey('2028-02-29'));
    assert.ok(!isDateKey('2027-02-29'));
    assert.ok(!isDateKey('2026-1-01'));
    assert.ok(isClockTime('09:05'));
    assert.ok(!isClockTime('9:05'));
    assert.ok(!isClockTime('24:00'));
  });
});
