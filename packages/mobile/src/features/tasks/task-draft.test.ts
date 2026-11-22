import type { ConfiguredReminder } from '@/lib/reminders';
import type { Task } from '@/types/models';
import {
  createInput,
  draftFromTask,
  applyDraftPatch,
  emptyDraft,
  remindersChanged,
  updateInput,
  withRecurrence,
} from './task-draft';

const task: Task = {
  id: 't1',
  user_id: 'u1',
  title: 'Pagar internet',
  description: 'Boleto no e-mail',
  completed: false,
  priority: 'high',
  category: 'Casa',
  due_date: '2026-10-30T00:00:00.000Z',
  time: '09:00',
  recurrence_type: 'monthly',
  recurrence_config: '{"monthDay":30,"until":{"type":"never"}}',
  created_at: '',
  updated_at: '',
};

const relative: ConfiguredReminder = {
  id: 'r1',
  channel: 'whatsapp',
  type: 'relative',
  offset: { amount: 15, unit: 'minutes', direction: 'before' },
};

describe('draftFromTask', () => {
  it('normalizes the stored task', () => {
    expect(draftFromTask(task)).toMatchObject({
      title: 'Pagar internet',
      description: 'Boleto no e-mail',
      dueDate: '2026-10-30',
      time: '09:00',
      category: 'Casa',
      priority: 'high',
      recurrenceType: 'monthly',
      recurrenceConfig: { monthDay: 30, until: { type: 'never' } },
    });
  });
});

describe('updateInput', () => {
  it('sends nothing when nothing changed', () => {
    const draft = draftFromTask(task);
    expect(updateInput(draft, { ...draft })).toEqual({});
  });

  it('clears date and time with empty strings and category/priority with null', () => {
    const original = draftFromTask(task);
    const input = updateInput(original, { ...original, dueDate: null, category: null, priority: null });
    expect(input).toEqual({ dueDate: '', time: '', category: null, priority: null });
  });

  it('sends the whole recurrence when it changes', () => {
    const original = draftFromTask(task);
    expect(updateInput(original, { ...original, recurrenceType: 'none', recurrenceConfig: null })).toEqual({
      recurrence_type: 'none',
      recurrence_config: null,
      recurrence_until: null,
    });
  });

  it('keeps a description it cannot edit', () => {
    const original = { ...draftFromTask(task), descriptionEditable: false };
    expect(updateInput(original, { ...original, description: 'texto' })).toEqual({});
  });
});

describe('createInput', () => {
  it('omits empty fields and wraps the description for the web editor', () => {
    expect(createInput(emptyDraft({ title: '  Ligar pro banco ', description: 'Agência 123' }))).toEqual({
      title: 'Ligar pro banco',
      description: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Agência 123' }] }] }),
    });
  });

  it('drops a time without a date', () => {
    expect(createInput(emptyDraft({ title: 'x', time: '10:00' }))).toEqual({ title: 'x' });
  });
});

describe('withRecurrence', () => {
  it('anchors a new recurrence on today when the task has no date', () => {
    const friday = new Date(2026, 9, 30, 8);
    expect(withRecurrence(emptyDraft({ title: 'x' }), 'weekly', friday)).toMatchObject({
      dueDate: '2026-10-30',
      recurrenceType: 'weekly',
      recurrenceConfig: { daysOfWeek: [5], until: { type: 'never' } },
    });
  });

  it('clears the config for "none"', () => {
    expect(withRecurrence(draftFromTask(task), 'none')).toMatchObject({ recurrenceType: 'none', recurrenceConfig: null });
  });
});

describe('reminders', () => {
  it('keeps relative reminders on unrelated edits, even without a time', () => {
    const untimed = { ...draftFromTask({ ...task, time: null }, [relative]) };
    expect(applyDraftPatch(untimed, { title: 'IPVA' }).reminders).toEqual([relative]);
  });

  it('drops relative reminders when the time or the date they count from is removed', () => {
    const draft = draftFromTask(task, [relative]);
    expect(applyDraftPatch(draft, { time: null }).reminders).toEqual([]);
    expect(applyDraftPatch(draft, { dueDate: null, time: null }).reminders).toEqual([]);
    expect(applyDraftPatch(draft, { time: '10:00' }).reminders).toEqual([relative]);
  });

  it('ignores a time stored without a date', () => {
    const original = draftFromTask({ ...task, due_date: null, time: '08:00' });
    expect(original.time).toBeNull();
    expect(updateInput(original, { ...original, title: 'Outra' })).toEqual({ title: 'Outra' });
  });

  it('detects changes regardless of ids', () => {
    expect(remindersChanged([relative], [{ ...relative, id: 'other' }])).toBe(false);
    expect(remindersChanged([relative], [])).toBe(true);
    expect(remindersChanged([relative], [{ ...relative, channel: 'call' }])).toBe(true);
  });
});
