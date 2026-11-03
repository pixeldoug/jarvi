/**
 * Live check — Notas: next step identity against the real summary model.
 *
 * Same flow as notes-next-steps.deterministic.ts, but every summary comes
 * from the configured OpenAI model, so the exact items vary from run to run.
 * It asserts what must hold whatever the model writes, and prints what
 * happened to each step on every round:
 * - every task stays linked to exactly one item, and no task row changes;
 * - no `[pN]` mark is left in the text;
 * - an item in doubt is never linked;
 * - a similar but different step ("proposta técnica") never takes the task
 *   of another one ("proposta comercial");
 * - the list description is the model's one-sentence brief.
 *
 * Run (needs a valid OPENAI_API_KEY in packages/backend/.env; four model calls):
 *   npm run eval:notes-next-steps:live     (from packages/backend)
 *
 * PostHog is switched off for this run, and no key or raw API error is printed.
 */

import 'dotenv/config';

import { setupEvalDatabase } from './helpers';

const USER = 'eval-user';
const EMAIL = 'eval@jarvi.test';

const WEB_SUMMARY_TASKS = '../../web/src/components/features/notes/summaryTasks';

/** What this check uses of packages/web/src/components/features/notes/summaryTasks.ts */
interface WebSummaryItem {
  text: string;
  taskId: string | null;
  stepId: string | null;
  reviewOf: string | null;
}
interface WebSummaryTasks {
  parseSummaryTasks(raw: string | null | undefined): WebSummaryItem[];
}

let failures = 0;
function check(condition: unknown, message: string): void {
  if (condition) return;
  failures += 1;
  console.error(`  ✗ ${message}`);
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set: nothing was run.');
    process.exit(1);
  }
  // No $ai_generation events from a test run (read when the services load).
  process.env.POSTHOG_API_KEY = '';

  await setupEvalDatabase();
  const { getDatabase } = await import('../src/database');
  const noteService = await import('../src/services/noteService');
  const { createNoteSummaryCompletion } = await import('../src/services/openaiService');
  const { markdownToTiptapDoc } = await import('../src/utils/markdownToTiptapDoc');
  const web = (await import(WEB_SUMMARY_TASKS)) as WebSummaryTasks;
  const db = getDatabase();

  const note = await noteService.createNote(USER, { content: '' });
  const setNotes = (lines: string[]) =>
    noteService.updateNote(note.id, { content: JSON.stringify(markdownToTiptapDoc(lines.join('\n'))) });
  const storedItems = async () => {
    const row = await db.get<{ summary: string | null }>('SELECT summary FROM notes WHERE id = ?', [note.id]);
    return web.parseSummaryTasks(row?.summary);
  };
  const tasksSnapshot = async () =>
    JSON.stringify(await db.all('SELECT id, title, completed, due_date, time FROM tasks ORDER BY id'));

  // The model's marks, by item text ("- [ ] [p2] texto" → texto → p2).
  let marks = new Map<string, string>();
  const complete: typeof createNoteSummaryCompletion = async (messages, telemetry) => {
    const parsed = await createNoteSummaryCompletion(messages, telemetry);
    marks = new Map();
    const markdown = typeof parsed.summary_markdown === 'string' ? parsed.summary_markdown : '';
    for (const match of markdown.matchAll(/^\s*[-*+]\s+\[[ xX]\]\s+\[(p\d+)\]\s*(.+)$/gim)) {
      marks.set(match[2].replace(/\s+/g, ' ').trim(), match[1]);
    }
    return parsed;
  };

  const linked = new Map<string, string>(); // task id → name
  async function round(label: string): Promise<WebSummaryItem[]> {
    const previous = await storedItems();
    const tasksBefore = await tasksSnapshot();
    const result = await noteService.generateNoteSummary(note.id, undefined, complete);
    check(result && result !== 'empty', `${label}: the model returned a summary`);
    const items = await storedItems();

    const listed = (await noteService.listNotes(USER)).find((item) => item.id === note.id);
    console.log(`\n${label}: ${items.length} próximos passos, ${marks.size} com marca da IA`);
    console.log(`  descrição na lista: "${listed?.preview ?? ''}"`);
    check(
      !!listed?.preview && !listed.preview.startsWith('Reunião de lançamento do app'),
      `${label}: the list description is the model's sentence, not the notes' first line`,
    );
    for (const item of items) {
      const mark = marks.get(item.text);
      const before = previous.find((prev) => prev.stepId === item.stepId);
      const status = item.reviewOf
        ? 'pergunta ao usuário'
        : item.taskId
          ? before?.text === item.text
            ? 'tarefa, mesmo texto'
            : 'tarefa, texto novo'
          : before
            ? 'mesmo passo'
            : 'novo';
      console.log(`  - [${status}]${mark ? ` (IA: ${mark})` : ''} ${item.text}`);
    }

    check((await tasksSnapshot()) === tasksBefore, `${label}: no task row changed`);
    for (const [taskId, name] of linked) {
      const count = items.filter((item) => item.taskId === taskId).length;
      check(count === 1, `${label}: "${name}" is linked to exactly one item (found ${count})`);
    }
    check(items.every((item) => !/\[p\d+\]/i.test(item.text)), `${label}: no [pN] mark left in the text`);
    check(items.every((item) => !(item.reviewOf && item.taskId)), `${label}: an item in doubt is never linked`);
    return items;
  }

  // 1. First summary; two of its steps become tasks.
  await setNotes([
    'Reunião de lançamento do app (24/10).',
    '- Ana vai enviar a proposta comercial para a Acme até sexta.',
    '- Diego precisa revisar o login com Google antes do lançamento.',
    '- Carla apresenta os protótipos na terça.',
    '- Decidimos lançar em novembro. Dúvida: preço do plano anual.',
  ]);
  const first = await round('Geração');
  const proposal = first.find((item) => /proposta/i.test(item.text));
  const login = first.find((item) => /login/i.test(item.text));
  check(proposal && login, 'the first summary has the proposal and the login steps');
  if (!proposal?.stepId || !login?.stepId) throw new Error('missing steps');
  const created = await noteService.createTasksFromNote(
    note.id,
    USER,
    [proposal, login].map((item) => ({ stepId: item.stepId!, text: item.text })),
    EMAIL,
  );
  const [proposalTask, loginTask] = created!;
  linked.set(proposalTask.id!, 'proposta comercial');
  linked.set(loginTask.id!, 'login');
  console.log(`\nTarefas criadas: "${proposalTask.title}" | "${loginTask.title}"`);

  // 2. The same notes again.
  await round('Regeneração 1 (mesmas notas)');

  // 3. Reworded notes and a new step.
  await setNotes([
    'Reunião de lançamento do app (24/10).',
    '- Ana vai mandar a proposta comercial revisada para a Acme até sexta-feira.',
    '- Diego vai revisar o login com o Google no ambiente de produção.',
    '- Carla apresenta os protótipos na terça.',
    '- Bruno vai contratar um designer para o site.',
    '- Decidimos lançar em novembro. Dúvida: preço do plano anual.',
  ]);
  await round('Regeneração 2 (notas reescritas)');

  // 4. A similar but different step.
  await setNotes([
    'Reunião de lançamento do app (24/10).',
    '- Ana vai mandar a proposta comercial revisada para a Acme até sexta-feira.',
    '- Ana também precisa enviar a proposta técnica para a Acme.',
    '- Diego vai revisar o login com o Google no ambiente de produção.',
    '- Carla apresenta os protótipos na terça.',
    '- Bruno vai contratar um designer para o site.',
  ]);
  const last = await round('Regeneração 3 (passo parecido, mas diferente)');
  const technical = last.filter((item) => /t[ée]cnica/i.test(item.text));
  check(technical.length > 0, 'the summary has the "proposta técnica" step');
  check(
    technical.every((item) => item.taskId !== proposalTask.id),
    'the "proposta técnica" step never takes the "proposta comercial" task',
  );

  console.log(failures === 0 ? '\nlive: all invariants held' : `\nlive: ${failures} invariant(s) failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  const status = (err as { status?: unknown })?.status;
  console.error(`live check failed: ${err instanceof Error ? err.name : 'error'}${status ? ` (HTTP ${String(status)})` : ''}`);
  process.exit(1);
});
