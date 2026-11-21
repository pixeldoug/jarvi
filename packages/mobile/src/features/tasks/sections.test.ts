import { i18n } from '@/i18n';
import type { Task, TaskList } from '@/types/models';
import { groupTasks, sectionOf, sectionsForView, sortTasks } from './sections';

// Wednesday 2026-10-28, local time.
const NOW = new Date(2026, 9, 28, 15, 30);

let seq = 0;
function task(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    user_id: 'u1',
    title: `Task ${seq}`,
    completed: false,
    created_at: new Date(2026, 0, 1, 0, seq).toISOString(),
    updated_at: new Date(2026, 0, 1).toISOString(),
    ...overrides,
  };
}

describe('sectionOf', () => {
  it.each([
    ['2026-10-27', 'overdue'],
    ['2026-10-28', 'today'],
    ['2026-10-28T12:00:00.000Z', 'today'],
    ['2026-10-29', 'tomorrow'],
    ['2026-10-30', 'thisWeek'],
    ['2026-11-01', 'thisWeek'],
    ['2026-11-02', 'nextWeek'],
    ['2026-11-08', 'nextWeek'],
    ['2026-11-09', 'later'],
  ])('puts %s in %s', (dueDate, expected) => {
    expect(sectionOf(task({ due_date: dueDate }), NOW)).toBe(expected);
  });

  it('sends undated tasks to the inbox', () => {
    expect(sectionOf(task({ due_date: null }), NOW)).toBe('inbox');
  });

  it('keeps tasks completed today in "Hoje" and the rest in "Concluídas"', () => {
    expect(sectionOf(task({ due_date: '2026-10-28', completed: true }), NOW)).toBe('today');
    expect(sectionOf(task({ due_date: '2026-10-20', completed: true }), NOW)).toBe('completed');
    expect(sectionOf(task({ completed: true }), NOW)).toBe('completed');
  });

  it('has an empty "Esta semana" on Saturday (tomorrow is Sunday)', () => {
    const saturday = new Date(2026, 9, 31, 9);
    expect(sectionOf(task({ due_date: '2026-11-01' }), saturday)).toBe('tomorrow');
    expect(sectionOf(task({ due_date: '2026-11-02' }), saturday)).toBe('nextWeek');
  });

  it('treats Sunday as the last day of the week', () => {
    const sunday = new Date(2026, 10, 1, 9);
    expect(sectionOf(task({ due_date: '2026-11-02' }), sunday)).toBe('tomorrow');
    expect(sectionOf(task({ due_date: '2026-11-03' }), sunday)).toBe('nextWeek');
  });
});

describe('sortTasks', () => {
  it('orders by date, timed before untimed, then by time and creation', () => {
    const a = task({ due_date: '2026-10-29' });
    const b = task({ due_date: '2026-10-28' });
    const c = task({ due_date: '2026-10-28', time: '09:00' });
    const d = task({ due_date: '2026-10-28', time: '08:00' });
    const e = task();
    expect(sortTasks([e, a, b, c, d]).map((t) => t.id)).toEqual([d.id, c.id, b.id, a.id, e.id]);
  });
});

describe('groupTasks', () => {
  it('returns only non-empty sections, in display order', () => {
    const sections = groupTasks(
      [task({ due_date: '2026-11-20' }), task({ due_date: '2026-10-28' }), task(), task({ due_date: '2026-10-01' })],
      NOW,
    );
    expect(sections.map((s) => i18n.t(`tasks:sections.${s.titleKey}`))).toEqual(['Vencidas', 'Hoje', 'Mais tarde', 'Caixa de entrada']);
  });

  it('sinks completed tasks to the end of "Hoje"', () => {
    const done = task({ due_date: '2026-10-28', time: '08:00', completed: true });
    const open = task({ due_date: '2026-10-28', time: '10:00' });
    const [today] = groupTasks([done, open], NOW);
    expect(today?.data.map((t) => t.id)).toEqual([open.id, done.id]);
  });
});

describe('sectionsForView', () => {
  const tasks = [
    task({ due_date: '2026-10-20', category: 'Casa' }),
    task({ category: 'Trabalho' }),
    task({ due_date: '2026-10-30', recurrence_type: 'weekly', category: 'Casa' }),
    task({ due_date: '2026-10-20', completed: true }),
  ];

  it('lists only open, undated tasks in the inbox', () => {
    const [inbox] = sectionsForView(tasks, { kind: 'inbox' }, NOW);
    expect(inbox?.data.map((t) => t.category)).toEqual(['Trabalho']);
  });

  it('lists only open overdue tasks', () => {
    const sections = sectionsForView(tasks, { kind: 'overdue' }, NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.data).toHaveLength(1);
  });

  it('lists recurring tasks', () => {
    const [recurring] = sectionsForView(tasks, { kind: 'recurring' }, NOW);
    expect(recurring?.data[0]?.recurrence_type).toBe('weekly');
  });

  it('keeps date sections inside a category', () => {
    const sections = sectionsForView(tasks, { kind: 'category', name: 'Casa' }, NOW);
    expect(sections.map((s) => s.id)).toEqual(['overdue', 'thisWeek']);
  });

  it('applies a saved filter', () => {
    const list: TaskList = {
      id: 'l1',
      user_id: 'u1',
      name: 'Sem categoria',
      category_names: [],
      filter_no_category: true,
      show_completed: false,
      created_at: '',
      updated_at: '',
    };
    const sections = sectionsForView(tasks, { kind: 'list', list }, NOW);
    expect(sections.flatMap((s) => s.data)).toHaveLength(0);
  });

  it('returns nothing for an empty smart view', () => {
    expect(sectionsForView([], { kind: 'inbox' }, NOW)).toEqual([]);
  });
});
