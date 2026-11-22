/**
 * Deterministic eval — versions of a task description ("Versões anteriores").
 *
 * Before the AI replaces a description, the text that was there is kept, and
 * the user can put it back. Asserts, against an in-memory SQLite and with no
 * model call: what is kept (and what is not), the list, the restore (text
 * back, the task's current files untouched, undoable), the per-task cap and
 * that another user reaches nothing.
 *
 * Run:
 *   npm run eval:task-description-versions     (from packages/backend)
 *
 * Exits 1 on any failing assertion so CI can gate on it.
 */

import 'dotenv/config';

import { buildContext, makeTask, seedTasksForEval, setupEvalDatabase } from './helpers';
import type { ChannelProfile, TaskRow } from '../src/services/agent/core/types';

const WEB: ChannelProfile = {
  id: 'web',
  taskCreationTarget: 'tasks',
  toolsAvailable: ['create_task', 'update_task'],
  outputFormat: 'markdown',
  transport: 'stream',
  enableBriefing: false,
  enableMemoryReconciliation: true,
  enableDedup: true,
  enableAntiHallucinationRetry: true,
  supportsTaskMode: true,
  reliableExecution: true,
};

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

const V1 = '## Contexto\nO portão da garagem trava ao fechar desde 02/09/2026.\n\n## Próximos passos\n- [ ] Chamar o técnico.';
const V2 = '## Contexto\nO portão da garagem trava ao fechar desde 02/09/2026.\n\n## Atualizações\n- Em 10/09/2026, o técnico trocou a placa.\n\n## Próximos passos\n- [ ] Pagar o técnico.';
const V3 = `${V2}\n- [ ] Guardar a nota fiscal.`;
const IMAGE = { name: 'foto', ext: '.png', mimeType: 'image/png', previewData: `data:image/png;base64,${'A'.repeat(4000)}` };

async function main(): Promise<void> {
  await setupEvalDatabase();
  const { executeToolCall } = await import('../src/services/agent/core/tools');
  const { getDatabase } = await import('../src/database');
  const { markdownToTiptapDoc } = await import('../src/utils/markdownToTiptapDoc');
  const { tiptapDocToMarkdown } = await import('../src/utils/tiptapDoc');
  const versions = await import('../src/services/taskDescriptionVersionService');
  const mcpTasks = await import('../src/services/mcp/tasks');

  const docOf = (markdown: string, attachments?: unknown[]): string =>
    JSON.stringify({ ...markdownToTiptapDoc(markdown), ...(attachments ? { _attachments: attachments } : {}) });
  const rawOf = async (id: string): Promise<string | null> =>
    (await getDatabase().get<{ description: string | null }>('SELECT description FROM tasks WHERE id = ?', [id]))?.description ?? null;
  const markdownOf = async (id: string): Promise<string> => tiptapDocToMarkdown(await rawOf(id));
  const list = async (task: TaskRow) => (await versions.listTaskDescriptionVersions(task.id, 'eval-user')) ?? [];

  /** The agent's own write path, as the model's `update_task` call lands. */
  const aiUpdate = async (task: TaskRow, args: Record<string, unknown>, profile: ChannelProfile = WEB, userMessage = 'atualiza a tarefa') => {
    const current = { ...task, description: await rawOf(task.id) };
    const ctx = { ...buildContext({ focusedTask: current }), originalUserMessage: userMessage, latestUserMessage: userMessage };
    return executeToolCall('update_task', { task_id: task.id, ...args }, ctx, profile);
  };

  await testCase('a IA altera a descrição: o texto anterior vira uma versão', async () => {
    const task = makeTask({ title: 'Consertar o portão', description: docOf(V1, [IMAGE]) });
    await seedTasksForEval([task]);

    const result = await aiUpdate(task, { description: V2 });
    check(result.success, 'update_task succeeded', result);
    const kept = await list(task);
    check(kept.length === 1, 'one version kept', kept.length);
    check(tiptapDocToMarkdown(kept[0]?.description) === tiptapDocToMarkdown(docOf(V1)), 'it holds the text from before', kept[0]?.description);
    check(!kept[0]?.description.includes('base64') && !kept[0]?.description.includes('_attachments'), 'without the files');
    check(kept[0]?.source === 'agent_web', 'source is the web agent', kept[0]?.source);
    check(kept[0]?.preview.startsWith('Contexto O portão da garagem'), 'preview is the first words', kept[0]?.preview);
    check(!Number.isNaN(Date.parse(kept[0]?.created_at ?? '')), 'created_at is a date', kept[0]?.created_at);
    check(kept[0]?.change?.kind === 'had' && kept[0].change.line === 'Chamar o técnico.' && kept[0].change.more === 0, 'change: the step it had that the new text dropped', kept[0]?.change);

    await aiUpdate(task, { description: V3 }, { ...WEB, id: 'whatsapp' });
    const two = await list(task);
    check(two.length === 2 && two[0].source === 'agent_whatsapp', 'newest first, WhatsApp marked', two.map((v) => v.source));
    check(tiptapDocToMarkdown(two[0].description).includes('trocou a placa'), 'the newest version is the text just replaced');
    check(two[0].change?.kind === 'lacked' && two[0].change.line === 'Guardar a nota fiscal.', 'change: only an addition came after → the line it lacked', two[0].change);
  });

  await testCase('o que não vira versão', async () => {
    const empty = makeTask({ title: 'Comprar tinta', description: null });
    const filesOnly = makeTask({ title: 'Ver foto', description: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }], _attachments: [IMAGE] }) });
    const same = makeTask({ title: 'Ligar para o banco', description: docOf(V1) });
    await seedTasksForEval([empty, filesOnly, same]);

    await aiUpdate(empty, { description: V1 });
    check((await list(empty)).length === 0, 'first description of an empty task: nothing to keep');
    await aiUpdate(filesOnly, { description: V1 });
    check((await list(filesOnly)).length === 0, 'a description with only files: nothing to keep');
    await aiUpdate(same, { priority: 'high' });
    check((await list(same)).length === 0, 'an update that does not touch the description');
    await aiUpdate(same, { description: V1 });
    check((await list(same)).length === 0, 'the same text sent again');
  });

  await testCase('restaurar: o texto volta, os anexos ficam, e dá para desfazer', async () => {
    const task = makeTask({ title: 'Revisar contrato', description: docOf(V1, [IMAGE]) });
    await seedTasksForEval([task]);
    await aiUpdate(task, { description: V2, user_asked_to_remove: true });
    const [v1] = await list(task);

    const restored = await versions.restoreTaskDescriptionVersion(task.id, v1.id, 'eval-user');
    check(restored !== null, 'restore worked');
    check((await markdownOf(task.id)) === tiptapDocToMarkdown(docOf(V1)), 'the description is the old text again', await markdownOf(task.id));
    check(JSON.parse((await rawOf(task.id)) ?? '{}')._attachments?.[0]?.previewData === IMAGE.previewData, 'the attached file is still on the task');
    check(restored?.task.id === task.id && restored.task.description === (await rawOf(task.id)), 'the updated task comes back', restored?.task.id);

    const after = await list(task);
    check(!after.some((v) => v.id === v1.id), 'the restored version leaves the list: its text is the description now', after.map((v) => v.id));
    const replaced = after.find((v) => v.id === restored?.replaced_version_id);
    check(replaced?.source === 'restore' && tiptapDocToMarkdown(replaced.description).includes('trocou a placa'), 'the replaced text was kept as a version', after.map((v) => v.source));

    // Undo: restore the version that holds what the restore replaced.
    await versions.restoreTaskDescriptionVersion(task.id, restored!.replaced_version_id!, 'eval-user');
    check((await markdownOf(task.id)).includes('trocou a placa'), 'undo brings the newer text back', await markdownOf(task.id));
    const final = await list(task);
    const texts = final.map((v) => v.description);
    check(new Set(texts).size === texts.length && final.length === 1, 'after restore + undo: one version (the old text), none twice', final.length);
  });

  await testCase('restaurar sobre uma descrição vazia também dá para desfazer', async () => {
    const task = makeTask({ title: 'Trocar o chuveiro', description: docOf(V1, [IMAGE]) });
    await seedTasksForEval([task]);
    await aiUpdate(task, { description: V2, user_asked_to_remove: true });
    const [v1] = await list(task);
    // The user clears the text by hand (the editor's own save; the file stays).
    const cleared = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }], _attachments: [IMAGE] });
    await getDatabase().run('UPDATE tasks SET description = ? WHERE id = ?', [cleared, task.id]);

    const restored = await versions.restoreTaskDescriptionVersion(task.id, v1.id, 'eval-user');
    check((await markdownOf(task.id)) === tiptapDocToMarkdown(docOf(V1)), 'the old text is back', await markdownOf(task.id));
    check(typeof restored?.replaced_version_id === 'string', 'the empty state was kept, so there is something to undo to', restored?.replaced_version_id);
    const emptyVersion = (await list(task)).find((v) => v.id === restored?.replaced_version_id);
    check(emptyVersion?.preview === '' && emptyVersion.source === 'restore', 'it is listed as an empty version', emptyVersion);
    check(emptyVersion?.change?.kind === 'lacked', 'described by what it did not have yet', emptyVersion?.change);

    const undone = await versions.restoreTaskDescriptionVersion(task.id, restored!.replaced_version_id!, 'eval-user');
    check((await markdownOf(task.id)).trim() === '', 'undo: the description is empty again', await markdownOf(task.id));
    check(JSON.parse((await rawOf(task.id)) ?? '{}')._attachments?.length === 1, 'the file is still there');
    const after = await list(task);
    check(after.some((v) => v.id === undone?.replaced_version_id && tiptapDocToMarkdown(v.description) === tiptapDocToMarkdown(docOf(V1))), 'the text the undo replaced is a version again', after.map((v) => v.preview));
    check(!after.some((v) => v.preview === ''), 'and the empty version left the list', after.map((v) => v.preview));

    // The AI writing over an empty description still keeps nothing.
    await aiUpdate(task, { description: V3 });
    check(!(await list(task)).some((v) => v.preview === ''), 'an AI write over an empty description keeps no empty version');
  });

  await testCase('restaurar não passa por cima de um salvamento feito no meio', async () => {
    const task = makeTask({ title: 'Renovar o seguro', description: docOf(V1) });
    await seedTasksForEval([task]);
    await aiUpdate(task, { description: V2, user_asked_to_remove: true });
    const [v1] = await list(task);

    // Another tab saves (new text + a file) right after the restore read the
    // task: the save lands when the restore keeps its first snapshot.
    const NEWER = '## Contexto\nA apólice 7731 vence em 30/11/2026.';
    const newer = docOf(NEWER, [IMAGE]);
    await getDatabase().run('CREATE TABLE eval_other_tab (description TEXT)');
    await getDatabase().run('INSERT INTO eval_other_tab VALUES (?)', [newer]);
    await getDatabase().run(
      `CREATE TRIGGER eval_save_in_between AFTER INSERT ON task_description_versions
       WHEN NEW.source = 'restore' AND (SELECT COUNT(*) FROM eval_other_tab) > 0
       BEGIN
         UPDATE tasks SET description = (SELECT description FROM eval_other_tab) WHERE id = NEW.task_id;
         DELETE FROM eval_other_tab;
       END`,
    );
    try {
      const restored = await versions.restoreTaskDescriptionVersion(task.id, v1.id, 'eval-user');
      check((await markdownOf(task.id)) === tiptapDocToMarkdown(docOf(V1)), 'the restore still lands', await markdownOf(task.id));
      check(JSON.parse((await rawOf(task.id)) ?? '{}')._attachments?.[0]?.previewData === IMAGE.previewData, 'the file added in between is on the task');
      const after = await list(task);
      const keptNewer = after.find((v) => v.id === restored?.replaced_version_id);
      check(tiptapDocToMarkdown(keptNewer?.description) === tiptapDocToMarkdown(docOf(NEWER)), 'the text saved in between was kept, and is what undo goes back to', after.map((v) => v.preview));
      check(after.some((v) => tiptapDocToMarkdown(v.description).includes('trocou a placa')), 'the text from before that save is kept too', after.map((v) => v.preview));
    } finally {
      await getDatabase().run('DROP TRIGGER IF EXISTS eval_save_in_between');
      await getDatabase().run('DROP TABLE IF EXISTS eval_other_tab');
    }
  });

  await testCase('restaurar a versão mais antiga com a lista cheia, com um salvamento no meio', async () => {
    const task = makeTask({ title: 'Diário da reforma', description: docOf('Dia 0: começou a reforma.') });
    await seedTasksForEval([task]);
    // A full list: the oldest version is the one that goes when another is kept.
    for (let day = 1; day <= versions.TASK_DESCRIPTION_VERSIONS_MAX; day++) {
      await aiUpdate(task, { description: `Dia ${day}: registro ${day}.`, user_asked_to_remove: true }, WEB, 'reescreve a descrição');
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const full = await list(task);
    const oldest = full[full.length - 1];
    check(full.length === versions.TASK_DESCRIPTION_VERSIONS_MAX && oldest.preview.includes('Dia 0'), 'the list is full and its oldest is day 0', { length: full.length, oldest: oldest.preview });

    await getDatabase().run('CREATE TABLE eval_other_tab (description TEXT)');
    await getDatabase().run('INSERT INTO eval_other_tab VALUES (?)', [docOf('Salvo em outra aba no meio da restauração.')]);
    await getDatabase().run(
      `CREATE TRIGGER eval_save_in_between AFTER INSERT ON task_description_versions
       WHEN NEW.source = 'restore' AND (SELECT COUNT(*) FROM eval_other_tab) > 0
       BEGIN
         UPDATE tasks SET description = (SELECT description FROM eval_other_tab) WHERE id = NEW.task_id;
         DELETE FROM eval_other_tab;
       END`,
    );
    try {
      const restored = await versions.restoreTaskDescriptionVersion(task.id, oldest.id, 'eval-user');
      check(restored !== null, 'the restore is not refused as "version not found"');
      check((await markdownOf(task.id)).includes('Dia 0: começou a reforma.'), 'the chosen text is the description', await markdownOf(task.id));
      const after = await list(task);
      check(after.some((v) => v.preview.includes('Salvo em outra aba')), 'the text saved in between was kept', after.map((v) => v.preview));
      check(after.length <= versions.TASK_DESCRIPTION_VERSIONS_MAX, 'the cap still holds', after.length);
    } finally {
      await getDatabase().run('DROP TRIGGER IF EXISTS eval_save_in_between');
      await getDatabase().run('DROP TABLE IF EXISTS eval_other_tab');
    }
  });

  await testCase('só o dono', async () => {
    const task = makeTask({ title: 'Plano de viagem', description: docOf(V1) });
    await seedTasksForEval([task]);
    await aiUpdate(task, { description: V2 });
    const [version] = await list(task);

    check((await versions.listTaskDescriptionVersions(task.id, 'someone-else')) === null, 'another user cannot list');
    check((await versions.restoreTaskDescriptionVersion(task.id, version.id, 'someone-else')) === null, 'another user cannot restore');
    check((await versions.restoreTaskDescriptionVersion(task.id, 'no-such-version', 'eval-user')) === null, 'an unknown version is refused');
    const other = makeTask({ title: 'Outra tarefa', description: docOf(V3) });
    await seedTasksForEval([other]);
    check((await versions.restoreTaskDescriptionVersion(other.id, version.id, 'eval-user')) === null, "a version of another task is refused");
    check((await markdownOf(other.id)).includes('Guardar a nota fiscal'), 'and that task is untouched');
  });

  await testCase('limite por tarefa', async () => {
    const task = makeTask({ title: 'Diário da obra', description: docOf('Dia 0: começou a obra.') });
    await seedTasksForEval([task]);
    const total = versions.TASK_DESCRIPTION_VERSIONS_MAX + 5;
    for (let day = 1; day <= total; day++) {
      await versions.keepTaskDescriptionVersion({
        taskId: task.id,
        userId: 'eval-user',
        previous: docOf(`Dia ${day - 1}: registro ${day - 1}.`),
        next: docOf(`Dia ${day}: registro ${day}.`),
        source: 'agent_web',
      });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const kept = await list(task);
    check(kept.length === versions.TASK_DESCRIPTION_VERSIONS_MAX, `only the latest ${versions.TASK_DESCRIPTION_VERSIONS_MAX} are kept`, kept.length);
    check(kept[0].preview.includes(`registro ${total - 1}`), 'the newest is first', kept[0].preview);
    check(!kept.some((v) => v.preview.includes('registro 0.')), 'the oldest are gone');
  });

  await testCase('MCP: um app conectado também deixa versão', async () => {
    const task = makeTask({ title: 'Lista do mercado', description: docOf(V1) });
    await seedTasksForEval([task]);
    await mcpTasks.updateTask('eval-user', task.id, { description: 'Comprar só leite.' });
    const kept = await list(task);
    check(kept.length === 1 && kept[0].source === 'mcp', 'one version, marked as MCP', kept.map((v) => v.source));
    check(tiptapDocToMarkdown(kept[0].description).includes('portão da garagem'), 'it holds the text from before');
    await mcpTasks.updateTask('eval-user', task.id, { title: 'Lista do mercado da semana' });
    check((await list(task)).length === 1, 'an MCP update without description keeps nothing');
  });

  console.log(`\n${passed} assertions passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
