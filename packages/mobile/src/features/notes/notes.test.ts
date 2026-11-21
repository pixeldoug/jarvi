import { formatRelativeTime, i18n } from '@/i18n';
import type { NoteListItem } from '@/types/notes';
import { isSummaryOutdated, noteSections, notesFingerprint, noteTimeLabel } from './note-text';
import {
  ensureStepIds,
  linkSummaryTasks,
  listStepReviews,
  parseSectionSteps,
  parseSummaryTasks,
  setSummaryTaskChecked,
  splitNextStepsSection,
  updateSummaryStep,
} from './summary-steps';
import { uuidV4 } from './transcription-queue';

const NOW = new Date(2026, 10, 3, 15, 0); // Tuesday

function note(overrides: Partial<NoteListItem>): NoteListItem {
  return {
    id: 'n1',
    title: '',
    preview: '',
    has_summary: false,
    has_transcript: false,
    category: null,
    note_date: null,
    date_removed: false,
    is_owner: true,
    pinned_at: null,
    created_at: new Date(2026, 10, 3, 9, 30).toISOString(),
    updated_at: new Date(2026, 10, 3, 9, 30).toISOString(),
    ...overrides,
  };
}

describe('notesFingerprint', () => {
  it('matches the backend (values from packages/backend noteService.notesFingerprint)', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Ligar para ' }, { type: 'text', text: 'Ana', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Revisar contrato' }, { type: 'hardBreak' }, { type: 'text', text: 'até sexta' }] },
      ],
    });
    expect(notesFingerprint(doc)).toBe('41:dfd4e7f9');
    expect(notesFingerprint('')).toBe('0:811c9dc5');
    expect(notesFingerprint('texto solto')).toBe('11:a7e502ec');
  });
});

describe('formatRelativeTime (the summary\'s "Gerado …")', () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  const MIN = 60_000;
  const rel = (iso: string) => formatRelativeTime(iso, { now: NOW });

  it('words past times in pt-BR exactly as before i18n', () => {
    expect(rel(ago(10_000))).toBe('agora mesmo');
    expect(rel(ago(-MIN))).toBe('agora mesmo');
    expect(rel(ago(MIN))).toBe('há 1 minuto');
    expect(rel(ago(5 * MIN))).toBe('há 5 minutos');
    expect(rel(ago(60 * MIN))).toBe('há 1 hora');
    expect(rel(ago(3 * 60 * MIN))).toBe('há 3 horas');
    expect(rel(new Date(2026, 10, 2, 9).toISOString())).toBe('ontem');
    expect(rel(new Date(2026, 9, 30, 9).toISOString())).toBe('há 4 dias');
    expect(rel(new Date(2026, 9, 7, 9).toISOString())).toBe('em 7 Out');
    expect(rel('')).toBe('');
  });

  it('words them in en-US', () => {
    const en = (iso: string) => formatRelativeTime(iso, { now: NOW, locale: 'en-US' });
    expect(en(ago(10_000))).toBe('just now');
    expect(en(ago(5 * MIN))).toBe('5 minutes ago');
    expect(en(new Date(2026, 10, 2, 9).toISOString())).toBe('yesterday');
    expect(en(new Date(2026, 9, 7, 9).toISOString())).toBe('on Oct 7');
  });
});

describe('isSummaryOutdated', () => {
  const base = {
    content: '',
    summary: '{"type":"doc","content":[]}',
    summary_updated_at: '2026-11-03T12:00:00.000Z',
    summary_notes_fingerprint: notesFingerprint(''),
    segments: [],
  };

  it('flags newer notes or transcript, not an unknown fingerprint', () => {
    expect(isSummaryOutdated(base)).toBe(false);
    expect(isSummaryOutdated({ ...base, content: 'nova linha' })).toBe(true);
    expect(isSummaryOutdated({ ...base, content: 'nova linha', summary_notes_fingerprint: null })).toBe(false);
    const segment = { id: 's', seq: 1, text: 'oi', recorded_at: '', duration_ms: 0, created_at: '2026-11-03T12:05:00.000Z' };
    expect(isSummaryOutdated({ ...base, segments: [segment] })).toBe(true);
  });
});

describe('noteSections', () => {
  it('puts pinned notes first, then groups by day, newest first', () => {
    const sections = noteSections(
      [
        note({ id: 'old', created_at: new Date(2026, 9, 1).toISOString() }),
        note({ id: 'today' }),
        note({ id: 'pinned', created_at: new Date(2026, 9, 1).toISOString(), pinned_at: '2026-11-01T10:00:00Z' }),
        note({ id: 'yesterday', created_at: new Date(2026, 10, 2, 20).toISOString() }),
        note({ id: 'next', note_date: '2026-11-10' }),
      ],
      NOW,
    );
    expect(sections.map((section) => [section.key, section.data.map((n) => n.id)])).toEqual([
      ['pinned', ['pinned']],
      ['upcoming', ['next']],
      ['today', ['today']],
      ['yesterday', ['yesterday']],
      ['older', ['old']],
    ]);
    // The screen shows `notes:list.groups.<key>`.
    expect(sections.map((section) => i18n.t(`notes:list.groups.${section.key}`))).toEqual([
      'Fixadas',
      'Próximas',
      'Hoje',
      'Ontem',
      'Mais antigas',
    ]);
  });

  it('labels a note on its creation day with the time, otherwise the date', () => {
    expect(noteTimeLabel(note({}), NOW)).toBe('09:30');
    expect(noteTimeLabel(note({ note_date: '2026-11-10' }), NOW)).toBe('10 Nov');
    expect(noteTimeLabel(note({ note_date: '2025-11-10' }), NOW)).toBe('10 Nov 2025');
    expect(noteTimeLabel(note({ date_removed: true }), NOW)).toBe('');
  });

  it('labels them in en-US', () => {
    const en = { locale: 'en-US' } as const;
    expect(noteTimeLabel(note({}), NOW, en)).toBe('9:30 AM');
    expect(noteTimeLabel(note({ note_date: '2026-11-10' }), NOW, en)).toBe('Nov 10');
    expect(noteTimeLabel(note({ note_date: '2025-11-10' }), NOW, en)).toBe('Nov 10, 2025');
  });
});

const step = (text: string, attrs: Record<string, unknown> = {}) => ({
  type: 'taskItem',
  attrs: { checked: false, ...attrs },
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const SUMMARY = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Resumo' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Reunião com a Ana.' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Próximos passos' }] },
    {
      type: 'taskList',
      content: [
        step('Enviar proposta', { stepId: 'step-0001' }),
        step('Marcar retorno'),
        step('Enviar a proposta revisada', { stepId: 'step-0003', reviewOf: 'step-0001' }),
      ],
    },
  ],
});

describe('summary next steps', () => {
  it('splits the "Próximos passos" section out of the body', () => {
    const split = splitNextStepsSection(SUMMARY)!;
    expect(JSON.parse(split.body).content).toHaveLength(2);
    expect(parseSectionSteps(split.section).map((item) => item.text)).toEqual([
      'Enviar proposta',
      'Marcar retorno',
      'Enviar a proposta revisada',
    ]);
    expect(splitNextStepsSection('texto solto')).toBeNull();
  });

  it('finds the section under the English heading too (new backend, en-US users)', () => {
    const english = SUMMARY.replace('Próximos passos', 'Next Steps');
    const split = splitNextStepsSection(english)!;
    expect(JSON.parse(split.body).content).toHaveLength(2);
    expect(parseSectionSteps(split.section)).toHaveLength(3);
    // Unrelated headings stay in the body.
    const other = SUMMARY.replace('Próximos passos', 'Decisões');
    expect(splitNextStepsSection(other)!.section).toEqual([]);
  });

  it('gives ids to new steps and links created tasks', () => {
    const withIds = ensureStepIds(SUMMARY, () => 'step-new1');
    expect(parseSummaryTasks(withIds).map((item) => item.stepId)).toEqual(['step-0001', 'step-new1', 'step-0003']);
    expect(ensureStepIds(withIds)).toBe(withIds);

    const linked = setSummaryTaskChecked(
      linkSummaryTasks(withIds, [{ stepId: 'step-0001', taskId: 't1' }]),
      new Map([['t1', true]]),
    );
    expect(parseSummaryTasks(linked)[0]).toMatchObject({ taskId: 't1', checked: true });
  });

  it('lists the steps waiting for "Já é tarefa?"', () => {
    expect(listStepReviews(parseSummaryTasks(SUMMARY))).toEqual([
      { stepId: 'step-0003', text: 'Enviar a proposta revisada', reviewOf: 'step-0001', existingText: 'Enviar proposta' },
    ]);
  });

  it('checks a step without a task in the doc', () => {
    const next = updateSummaryStep(SUMMARY, 'step-0001', { checked: true });
    expect(parseSummaryTasks(next)[0]?.checked).toBe(true);
    expect(updateSummaryStep(SUMMARY, 'missing', { checked: true })).toBe(SUMMARY);
  });
});

describe('uuidV4', () => {
  it('builds ids the transcription route accepts', () => {
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    for (let i = 0; i < 50; i += 1) expect(uuidV4()).toMatch(pattern);
  });
});

describe('notes catalog', () => {
  afterEach(() => {
    void i18n.changeLanguage('pt-BR');
  });

  it('keeps the Portuguese toasts and counts word for word', () => {
    expect(i18n.t('notes:tasksSync.synced', { count: 1 })).toBe('1 tarefa sincronizada');
    expect(i18n.t('notes:tasksSync.synced', { count: 3 })).toBe('3 tarefas sincronizadas');
    expect(i18n.t('notes:tasksSync.skipped', { count: 1 })).toBe(
      'Um passo mudou e não virou tarefa. Abra a nota de novo e tente outra vez.',
    );
    expect(i18n.t('notes:transcript.failed', { count: 1 })).toBe('1 trecho não foi transcrito.');
    expect(i18n.t('notes:transcript.failed', { count: 2 })).toBe('2 trechos não foram transcritos.');
  });

  it('has the English wording', () => {
    void i18n.changeLanguage('en-US');
    expect(i18n.t('notes:tasksSync.synced', { count: 1 })).toBe('1 task synced');
    expect(i18n.t('notes:tasksSync.synced', { count: 2 })).toBe('2 tasks synced');
    expect(i18n.t('notes:nextSteps.title')).toBe('Next steps');
    expect(i18n.t('notes:stepReview.message', { text: 'A', existing: 'B' })).toMatch(/^“A” looks like a step .*“B”\./);
  });
});
