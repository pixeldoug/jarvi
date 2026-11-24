import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  dueDateKey,
  isUpcomingWatchTask,
  isWatchTask,
  shiftDateKey,
  WATCH_UPCOMING_LIMIT,
  watchTaskList,
  WatchTaskRow,
} from './watchTasks';

const today = '2026-11-24';

describe('dueDateKey', () => {
  it('reads text dates, with or without a time', () => {
    assert.equal(dueDateKey('2026-11-24'), '2026-11-24');
    assert.equal(dueDateKey('2026-11-24T00:00:00.000Z'), '2026-11-24');
    assert.equal(dueDateKey('2026-11-24 15:00:00'), '2026-11-24');
  });

  it('reads a Date the way its JSON reaches the watch', () => {
    assert.equal(dueDateKey(new Date('2026-11-24T00:00:00.000Z')), '2026-11-24');
  });

  it('is null for no date or garbage', () => {
    assert.equal(dueDateKey(null), null);
    assert.equal(dueDateKey('amanhã'), null);
  });
});

describe('isWatchTask', () => {
  it('keeps overdue open tasks and every task due today', () => {
    assert.ok(isWatchTask({ due_date: '2026-11-01', completed: false }, today));
    assert.ok(isWatchTask({ due_date: '2026-11-24', completed: false }, today));
    assert.ok(isWatchTask({ due_date: '2026-11-24T00:00:00.000Z', completed: true }, today));
    assert.ok(isWatchTask({ due_date: '2026-11-24', completed: 1 }, today));
  });

  it('drops done overdue tasks, future tasks and tasks with no date', () => {
    assert.ok(!isWatchTask({ due_date: '2026-11-01', completed: true }, today));
    assert.ok(!isWatchTask({ due_date: '2026-11-01', completed: 1 }, today));
    assert.ok(!isWatchTask({ due_date: '2026-11-25', completed: false }, today));
    assert.ok(!isWatchTask({ due_date: null, completed: false }, today));
  });
});

describe('shiftDateKey', () => {
  it('crosses months and years', () => {
    assert.equal(shiftDateKey('2026-11-30', 1), '2026-12-01');
    assert.equal(shiftDateKey('2027-01-01', -1), '2026-12-31');
    assert.equal(shiftDateKey('2028-02-28', 2), '2028-03-01');
  });
});

const row = (id: string, due_date: string | null, completed = false): WatchTaskRow => ({
  id,
  title: id,
  completed,
  time: null,
  due_date,
  created_at: '2026-11-01T00:00:00.000Z',
});

describe('isUpcomingWatchTask', () => {
  it('keeps open tasks after today only', () => {
    assert.ok(isUpcomingWatchTask({ due_date: '2026-11-25', completed: false }, today));
    assert.ok(isUpcomingWatchTask({ due_date: '2027-03-01T00:00:00.000Z', completed: 0 }, today));
    assert.ok(!isUpcomingWatchTask({ due_date: '2026-11-25', completed: true }, today));
    assert.ok(!isUpcomingWatchTask({ due_date: today, completed: false }, today));
    assert.ok(!isUpcomingWatchTask({ due_date: null, completed: false }, today));
  });
});

describe('watchTaskList', () => {
  it('returns overdue + today, then upcoming by date, each task once', () => {
    const current = [row('overdue', '2026-11-20'), row('today', today), row('tomorrow', '2026-11-25')];
    const upcoming = [row('later', '2026-12-10'), row('tomorrow', '2026-11-25'), row('dec1', '2026-12-01')];
    assert.deepEqual(
      watchTaskList(current, upcoming, today).map((r) => r.id),
      ['overdue', 'today', 'tomorrow', 'dec1', 'later'],
    );
  });

  it('caps upcoming at the soonest WATCH_UPCOMING_LIMIT', () => {
    const many = Array.from({ length: WATCH_UPCOMING_LIMIT + 5 }, (_, i) =>
      row(`u${i}`, shiftDateKey(today, i + 1)),
    );
    const result = watchTaskList([], many.reverse(), today);
    assert.equal(result.length, WATCH_UPCOMING_LIMIT);
    assert.equal(result[0].id, 'u0');
  });
});
