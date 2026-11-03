/**
 * Deterministic eval — Notas: next step identity and task links.
 *
 * Drives the note service against an in-memory SQLite with a scripted summary
 * model, and asserts that a next step keeps its identity (`attrs.stepId`) and
 * its task through rewordings and consecutive regenerations, that doubtful
 * matches are flagged instead of linked (and that different steps with
 * similar words are not linked at all), that the user's answer to a doubtful
 * step ("é o mesmo passo" / "é outro passo") is saved and holds on later
 * regenerations, that "Criar tarefas" is idempotent per step (repeated,
 * concurrent, and from a tab with an outdated summary), that deleted tasks,
 * orphan links and summaries saved before step ids are handled, that the
 * client's completion sync sees no change on a regeneration, and that no
 * regeneration or answer ever touches the tasks table.
 *
 * Run:
 *   npm run eval:notes-next-steps     (from packages/backend)
 *
 * Exits 1 on any failing assertion so CI can gate on it.
 */

import 'dotenv/config';

import { setupEvalDatabase } from './helpers';

// ---------------------------------------------------------------------------
// Tiny assertion harness (same shape as daily-summary.deterministic.ts)
// ---------------------------------------------------------------------------

let currentCase = '';
let failures = 0;
let passed = 0;

function check(condition: unknown, message: string, detail?: unknown): void {
  if (condition) {
    passed++;
    return;
  }
  failures++;
  console.error(`  ✗ [${currentCase}] ${message}`);
  if (detail !== undefined) console.error('    →', typeof detail === 'string' ? detail : JSON.stringify(detail));
}

async function testCase(name: string, fn: () => Promise<void>): Promise<void> {
  currentCase = name;
  const before = failures;
  try {
    await fn();
  } catch (err) {
    failures++;
    console.error(`  ✗ [${name}] threw:`, err);
  }
  console.log(`${failures === before ? '✓' : '✗'} ${name}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const USER = 'eval-user';
const EMAIL = 'eval@jarvi.test';

const WEB_SUMMARY_TASKS = '../../web/src/components/features/notes/summaryTasks';
const WEB_NOTE_TEXT = '../../web/src/components/features/notes/noteText';

/** What this eval uses of packages/web/src/components/features/notes/summaryTasks.ts */
interface WebSummaryItem {
  index: number;
  text: string;
  checked: boolean;
  taskId: string | null;
  stepId: string | null;
  reviewOf: string | null;
}
interface WebSummaryTasks {
  parseSummaryTasks(raw: string | null | undefined): Array<WebSummaryItem & { dueDate: string | null; time: string | null; category: string | null }>;
  ensureStepIds(raw: string, createId?: () => string): string;
  isConvertibleStep(item: WebSummaryItem): boolean;
  setSummaryTaskChecked(raw: string, checkedById: ReadonlyMap<string, boolean>): string;
  diffLinkedChecked(prev: string | null | undefined, next: string | null | undefined): Array<{ taskId: string; checked: boolean }>;
  listStepReviews(items: WebSummaryItem[]): Array<{ stepId: string; text: string; reviewOf: string; existingText: string | null }>;
  splitNextStepsSection(raw: string | null | undefined): { body: string; section: unknown[] } | null;
  updateSummaryStep(raw: string, stepId: string, patch: { text?: string; checked?: boolean; dueDate?: string | null; time?: string | null; category?: string | null }): string;
  removeSummaryStep(raw: string, stepId: string): string;
  joinNextStepsSection(body: string, section: unknown[]): string;
  parseSectionSteps(section: unknown[]): WebSummaryItem[];
}

async function main(): Promise<void> {
  await setupEvalDatabase();

  const { getDatabase } = await import('../src/database');
  const noteService = await import('../src/services/noteService');
  const { parseSummaryDoc, summaryStepTexts } = await import('../src/services/noteTasks');
  const { markdownToTiptapDoc } = await import('../src/utils/markdownToTiptapDoc');
  const { insertTask } = await import('../src/services/taskInsert');
  // The web client's pure helpers (completion sync, step ids), loaded by path:
  // they live outside this package's rootDir.
  const web = (await import(WEB_SUMMARY_TASKS)) as WebSummaryTasks;

  const db = getDatabase();

  // ── Helpers ────────────────────────────────────────────────────────────────

  type Step = {
    stepId: string | null;
    taskId: string | null;
    text: string;
    checked: boolean;
    reviewOf: string | null;
  };

  async function storedSummary(noteId: string): Promise<string> {
    const row = await db.get<{ summary: string | null }>('SELECT summary FROM notes WHERE id = ?', [noteId]);
    return row?.summary ?? '';
  }

  function stepsOf(summary: string): Step[] {
    return web.parseSummaryTasks(summary).map((item) => ({
      stepId: item.stepId,
      taskId: item.taskId,
      text: item.text,
      checked: item.checked,
      reviewOf: item.reviewOf,
    }));
  }

  async function steps(noteId: string): Promise<Step[]> {
    return stepsOf(await storedSummary(noteId));
  }

  async function tasksSnapshot(): Promise<string> {
    const rows = await db.all(
      'SELECT id, title, completed, due_date, time, category, source_note_id FROM tasks ORDER BY id',
    );
    return JSON.stringify(rows);
  }

  async function noteTaskCount(noteId: string): Promise<number> {
    const row = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM tasks WHERE source_note_id = ?', [noteId]);
    return row?.n ?? 0;
  }

  /** Generates (or regenerates) the summary with a scripted model; returns the prompt. */
  async function regenerate(noteId: string, markdown: string): Promise<string> {
    let prompt = '';
    const complete = async (messages: { system: string; user: string }) => {
      prompt = messages.user;
      return { title: 'Reunião', summary_markdown: markdown };
    };
    const result = await noteService.generateNoteSummary(noteId, undefined, complete);
    if (!result || result === 'empty') throw new Error('generation returned no summary');
    return prompt;
  }

  async function newNote(): Promise<string> {
    const note = await noteService.createNote(USER, {
      content: JSON.stringify(markdownToTiptapDoc('Reunião com a Ana.')),
    });
    return note.id;
  }

  async function convert(noteId: string, step: Step) {
    const result = await noteService.createTasksFromNote(
      noteId,
      USER,
      [{ stepId: step.stepId!, text: step.text }],
      EMAIL,
    );
    return result![0];
  }

  async function answer(noteId: string, stepId: string, decision: 'same' | 'distinct') {
    return (await noteService.resolveStepReview(noteId, USER, stepId, decision))!;
  }

  /** A note whose summary lists these next steps, the ones at `convert` already tasks. */
  async function noteWithTasks(lines: string[], convertAt: number[]) {
    const noteId = await newNote();
    await regenerate(noteId, ['## Próximos passos', ...lines.map((line) => `- [ ] ${line}`)].join('\n'));
    const created = await steps(noteId);
    const taskIds: string[] = [];
    for (const index of convertAt) taskIds.push((await convert(noteId, created[index])).id!);
    return { noteId, items: await steps(noteId), taskIds };
  }

  const BASE = [
    '## Resumo',
    'Reunião sobre o lançamento.',
    '## Próximos passos',
    '- [ ] Ana: enviar proposta até sexta',
    '- [ ] Revisar login com Google',
    '- [ ] Atualizar o roadmap do trimestre',
  ].join('\n');

  // ── Cases ──────────────────────────────────────────────────────────────────

  await testCase('primeira geração dá um stepId próprio a cada próximo passo', async () => {
    const noteId = await newNote();
    await regenerate(noteId, BASE);
    const items = await steps(noteId);
    check(items.length === 3, 'três próximos passos', items);
    check(items.every((item) => item.stepId), 'todos com stepId', items);
    check(new Set(items.map((item) => item.stepId)).size === 3, 'ids distintos', items);
    check(items.every((item) => !item.taskId && !item.reviewOf), 'nenhum vínculo nem revisão', items);
  });

  await testCase('reformulação marcada pela IA mantém o vínculo, em regenerações consecutivas', async () => {
    const noteId = await newNote();
    await regenerate(noteId, BASE);
    const [ana] = await steps(noteId);
    const created = await convert(noteId, ana);
    check(created.status === 'created' && created.id, 'tarefa criada', created);
    const linked = (await steps(noteId))[0];
    check(linked.taskId === created.id, 'o servidor espelhou o taskId no resumo', linked);
    const before = await tasksSnapshot();

    const prompt = await regenerate(noteId, [
      '## Próximos passos',
      '- [ ] [p1] Ana: mandar a proposta comercial até sexta-feira',
      '- [ ] [p2] Revisar o login com Google',
      '- [ ] [p3] Atualizar roadmap do trimestre',
    ].join('\n'));
    check(
      prompt.includes('<proximos_passos_anteriores>') && prompt.includes('[p1] Ana: enviar proposta até sexta'),
      'o prompt lista os passos anteriores com apelidos',
      prompt.slice(-300),
    );
    let items = await steps(noteId);
    check(
      items[0].stepId === ana.stepId && items[0].taskId === created.id && items[0].text.startsWith('Ana: mandar'),
      '1ª regeneração: mesmo passo, mesma tarefa, texto novo',
      items[0],
    );

    await regenerate(noteId, [
      '## Próximos passos',
      '- [ ] [p1] Ana: encaminhar a proposta até sexta',
      '- [ ] [p3] Atualizar roadmap',
    ].join('\n'));
    items = await steps(noteId);
    check(items[0].stepId === ana.stepId && items[0].taskId === created.id, '2ª regeneração: ainda o mesmo passo', items[0]);

    await regenerate(noteId, '## Próximos passos\n- [ ] Ana: encaminhar a proposta até sexta');
    items = await steps(noteId);
    check(
      items.length === 1 && items[0].stepId === ana.stepId && items[0].taskId === created.id,
      '3ª regeneração (mesmo texto, sem marca): mesmo passo',
      items,
    );
    check((await tasksSnapshot()) === before, 'nenhuma regeneração mexeu nas tarefas');
    check((await noteTaskCount(noteId)) === 1, 'uma tarefa só');
  });

  await testCase('reformulação sem marca é ambígua: nada é vinculado, o original fica', async () => {
    const noteId = await newNote();
    await regenerate(noteId, BASE);
    const login = (await steps(noteId))[1];
    const created = await convert(noteId, login);

    await regenerate(noteId, [
      '## Próximos passos',
      '- [ ] Ana: enviar proposta até sexta',
      '- [ ] Revisar o login do Google em produção',
    ].join('\n'));
    const items = await steps(noteId);
    const flagged = items.find((item) => item.text.startsWith('Revisar o login do Google'));
    const original = items.find((item) => item.stepId === login.stepId);
    check(flagged && !flagged.taskId && flagged.reviewOf === login.stepId, 'item novo sinalizado, sem vínculo', flagged);
    check(
      original && original.taskId === created.id && original.text === login.text,
      'item vinculado preservado como estava',
      original,
    );

    const attempt = await convert(noteId, flagged!);
    check(attempt.status === 'needs_review' && attempt.id === null, 'item sinalizado não vira tarefa', attempt);
    check((await noteTaskCount(noteId)) === 1, 'nenhuma tarefa duplicada');
    const clientItem = web.parseSummaryTasks(await storedSummary(noteId)).find((item) => item.reviewOf);
    check(clientItem && !web.isConvertibleStep(clientItem), 'o cliente não oferece o item sinalizado', clientItem);
  });

  await testCase('marca da IA que não bate com o passo é recusada', async () => {
    const noteId = await newNote();
    await regenerate(noteId, BASE);
    const ana = (await steps(noteId))[0];
    const created = await convert(noteId, ana);

    await regenerate(noteId, '## Próximos passos\n- [ ] [p1] Comprar café para o escritório');
    const items = await steps(noteId);
    const coffee = items.find((item) => item.text.startsWith('Comprar café'));
    check(coffee && !coffee.taskId && coffee.reviewOf === ana.stepId, 'item marcado errado fica sinalizado, sem vínculo', coffee);
    check(
      items.some((item) => item.stepId === ana.stepId && item.taskId === created.id),
      'passo vinculado preservado',
      items,
    );
  });

  await testCase('mesma marca em dois itens: nenhum é vinculado', async () => {
    const noteId = await newNote();
    await regenerate(noteId, BASE);
    const ana = (await steps(noteId))[0];
    const created = await convert(noteId, ana);

    await regenerate(noteId, [
      '## Próximos passos',
      '- [ ] [p1] Ana: enviar proposta revisada',
      '- [ ] [p1] Ana: enviar proposta final',
    ].join('\n'));
    const items = await steps(noteId);
    const claimed = items.filter((item) => item.text.endsWith('revisada') || item.text.endsWith('final'));
    check(
      claimed.length === 2 && claimed.every((item) => !item.taskId && item.reviewOf === ana.stepId),
      'os dois sinalizados, nenhum vinculado',
      claimed,
    );
    check(
      items.some((item) => item.stepId === ana.stepId && item.taskId === created.id),
      'original preservado',
      items,
    );
  });

  await testCase('passo vinculado que a IA omite volta para "Próximos passos"', async () => {
    const noteId = await newNote();
    await regenerate(noteId, BASE);
    const roadmap = (await steps(noteId))[2];
    const created = await convert(noteId, roadmap);

    await regenerate(noteId, '## Resumo\nSó o resumo.\n## Perguntas em aberto\n- Quando lançar?');
    const summary = await storedSummary(noteId);
    const items = stepsOf(summary);
    check(
      items.length === 1 && items[0].stepId === roadmap.stepId && items[0].taskId === created.id,
      'o passo vinculado foi mantido',
      items,
    );
    const doc = JSON.parse(summary) as { content: Array<{ type: string; content?: Array<{ text?: string }> }> };
    const headings = doc.content.filter((node) => node.type === 'heading').map((node) => node.content?.[0]?.text);
    check(
      JSON.stringify(headings) === JSON.stringify(['Resumo', 'Próximos passos', 'Perguntas em aberto']),
      'a seção foi recriada antes de "Perguntas em aberto"',
      headings,
    );
  });

  await testCase('criar tarefa é idempotente: repetido e concorrente', async () => {
    const noteId = await newNote();
    await regenerate(noteId, BASE);
    const step = (await steps(noteId))[2];

    const concurrent = await Promise.all(Array.from({ length: 5 }, () => convert(noteId, step)));
    const ids = new Set(concurrent.map((result) => result.id));
    check(ids.size === 1 && !ids.has(null), 'todas as respostas apontam para a mesma tarefa', concurrent);
    check(concurrent.filter((result) => result.status === 'created').length === 1, 'uma única criação', concurrent);
    check((await noteTaskCount(noteId)) === 1, 'uma tarefa no banco');

    const again = await convert(noteId, step);
    check(again.status === 'existing' && again.id === concurrent[0].id, 'repetição devolve a tarefa existente', again);
    const sameRequest = await noteService.createTasksFromNote(
      noteId,
      USER,
      [
        { stepId: step.stepId!, text: step.text },
        { stepId: step.stepId!, text: step.text },
      ],
      EMAIL,
    );
    check(sameRequest!.every((result) => result.id === concurrent[0].id), 'passo repetido na mesma requisição', sameRequest);
    check((await noteTaskCount(noteId)) === 1, 'ainda uma tarefa');
    check((await steps(noteId))[2].taskId === concurrent[0].id, 'o resumo aponta para a tarefa', await steps(noteId));
  });

  await testCase('tarefa excluída: vínculo órfão é mantido e não recria', async () => {
    const noteId = await newNote();
    await regenerate(noteId, BASE);
    const step = (await steps(noteId))[1];
    const created = await convert(noteId, step);
    await db.run('DELETE FROM tasks WHERE id = ?', [created.id]);

    const again = await convert(noteId, step);
    check(again.status === 'existing' && again.id === created.id, 'não cria outra tarefa para o passo', again);
    check((await noteTaskCount(noteId)) === 0, 'nenhuma tarefa nova');

    await regenerate(noteId, '## Próximos passos\n- [ ] [p2] Revisar o login com Google');
    const items = await steps(noteId);
    check(items[0].stepId === step.stepId && items[0].taskId === created.id, 'regeneração mantém o vínculo órfão', items);
  });

  await testCase('resumo legado (taskId sem stepId) é adotado na leitura, de forma estável', async () => {
    const noteId = await newNote();
    const otherNote = await newNote();
    const fields = { description: null, priority: null, category: null, dueDate: null, time: null };
    const ownTask = await insertTask(USER, { title: 'Enviar proposta', ...fields }, {
      source: 'notes', sourceNoteId: noteId, email: EMAIL, notify: false,
    });
    const foreignTask = await insertTask(USER, { title: 'Outra nota', ...fields }, {
      source: 'notes', sourceNoteId: otherNote, email: EMAIL, notify: false,
    });

    const legacy = markdownToTiptapDoc([
      '## Próximos passos',
      '- [x] Ana: enviar proposta',
      '- [ ] Tarefa de outra nota',
      '- [ ] Item ainda não convertido',
    ].join('\n'));
    const list = legacy.content[1].content!;
    list[0].attrs = { ...list[0].attrs, taskId: ownTask };
    list[1].attrs = { ...list[1].attrs, taskId: foreignTask };
    await db.run('UPDATE notes SET summary = ? WHERE id = ?', [JSON.stringify(legacy), noteId]);

    const first = await noteService.getNoteDetail(noteId, 'owner');
    const adopted = stepsOf(first!.summary!);
    check(adopted.every((item) => item.stepId), 'todos os itens ganharam stepId', adopted);
    check(adopted[0].taskId === ownTask && adopted[0].checked, 'vínculo próprio adotado, estado mantido', adopted[0]);
    check(!adopted[1].taskId, 'vínculo com tarefa de outra nota descartado', adopted[1]);
    const link = await db.get<{ step_id: string }>(
      'SELECT step_id FROM note_step_tasks WHERE note_id = ? AND task_id = ?',
      [noteId, ownTask],
    );
    check(link?.step_id === adopted[0].stepId, 'vínculo gravado em note_step_tasks', link);
    check((await storedSummary(noteId)) === first!.summary, 'a adoção foi persistida');

    const second = await noteService.getNoteDetail(noteId, 'owner');
    check(second!.summary === first!.summary, 'segunda leitura não muda nada');

    const repeat = await convert(noteId, adopted[0]);
    check(repeat.status === 'existing' && repeat.id === ownTask, 'passo adotado não gera duplicata', repeat);
  });

  await testCase('salvamento do cliente não apaga nem forja vínculos', async () => {
    const noteId = await newNote();
    await regenerate(noteId, BASE);
    const [ana, login] = await steps(noteId);
    const created = await convert(noteId, ana);

    // The editor's doc lost the taskId, has a copy of the linked item, and
    // claims a task for an unlinked step.
    const doc = parseSummaryDoc(await storedSummary(noteId))!;
    const list = doc.content.find((node) => node.type === 'taskList')!;
    const [first, second] = list.content!;
    const copy = JSON.parse(JSON.stringify(first));
    delete first.attrs!.taskId;
    second.attrs = { ...second.attrs, taskId: 'forged-task-id' };
    list.content = [first, copy, ...list.content!.slice(1)];
    await noteService.updateNote(noteId, { summary: JSON.stringify(doc) });

    const items = await steps(noteId);
    check(items[0].stepId === ana.stepId && items[0].taskId === created.id, 'vínculo restaurado pelo servidor', items[0]);
    check(!items[1].stepId && !items[1].taskId, 'a cópia perdeu id e vínculo', items[1]);
    check(items[2].stepId === login.stepId && !items[2].taskId, 'vínculo forjado removido', items[2]);
    check(summaryStepTexts(parseSummaryDoc(await storedSummary(noteId))!).length === 4, 'nenhum item perdido');
  });

  await testCase('sincronização de conclusão: regeneração não muda nada, clique do usuário muda', async () => {
    const noteId = await newNote();
    await regenerate(noteId, BASE);
    const ana = (await steps(noteId))[0];
    const created = await convert(noteId, ana);
    // The user completes the task; the item follows it (the client's reconcile).
    await db.run('UPDATE tasks SET completed = 1 WHERE id = ?', [created.id]);
    const checked = web.setSummaryTaskChecked(await storedSummary(noteId), new Map([[created.id!, true]]));
    await noteService.updateNote(noteId, { summary: checked });
    const before = await storedSummary(noteId);
    const tasksBefore = await tasksSnapshot();

    await regenerate(noteId, '## Próximos passos\n- [ ] [p1] Ana: mandar a proposta até sexta');
    const after = await storedSummary(noteId);
    check(stepsOf(after)[0].checked === true, 'o item segue concluído', stepsOf(after)[0]);
    check(web.diffLinkedChecked(before, after).length === 0, 'o cliente não vê mudança de conclusão');
    check((await tasksSnapshot()) === tasksBefore, 'tarefa intacta');

    const unchecked = web.setSummaryTaskChecked(after, new Map([[created.id!, false]]));
    const change = web.diffLinkedChecked(after, unchecked);
    check(
      change.length === 1 && change[0].taskId === created.id && change[0].checked === false,
      'desmarcar no resumo ainda reabre a tarefa',
      change,
    );
  });

  await testCase('cliente: ensureStepIds dá ids a itens novos e separa cópias', async () => {
    let n = 0;
    const createId = () => `client-step-${++n}`;
    const doc = markdownToTiptapDoc('## Próximos passos\n- [ ] Um\n- [ ] Dois\n- [ ] Três');
    const list = doc.content[1].content!;
    list[0].attrs = { ...list[0].attrs, stepId: 'server-step-1', taskId: 'task-1' };
    list[1].attrs = { ...list[1].attrs, stepId: 'server-step-1', taskId: 'task-1' };
    const once = web.ensureStepIds(JSON.stringify(doc), createId);
    const out = web.parseSummaryTasks(once);
    check(out[0].stepId === 'server-step-1' && out[0].taskId === 'task-1', 'o original fica como estava', out[0]);
    check(out[1].stepId === 'client-step-1' && !out[1].taskId, 'a cópia vira um passo novo, sem vínculo', out[1]);
    check(out[2].stepId === 'client-step-2', 'item digitado ganha id', out[2]);
    check(web.ensureStepIds(once, createId) === once, 'idempotente quando todos têm id');
  });


  await testCase('dúvida respondida "é o mesmo passo": um item, a tarefa de sempre, sem perguntar de novo', async () => {
    const { noteId, items, taskIds } = await noteWithTasks(
      ['Revisar login com Google', 'Atualizar o roadmap do trimestre'],
      [0],
    );
    const original = items[0];
    await regenerate(noteId, [
      '## Próximos passos',
      '- [ ] Revisar o login do Google em produção',
      '- [ ] Atualizar o roadmap do trimestre',
    ].join('\n'));
    let current = await steps(noteId);
    const doubtful = current.find((item) => item.reviewOf === original.stepId);
    check(
      doubtful && current.some((item) => item.stepId === original.stepId && item.taskId === taskIds[0]),
      'os dois ficam no resumo até a resposta',
      current,
    );
    const reviews = web.listStepReviews(web.parseSummaryTasks(await storedSummary(noteId)));
    check(
      reviews.length === 1 && reviews[0].text === doubtful?.text && reviews[0].existingText === 'Revisar login com Google',
      'o cliente mostra o passo novo e o que já é tarefa',
      reviews,
    );
    const tasksBefore = await tasksSnapshot();

    const result = await answer(noteId, doubtful!.stepId!, 'same');
    check(result.status === 'resolved', 'resposta salva', result.status);
    current = await steps(noteId);
    const linked = current.filter((item) => item.taskId === taskIds[0]);
    check(linked.length === 1, 'fica um item só ligado à tarefa', current);
    check(
      linked[0]?.stepId === original.stepId && linked[0]?.text === 'Revisar o login do Google em produção' && !linked[0]?.reviewOf,
      'o texto novo fica, com o passo e a tarefa de antes',
      linked[0],
    );
    check((await tasksSnapshot()) === tasksBefore, 'nenhuma tarefa mudou');
    const again = await convert(noteId, linked[0]);
    check(again.status === 'existing' && again.id === taskIds[0], 'não cria outra tarefa', again);

    await regenerate(noteId, '## Próximos passos\n- [ ] Revisar o login do Google em produção');
    current = await steps(noteId);
    check(
      current.length === 1 && current[0].stepId === original.stepId && current[0].taskId === taskIds[0] && !current[0].reviewOf,
      'regeneração com o texto novo: reconhecido, sem nova pergunta',
      current,
    );
    await regenerate(noteId, '## Próximos passos\n- [ ] Revisar login com Google');
    current = await steps(noteId);
    check(
      current.length === 1 && current[0].stepId === original.stepId && !current[0].reviewOf,
      'regeneração com o texto original: reconhecido também',
      current,
    );
    check((await noteTaskCount(noteId)) === 1, 'uma tarefa só');
  });

  await testCase('dúvida respondida "é outro passo": passo próprio, que pode virar tarefa, e a escolha vale depois', async () => {
    const { noteId, items, taskIds } = await noteWithTasks(['Revisar login com Google'], [0]);
    const original = items[0];
    await regenerate(noteId, '## Próximos passos\n- [ ] Revisar o login do Google em produção');
    const doubtful = (await steps(noteId)).find((item) => item.reviewOf === original.stepId)!;
    const tasksBefore = await tasksSnapshot();

    const result = await answer(noteId, doubtful.stepId!, 'distinct');
    check(result.status === 'resolved', 'resposta salva', result.status);
    let current = await steps(noteId);
    const own = web.parseSummaryTasks(await storedSummary(noteId)).find((item) => item.stepId === doubtful.stepId);
    check(own && !own.reviewOf && !own.taskId && web.isConvertibleStep(own), 'passo próprio, oferecido em "Criar tarefas"', own);
    check(current.some((item) => item.stepId === original.stepId && item.taskId === taskIds[0]), 'o passo com tarefa continua', current);
    check((await tasksSnapshot()) === tasksBefore, 'nenhuma tarefa mudou');

    await regenerate(noteId, [
      '## Próximos passos',
      '- [ ] Revisar o login do Google em produção',
      '- [ ] Revisar login com Google',
    ].join('\n'));
    current = await steps(noteId);
    check(
      current.length === 2 && current.every((item) => !item.reviewOf) &&
        current[0].stepId === doubtful.stepId && current[1].taskId === taskIds[0],
      'regeneração com os dois: cada um no seu passo, sem pergunta',
      current,
    );
    await regenerate(noteId, '## Próximos passos\n- [ ] Revisar o login do Google em produção');
    current = await steps(noteId);
    check(
      current.some((item) => item.stepId === doubtful.stepId && !item.reviewOf) &&
        current.some((item) => item.stepId === original.stepId && item.taskId === taskIds[0]),
      'regeneração sem o original: ele volta preservado e o outro segue sem pergunta',
      current,
    );

    const created = await convert(noteId, current.find((item) => item.stepId === doubtful.stepId)!);
    check(created.status === 'created' && created.id !== taskIds[0], 'cria a tarefa do passo novo', created);
    check((await noteTaskCount(noteId)) === 2, 'duas tarefas, uma por passo');
  });

  await testCase('passos diferentes com palavras parecidas não são vinculados', async () => {
    const cases: Array<{ linked: string; claimed: string; unclaimed: string; why: string }> = [
      { linked: 'Enviar proposta para o cliente A', claimed: '[p1] Enviar proposta para o cliente B', unclaimed: 'Enviar proposta para o cliente B', why: 'outro cliente' },
      { linked: 'Revisar a proposta comercial', claimed: '[p1] Enviar a proposta comercial', unclaimed: 'Enviar a proposta comercial', why: 'outra ação' },
      { linked: 'Agendar reunião com o Diego', claimed: '[p1] Agendar reunião com a Carla', unclaimed: 'Agendar reunião com a Carla', why: 'outra pessoa' },
      { linked: 'Ana: enviar proposta técnica', claimed: '[p1] Ana: enviar a proposta comercial', unclaimed: 'Ana: enviar a proposta comercial', why: 'outro objeto' },
      { linked: 'Ana: enviar o contrato até sexta', claimed: '[p1] Diego: enviar o contrato até sexta', unclaimed: 'Diego: enviar o contrato até sexta', why: 'outro responsável' },
      { linked: 'Publicar a versão até 15/11', claimed: '[p1] Publicar a versão até 30/11', unclaimed: 'Publicar a versão até 30/11', why: 'outra data' },
    ];
    for (const { linked, claimed, unclaimed, why } of cases) {
      const before = await tasksSnapshot();

      // The model says it is the same step: the texts contradict it, so the user is asked.
      const claimedNote = await noteWithTasks([linked], [0]);
      await regenerate(claimedNote.noteId, `## Próximos passos\n- [ ] ${claimed}`);
      let current = await steps(claimedNote.noteId);
      const wronglyClaimed = current.find((item) => item.stepId !== claimedNote.items[0].stepId);
      check(
        wronglyClaimed && !wronglyClaimed.taskId && wronglyClaimed.reviewOf === claimedNote.items[0].stepId,
        `${why}, com marca da IA: pergunta, não vincula`,
        current,
      );
      check(
        current.filter((item) => item.taskId === claimedNote.taskIds[0]).length === 1,
        `${why}, com marca da IA: a tarefa segue ligada ao original`,
        current,
      );

      // No claim: a different step, not even a question.
      const plainNote = await noteWithTasks([linked], [0]);
      await regenerate(plainNote.noteId, `## Próximos passos\n- [ ] ${unclaimed}`);
      current = await steps(plainNote.noteId);
      const other = current.find((item) => item.text === unclaimed);
      check(other && !other.taskId && !other.reviewOf, `${why}, sem marca: passo novo, sem pergunta`, current);
      check(
        current.filter((item) => item.taskId === plainNote.taskIds[0]).length === 1,
        `${why}, sem marca: a tarefa segue ligada ao original`,
        current,
      );
      const tasks = JSON.parse(await tasksSnapshot()) as unknown[];
      check(tasks.length === (JSON.parse(before) as unknown[]).length + 2, `${why}: só as duas tarefas dos originais foram criadas`);
    }
  });

  await testCase('duas tarefas parecidas, mas distintas: cada uma no seu passo, mesmo com marcas trocadas', async () => {
    const { noteId, items, taskIds } = await noteWithTasks(
      ['Ana: enviar proposta comercial', 'Ana: enviar proposta técnica'],
      [0, 1],
    );
    const before = await tasksSnapshot();

    await regenerate(noteId, [
      '## Próximos passos',
      '- [ ] [p1] Ana: mandar a proposta comercial revisada',
      '- [ ] [p2] Ana: mandar a proposta técnica revisada',
    ].join('\n'));
    let current = await steps(noteId);
    check(current[0].stepId === items[0].stepId && current[0].taskId === taskIds[0], 'comercial no seu passo', current[0]);
    check(current[1].stepId === items[1].stepId && current[1].taskId === taskIds[1], 'técnica no seu passo', current[1]);

    // The model swaps the marks: no task goes to the wrong step.
    await regenerate(noteId, [
      '## Próximos passos',
      '- [ ] [p2] Ana: enviar a proposta comercial final',
      '- [ ] [p1] Ana: enviar a proposta técnica final',
    ].join('\n'));
    current = await steps(noteId);
    const commercial = current.find((item) => item.text === 'Ana: enviar a proposta comercial final');
    const technical = current.find((item) => item.text === 'Ana: enviar a proposta técnica final');
    check(commercial && !commercial.taskId && commercial.reviewOf === items[0].stepId, 'comercial: pergunta sobre a tarefa comercial', commercial);
    check(technical && !technical.taskId && technical.reviewOf === items[1].stepId, 'técnica: pergunta sobre a tarefa técnica', technical);
    check(taskIds.every((id) => current.filter((item) => item.taskId === id).length === 1), 'as duas tarefas seguem ligadas', current);
    check((await tasksSnapshot()) === before, 'nenhuma tarefa mudou');
  });

  await testCase('dúvida sem resposta continua igual nas regenerações seguintes', async () => {
    const { noteId, items, taskIds } = await noteWithTasks(['Revisar login com Google'], [0]);
    await regenerate(noteId, '## Próximos passos\n- [ ] Revisar o login do Google em produção');
    const doubtful = (await steps(noteId)).find((item) => item.reviewOf)!;
    for (let round = 1; round <= 3; round += 1) {
      await regenerate(noteId, '## Próximos passos\n- [ ] Revisar o login do Google em produção');
      const current = await steps(noteId);
      check(
        current.length === 2 &&
          current.some((item) => item.stepId === doubtful.stepId && item.reviewOf === items[0].stepId && !item.taskId) &&
          current.filter((item) => item.taskId === taskIds[0]).length === 1,
        `rodada ${round}: os dois seguem, a dúvida também`,
        current,
      );
    }
    check((await noteTaskCount(noteId)) === 1, 'nenhuma tarefa nova');
  });

  await testCase('duas abas: resumo desatualizado e respostas ao mesmo tempo', async () => {
    const { noteId, items } = await noteWithTasks(['Revisar login com Google', 'Atualizar o roadmap'], [0]);
    // Tab A replaced the summary (new ids); tab B still converts with the old id.
    await regenerate(noteId, '## Próximos passos\n- [ ] Revisar login com Google\n- [ ] Contratar o designer');
    const stale = await convert(noteId, items[1]);
    check(stale.status === 'stale' && stale.id === null, 'id que o resumo salvo não tem: nenhuma tarefa', stale);
    check((await noteTaskCount(noteId)) === 1, 'nenhuma tarefa nova');

    await regenerate(noteId, '## Próximos passos\n- [ ] Revisar o login do Google em produção');
    const doubtful = (await steps(noteId)).find((item) => item.reviewOf)!;
    const [first, second] = await Promise.all([
      answer(noteId, doubtful.stepId!, 'same'),
      answer(noteId, doubtful.stepId!, 'distinct'),
    ]);
    const statuses = [first.status, second.status].sort();
    check(JSON.stringify(statuses) === JSON.stringify(['not_under_review', 'resolved']), 'uma resposta vale, a outra é recusada', statuses);
    const current = await steps(noteId);
    check(current.every((item) => !item.reviewOf), 'nenhuma dúvida sobrando', current);
    check((await noteTaskCount(noteId)) === 1, 'nenhuma tarefa nova');
  });

  await testCase('dúvida sobre passo cuja tarefa foi excluída', async () => {
    const { noteId, items, taskIds } = await noteWithTasks(['Revisar login com Google'], [0]);
    await db.run('DELETE FROM tasks WHERE id = ?', [taskIds[0]]);
    await regenerate(noteId, '## Próximos passos\n- [ ] Revisar o login do Google em produção');
    let current = await steps(noteId);
    const doubtful = current.find((item) => item.reviewOf === items[0].stepId);
    check(doubtful && !doubtful.taskId, 'ainda pergunta: o vínculo órfão continua valendo', current);

    const result = await answer(noteId, doubtful!.stepId!, 'same');
    check(result.status === 'resolved', 'resposta salva');
    current = await steps(noteId);
    check(current.length === 1 && current[0].stepId === items[0].stepId && current[0].taskId === taskIds[0], 'assume o passo órfão', current);
    const again = await convert(noteId, current[0]);
    check(again.status === 'existing' && (await noteTaskCount(noteId)) === 0, 'não recria a tarefa excluída', again);
  });


  await testCase('reescritas reais do modelo (validação ao vivo): marcadas vinculam, a parecida não', async () => {
    const { noteId, items, taskIds } = await noteWithTasks(
      [
        'Ana: enviar a proposta comercial para a Acme até sexta.',
        'Diego: revisar o login com Google antes do lançamento.',
        'Carla: apresentar os protótipos na terça.',
      ],
      [0, 1],
    );
    const before = await tasksSnapshot();
    await regenerate(noteId, [
      '## Próximos passos',
      '- [ ] [p1] Ana: enviar a proposta comercial revisada para a Acme até sexta-feira.',
      '- [ ] [p2] Diego: revisar o login com Google no ambiente de produção.',
      '- [ ] [p3] Carla: apresentar os protótipos na terça.',
      '- [ ] Bruno: contratar um designer para o site.',
    ].join('\n'));
    let current = await steps(noteId);
    check(current.length === 4 && current.every((item) => !item.reviewOf), 'nenhuma pergunta, nada preservado em dobro', current);
    check(current[0].stepId === items[0].stepId && current[0].taskId === taskIds[0], 'Ana: mesmo passo e tarefa', current[0]);
    check(current[1].stepId === items[1].stepId && current[1].taskId === taskIds[1], 'Diego: mesmo passo e tarefa', current[1]);

    await regenerate(noteId, [
      '## Próximos passos',
      '- [ ] [p1] Ana: enviar a proposta comercial revisada para a Acme até sexta-feira.',
      '- [ ] [p1] Ana: enviar a proposta técnica para a Acme.',
      '- [ ] [p2] Diego: revisar o login com Google no ambiente de produção.',
    ].join('\n'));
    current = await steps(noteId);
    const technical = current.find((item) => item.text.includes('técnica'));
    check(technical && !technical.taskId, 'proposta técnica não pega a tarefa da comercial', technical);
    check(current.filter((item) => item.taskId === taskIds[0]).length === 1, 'a comercial segue com a tarefa, uma vez', current);
    check((await tasksSnapshot()) === before, 'nenhuma tarefa mudou');
  });


  await testCase('aviso de resumo desatualizado: a impressão digital das notas é a mesma no servidor e no cliente', async () => {
    const webText = (await import(WEB_NOTE_TEXT)) as { notesFingerprint(raw: string | null | undefined): string };
    const samples = [
      '',
      'texto solto, não é JSON',
      JSON.stringify(markdownToTiptapDoc('Reunião com a **Ana** sobre a proposta.\n\n- item um\n- item dois')),
      JSON.stringify(markdownToTiptapDoc('Acentuação: ação, café, pão — e emoji 🚀 no fim.')),
      JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '  espaços   demais  ' }] }] }),
    ];
    for (const raw of samples) {
      check(noteService.notesFingerprint(raw) === webText.notesFingerprint(raw), 'mesmo resultado nos dois lados', raw.slice(0, 60));
    }
    const a = JSON.stringify(markdownToTiptapDoc('Ana vai enviar a proposta.'));
    const b = JSON.stringify(markdownToTiptapDoc('Ana vai enviar a proposta até sexta.'));
    const bold = JSON.stringify(markdownToTiptapDoc('Ana vai enviar a **proposta**.'));
    check(noteService.notesFingerprint(a) !== noteService.notesFingerprint(b), 'texto novo muda a impressão digital');
    check(noteService.notesFingerprint(a) === noteService.notesFingerprint(bold), 'só formatação não conta como informação nova');

    const noteId = await newNote();
    await regenerate(noteId, '## Resumo\nResumo.');
    const detail = await noteService.getNoteDetail(noteId, 'owner');
    check(
      detail!.summary_notes_fingerprint === webText.notesFingerprint(detail!.content),
      'o resumo guarda a impressão digital das notas que leu, igual à que o cliente calcula',
      detail!.summary_notes_fingerprint,
    );
  });


  await testCase('gerar o resumo não cria tarefas; o plano do passo vai junto quando ele vira tarefa', async () => {
    const noteId = await newNote();
    await regenerate(noteId, BASE);
    check((await noteTaskCount(noteId)) === 0, 'nenhuma tarefa criada pela geração');

    // The user plans a step in the note (date, time, category, done) without making it a task.
    const [ana, login] = await steps(noteId);
    let summary = await storedSummary(noteId);
    summary = web.updateSummaryStep(summary, login.stepId!, { dueDate: '2026-11-03', time: '09:30', category: 'Trabalho', text: 'Revisar o login com Google em produção' });
    summary = web.updateSummaryStep(summary, ana.stepId!, { checked: true });
    await noteService.updateNote(noteId, { summary });
    let items = web.parseSummaryTasks(await storedSummary(noteId));
    check(items[1].dueDate === '2026-11-03' && items[1].time === '09:30' && items[1].category === 'Trabalho', 'o plano fica salvo no passo', items[1]);
    check(items[0].checked && !items[0].taskId, 'feito na nota, sem virar tarefa', items[0]);

    // A regeneration keeps the plan and the done state of the steps it repeats.
    await regenerate(noteId, [
      '## Próximos passos',
      '- [ ] [p1] Ana: mandar a proposta até sexta',
      '- [ ] [p2] Revisar o login com Google em produção',
      '- [ ] [p3] Atualizar o roadmap do trimestre',
    ].join('\n'));
    items = web.parseSummaryTasks(await storedSummary(noteId));
    check(items[0].checked && items[1].dueDate === '2026-11-03' && items[1].category === 'Trabalho', 'regeneração mantém o que o usuário fez', items);
    check((await noteTaskCount(noteId)) === 0, 'e ainda sem tarefas');

    // "Adicionar às tarefas": the task takes the plan, not the date in the text.
    // The step's category picker lists the user's own categories.
    const now = new Date().toISOString();
    await db.run(
      'INSERT OR IGNORE INTO categories (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['cat-trabalho', USER, 'Trabalho', now, now],
    );
    const [created] = (await noteService.createTasksFromNote(noteId, USER, [{ stepId: items[1].stepId!, text: items[1].text }], EMAIL))!;
    check(created.status === 'created' && created.due_date === '2026-11-03' && created.time === '09:30' && created.category === 'Trabalho', 'a tarefa nasce com a data, hora e categoria do passo', created);
    // A step category the user doesn't have (renamed, deleted, another member's) is not invented.
    await noteService.updateNote(noteId, {
      summary: web.updateSummaryStep(await storedSummary(noteId), items[0].stepId!, { category: 'Viagem' }),
    });
    const unplanned = (await noteService.createTasksFromNote(noteId, USER, [{ stepId: items[0].stepId!, text: items[0].text }], EMAIL))![0];
    check(unplanned.due_date !== null, 'sem data no passo, a data vem do texto ("até sexta")', unplanned);
    check(unplanned.category === null, 'categoria que o usuário não tem fica de fora (a nota não tem categoria)', unplanned);

    // The client removes a step that is not a task yet.
    const removed = web.removeSummaryStep(await storedSummary(noteId), items[2].stepId!);
    check(web.parseSummaryTasks(removed).length === 2, 'excluir o passo na nota tira só ele', web.parseSummaryTasks(removed));
  });

  await testCase('cliente: o resumo se divide em texto e "Próximos passos", e volta igual', async () => {
    const full = JSON.stringify(markdownToTiptapDoc([
      '## Resumo', 'Texto.', '## Próximos passos', '- [ ] Um', '- [ ] Dois', '## Perguntas em aberto', '- Quando?',
    ].join('\n')));
    const parts = web.splitNextStepsSection(full)!;
    const body = JSON.parse(parts.body) as { content: Array<{ type: string }> };
    check(parts.section.length === 2 && body.content.length === 4, 'seção (título + lista) separada do texto', parts);
    check(web.parseSectionSteps(parts.section).map((item) => item.text).join('|') === 'Um|Dois', 'os passos da seção, em ordem');
    const joined = web.joinNextStepsSection(parts.body, parts.section);
    check(web.splitNextStepsSection(joined)!.body === parts.body, 'separar de novo devolve o mesmo texto, byte a byte');
    const withoutSection = JSON.stringify(markdownToTiptapDoc('## Resumo\nSó texto.'));
    check(web.splitNextStepsSection(withoutSection)!.body === withoutSection, 'sem a seção, o texto é o próprio resumo');
  });


  await testCase('descrição da lista: a frase da IA, que sobrevive à edição das notas', async () => {
    const noteId = await newNote();
    const previewOf = async () => (await noteService.listNotes(USER)).find((note) => note.id === noteId)?.preview;
    const brief = 'Ana envia a proposta à Acme até sexta; Diego revisa o login antes do lançamento.';
    const complete = async () => ({ title: 'Reunião', brief: `"${brief}" 🚀`, summary_markdown: '## Resumo\nResumo.' });
    const result = await noteService.generateNoteSummary(noteId, undefined, complete);
    check(result && result !== 'empty' && result.preview === brief, 'a geração devolve a frase como descrição', result);
    check((await previewOf()) === brief, 'a lista mostra a frase (sem aspas nem emoji)', await previewOf());

    await noteService.updateNote(noteId, { content: JSON.stringify(markdownToTiptapDoc('Outro texto nas notas.')) });
    check((await previewOf()) === brief, 'editar as notas não troca a descrição', await previewOf());

    await noteService.updateNote(noteId, { summary: null });
    check((await previewOf()) === 'Outro texto nas notas.', 'sem resumo, volta a ser o texto das notas', await previewOf());

    await regenerate(noteId, '## Resumo\nResumo sem frase.');
    check((await previewOf()) === 'Outro texto nas notas.', 'modelo sem a frase: descrição de antes (texto das notas)', await previewOf());

    const long = noteService.sanitizeBrief('palavra '.repeat(40));
    check(long.length <= 160 && long.endsWith('…'), 'frase longa é cortada numa palavra, com reticências', long);
  });


  await testCase('fixar nota: por usuário, idempotente, some ao desafixar e ao excluir', async () => {
    const noteId = await newNote();
    const other = 'eval-user-2';
    await db.run(
      `INSERT OR IGNORE INTO users (id, email, name, password, auth_provider, has_password, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [other, 'eval2@jarvi.test', 'Outra pessoa', 'x', 'eval', 0, 0, new Date().toISOString(), new Date().toISOString()],
    );
    const pinnedAt = async () => (await noteService.listNotes(USER)).find((note) => note.id === noteId)?.pinned_at;

    check((await pinnedAt()) === null, 'nota nova não está fixada');
    const first = await noteService.setNotePinned(noteId, USER, true);
    check(first && (await pinnedAt()) === first, 'fixada, com a hora do pin', first);
    const again = await noteService.setNotePinned(noteId, USER, true);
    check(again === first, 'fixar de novo mantém a hora do primeiro pin', again);
    check((await noteService.getNoteDetail(noteId, 'owner', USER))!.pinned_at === first, 'o detalhe da nota sabe que está fixada');

    await noteService.setNotePinned(noteId, other, true);
    await noteService.setNotePinned(noteId, USER, false);
    check((await pinnedAt()) === null, 'desafixar remove só o meu pin');
    const remaining = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM note_pins WHERE note_id = ?', [noteId]);
    check(remaining?.n === 1, 'o pin da outra pessoa continua (é dela)', remaining);

    await noteService.deleteNote(noteId);
    const after = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM note_pins WHERE note_id = ?', [noteId]);
    check(after?.n === 0, 'excluir a nota remove os pins');
  });

  console.log(`\n${passed} assertions passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
