/**
 * Deterministic eval — contextual edits: the AI changes a note or a task
 * description in the place the change belongs, not at its end.
 *
 * No model. Three layers:
 *   1. the edit engine (utils/docEdits.ts) on plain docs: sections, lines,
 *      list items, what stays untouched, anchors that match nothing;
 *   2. the tools that use it against an in-memory SQLite: `update_task`
 *      (`description_edits`) and `update_note` (`edits`);
 *   3. what the user is told: a held-back edit (an anchor miss, an overwrite of
 *      text the model never read) is silent — the model retries.
 *
 * Run:
 *   npm run eval:contextual-edits     (from packages/backend)
 *
 * Exits 1 on any failing assertion so CI can gate on it.
 */

import 'dotenv/config';

import { applyDocEditsToRaw, parseDocEdits, type DocEdit } from '../src/utils/docEdits';
import { markdownToTiptapDoc } from '../src/utils/markdownToTiptapDoc';
import { tiptapDocSections, tiptapDocToMarkdown } from '../src/utils/tiptapDoc';
import type { AgentOperation, ChannelProfile } from '../src/services/agent/core/types';
import { buildContext, makeTask, seedTasksForEval, setupEvalDatabase } from './helpers';

// ---------------------------------------------------------------------------
// Tiny assertion harness (same shape as chat-history.deterministic.ts)
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

async function testCase(name: string, fn: () => Promise<void> | void): Promise<void> {
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
// Fixtures
// ---------------------------------------------------------------------------

const docOf = (markdown: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ ...markdownToTiptapDoc(markdown), ...extra });

const edit = (markdown: string, edits: DocEdit[], extra: Record<string, unknown> = {}) => {
  const result = applyDocEditsToRaw(docOf(markdown, extra), edits);
  return { ...result, md: tiptapDocToMarkdown(result.doc) };
};

const NOTE = `# Reunião de produto

Falamos do lançamento.

## Decisões
- Lançar em março
- Preço fica igual

## Próximos passos
- [ ] Revisar o contrato
- [x] Mandar a ata

## Riscos
Fornecedor pode atrasar.`;

const TASK_DESCRIPTION = `## Contexto
Página de login nova.

**Critérios de aceite:**
- Login com e-mail
- Login com Google

## Próximos passos
- [ ] Desenhar a tela`;

const WEB: ChannelProfile = {
  id: 'web',
  taskCreationTarget: 'tasks',
  toolsAvailable: ['create_task', 'update_task', 'update_note'],
  outputFormat: 'markdown',
  transport: 'stream',
  enableBriefing: false,
  enableMemoryReconciliation: false,
  enableDedup: true,
  enableAntiHallucinationRetry: true,
  supportsTaskMode: true,
  reliableExecution: true,
};

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // ── 1. Engine ────────────────────────────────────────────────────────────
  await testCase('engine/pendência entra em "Próximos passos", no meio da nota', () => {
    const r = edit(NOTE, [{ action: 'append_to_section', anchor: 'Próximos passos', content: '- Ligar para o fornecedor' }]);
    check(r.md.includes('- [x] Mandar a ata\n- [ ] Ligar para o fornecedor\n\n## Riscos'), 'new item ends the section, as a checkbox', r.md);
    check(r.focus?.block === 5 && r.focus.item === 2, 'focus is the new item', r.focus);
    check(r.failures.length === 0 && r.changed, 'applied');
    check(r.md.startsWith('# Reunião de produto\n\nFalamos do lançamento.\n\n## Decisões\n\n- Lançar em março\n- Preço fica igual'), 'the rest is untouched', r.md);
  });

  await testCase('engine/âncora tolera marcadores, acentos, caixa e pontuação', () => {
    const r = edit(NOTE, [{ action: 'append_to_section', anchor: '## proximos passos:', content: 'Ligar para o fornecedor' }]);
    check(r.md.includes('- [ ] Ligar para o fornecedor\n\n## Riscos'), 'a plain line joins a list-only section as an item', r.md);
  });

  await testCase('engine/critério de aceite junto dos critérios (rótulo em negrito)', () => {
    const r = edit(TASK_DESCRIPTION, [{ action: 'append_to_section', anchor: 'Critérios de aceite', content: '- [ ] Mensagem de erro clara' }]);
    check(r.md.includes('- Login com Google\n- Mensagem de erro clara\n\n## Próximos passos'), 'joins the bullet list, as a bullet', r.md);
  });

  await testCase('engine/seção com texto corrido recebe parágrafo, não item', () => {
    const r = edit(NOTE, [{ action: 'append_to_section', anchor: 'Riscos', content: 'Câmbio pode subir.' }]);
    check(r.md.endsWith('Fornecedor pode atrasar.\n\nCâmbio pode subir.'), 'paragraph after the section text', r.md);
  });

  await testCase('engine/inserir antes e depois de uma linha', () => {
    let r = edit(NOTE, [{ action: 'insert_after', anchor: 'Lançar em março', content: '- Beta em fevereiro' }]);
    check(r.md.includes('- Lançar em março\n- Beta em fevereiro\n- Preço fica igual'), 'after an item', r.md);
    r = edit(NOTE, [{ action: 'insert_before', anchor: 'Revisar o contrato', content: '- [ ] Achar o contrato' }]);
    check(r.md.includes('- [ ] Achar o contrato\n- [ ] Revisar o contrato'), 'before an item', r.md);
    r = edit(NOTE, [{ action: 'insert_after', anchor: 'Decisões', content: '- Time dobra' }]);
    check(r.md.includes('## Decisões\n\n- Time dobra\n- Lançar em março'), 'after a title: first of the list below', r.md);
    r = edit(NOTE, [{ action: 'insert_before', anchor: 'Riscos', content: '## Orçamento\nAinda em aberto.' }]);
    check(r.md.includes('- [x] Mandar a ata\n\n## Orçamento\n\nAinda em aberto.\n\n## Riscos'), 'a new section before another', r.md);
  });

  await testCase('engine/atualizar uma linha em vez de duplicar', () => {
    let r = edit(NOTE, [{ action: 'replace', anchor: 'Mandar a ata', content: 'Mandar a ata para todos' }]);
    check(r.md.includes('- [x] Mandar a ata para todos'), 'item replaced, still checked', r.md);
    check(!r.md.includes('- [x] Mandar a ata\n'), 'no duplicate left', r.md);
    r = edit(NOTE, [{ action: 'replace', anchor: 'Falamos do lançamento', content: 'Falamos do lançamento e do preço.' }]);
    check(r.md.includes('# Reunião de produto\n\nFalamos do lançamento e do preço.\n\n## Decisões'), 'paragraph replaced in place', r.md);
  });

  await testCase('engine/trocar só um trecho da linha', () => {
    let r = edit(NOTE, [{ action: 'replace', anchor: 'março', content: 'abril' }]);
    check(r.md.includes('- Lançar em abril\n- Preço fica igual'), 'the word changes, the line stays', r.md);
    r = edit('## Referências\n- Protótipo no **Figma**, página "Login v2"\n- Planilha', [{ action: 'replace', anchor: 'Login v2', content: 'Login v3' }]);
    check(r.md.includes('- Protótipo no **Figma**, página "Login v3"\n- Planilha'), 'part of a list item, formatting around it kept', r.md);
    r = edit('Reunião com a **Ana Paula** na sexta.', [{ action: 'replace', anchor: 'ana paula', content: 'Carla' }]);
    check(r.md === 'Reunião com a **Carla** na sexta.', 'the replacement takes the formatting of what it replaces', r.md);
    // An abbreviated anchor with the whole new line: the line is replaced.
    r = edit(NOTE, [{ action: 'replace', anchor: 'Revisar o', content: 'Revisar o contrato com o jurídico' }]);
    check(r.md.includes('- [ ] Revisar o contrato com o jurídico\n- [x] Mandar a ata'), 'restated line replaces the line', r.md);
    r = edit(NOTE, [{ action: 'replace', anchor: 'Preço fica', content: '- Preço sobe 5%' }]);
    check(r.md.includes('- Lançar em março\n- Preço sobe 5%'), 'content that is a list item replaces the line', r.md);
  });

  await testCase('engine/remover linha e refazer seção', () => {
    let r = edit(NOTE, [{ action: 'delete', anchor: 'Preço fica igual' }, { action: 'delete', anchor: 'Lançar em março' }]);
    check(r.md.includes('## Decisões\n\n## Próximos passos'), 'a list left empty goes', r.md);
    r = edit(NOTE, [{ action: 'replace_section', anchor: 'Próximos passos', content: '- [ ] Aguardar retorno' }]);
    check(r.md.includes('## Próximos passos\n\n- [ ] Aguardar retorno\n\n## Riscos') && !r.md.includes('Revisar o contrato'), 'section body replaced, title kept', r.md);
    r = edit(NOTE, [{ action: 'replace_section', anchor: 'Decisões' }]);
    check(r.md.includes('Falamos do lançamento.\n\n## Próximos passos'), 'no content: the section goes', r.md);
  });

  await testCase('engine/âncora que não existe não muda nada', () => {
    const r = edit(NOTE, [{ action: 'replace', anchor: 'Linha que não existe', content: 'x' }]);
    check(!r.changed, 'unchanged');
    check(r.failures.length === 1 && r.failures[0].reason === 'anchor_not_found', 'reported', r.failures);
    const noAnchor = edit(NOTE, [{ action: 'insert_after', content: 'x' }]);
    check(noAnchor.failures[0]?.reason === 'anchor_required', 'an anchored action needs its anchor', noAnchor.failures);
  });

  await testCase('engine/fim do texto e texto inteiro; anexos ficam', () => {
    const files = { _attachments: [{ id: 'a' }] };
    let r = edit(NOTE, [{ action: 'append', content: '## Outro assunto\nTexto.' }], files);
    check(r.md.endsWith('## Outro assunto\n\nTexto.'), 'appended', r.md);
    check(JSON.stringify(JSON.parse(r.doc)._attachments) === '[{"id":"a"}]', 'attachments kept on append');
    r = edit(NOTE, [{ action: 'replace_all', content: 'Só isso.' }], files);
    check(r.md === 'Só isso.', 'replaced', r.md);
    check(JSON.stringify(JSON.parse(r.doc)._attachments) === '[{"id":"a"}]', 'attachments kept on replace_all');
  });

  await testCase('engine/o que não foi tocado fica idêntico', () => {
    const rich = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Lista' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'um', marks: [{ type: 'underline' }] }] },
                { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'filho' }] }] }] },
              ],
            },
          ],
        },
        { type: 'paragraph', content: [{ type: 'attachmentRef', attrs: { id: 'x', label: 'foto.png' } }] },
      ],
    };
    const r = applyDocEditsToRaw(JSON.stringify(rich), [
      { action: 'append_to_section', anchor: 'Lista', content: '- dois' },
      { action: 'replace', anchor: 'um', content: 'um e meio' },
    ]);
    const doc = JSON.parse(r.doc);
    check(JSON.stringify(doc.content[2]) === JSON.stringify(rich.content[2]), 'the file chip block is the same node');
    check(doc.content[1].content[0].content[1]?.type === 'bulletList', 'items nested under a replaced line stay');
    check(doc.content[1].content.length === 2, 'the new item joined the list', doc.content[1]);
  });

  await testCase('engine/texto legado e doc vazio', () => {
    const legacy = applyDocEditsToRaw('## A\n- um\n\n## B\ntexto', [{ action: 'append_to_section', anchor: 'A', content: '- dois' }]);
    check(tiptapDocToMarkdown(legacy.doc).includes('- um\n- dois\n\n## B'), 'plain text is read as Markdown', legacy.doc);
    const empty = applyDocEditsToRaw('', [{ action: 'append', content: 'Oi' }]);
    check(tiptapDocToMarkdown(empty.doc) === 'Oi', 'empty doc takes the content');
  });

  await testCase('engine/edições vindas da tool (não confiáveis)', () => {
    const parsed = parseDocEdits([{ action: 'append', content: ' x ' }, { action: 'nope' }, 3, { action: 'replace', anchor: 'a', content: '' }]);
    check(JSON.stringify(parsed) === JSON.stringify([{ action: 'append', content: 'x' }, { action: 'replace', anchor: 'a' }]), 'unknown actions dropped, strings trimmed', parsed);
    check(parseDocEdits('nope').length === 0, 'not an array: none');
  });

  await testCase('prompt/seções da descrição (títulos e rótulos de lista)', () => {
    const sections = tiptapDocSections(docOf(TASK_DESCRIPTION));
    check(JSON.stringify(sections) === JSON.stringify(['Contexto', 'Critérios de aceite', 'Próximos passos']), 'headings and list labels', sections);
  });

  // ── 2. Tools ─────────────────────────────────────────────────────────────
  await setupEvalDatabase();
  const { getDatabase } = await import('../src/database');
  const { executeToolCall, getToolDefinition } = await import('../src/services/agent/core/tools');
  const { validateToolArguments } = await import('../src/services/agent/core/toolValidation');
  const { buildConfirmation } = await import('../src/services/agent/core/confirmations');
  const { formatTaskLine } = await import('../src/services/agent/core/tasks');

  const ctx = buildContext({});
  const readDescription = async (id: string): Promise<string> => {
    const row = await getDatabase().get<{ description: string | null }>('SELECT description FROM tasks WHERE id = ?', [id]);
    return row?.description ?? '';
  };

  await testCase('update_task/critério entra junto dos critérios; anexos e o resto ficam', async () => {
    const stored = docOf(TASK_DESCRIPTION, { _attachments: [{ id: 'f1', name: 'tela', ext: '.png' }] });
    const task = makeTask({ title: 'Login novo', description: stored });
    await seedTasksForEval([task]);
    const r = await executeToolCall(
      'update_task',
      { task_id: task.id, description_edits: [{ action: 'append_to_section', anchor: 'Critérios de aceite', content: '- Mensagem de erro clara' }] },
      ctx,
      WEB,
    );
    check(r.success === true && !r.unchanged, 'saved', r);
    const after = await readDescription(task.id);
    const md = tiptapDocToMarkdown(after);
    check(md.includes('- Login com Google\n- Mensagem de erro clara\n\n## Próximos passos'), 'in the criteria list, mid-description', md);
    check(md.startsWith('## Contexto\n\nPágina de login nova.') && md.endsWith('- [ ] Desenhar a tela'), 'everything else untouched', md);
    check(JSON.parse(after)._attachments?.[0]?.id === 'f1', 'attachments kept', after.slice(0, 120));
  });

  await testCase('update_task/trecho inexistente: nada salvo, texto atual devolvido, sem aviso ao usuário', async () => {
    const stored = docOf(TASK_DESCRIPTION);
    const task = makeTask({ title: 'Login novo 2', description: stored });
    await seedTasksForEval([task]);
    const r = await executeToolCall(
      'update_task',
      { task_id: task.id, description_edits: [{ action: 'append_to_section', anchor: 'Riscos', content: '- x' }] },
      ctx,
      WEB,
    );
    check(r.success === false && r.error_code === 'anchor_not_found', 'structured miss', r);
    check((r.message ?? '').includes('Critérios de aceite') && (r.message ?? '').includes('"Riscos"'), 'the model gets the current text and the anchor', r.message);
    check((await readDescription(task.id)) === stored, 'description untouched');
    const op: AgentOperation = {
      tool: 'update_task', kind: 'write', args: {}, success: false, iteration: 0,
      error: { code: 'anchor_not_found', message: r.message ?? '' },
    };
    check(buildConfirmation([op], WEB) === null, 'no "não consegui" for a miss the model retries');
  });

  await testCase('update_task/trecho inexistente com outro campo: o campo salva, a descrição não', async () => {
    const stored = docOf(TASK_DESCRIPTION);
    const task = makeTask({ title: 'Login novo 3', description: stored });
    await seedTasksForEval([task]);
    const r = await executeToolCall(
      'update_task',
      { task_id: task.id, priority: 'high', description_edits: [{ action: 'delete', anchor: 'não existe' }] },
      ctx,
      WEB,
    );
    check(r.success === true && r.changes?.priority === 'high', 'priority saved', r.changes);
    check((r.notes ?? []).some((note) => note.startsWith('description NÃO alterada')), 'the miss is a note', r.notes);
    check((await readDescription(task.id)) === stored, 'description untouched');
  });

  await testCase('update_task/não sobrescreve descrição que o modelo só viu pelo começo', async () => {
    const long = `${TASK_DESCRIPTION}\n\n## Referências\n- Protótipo no Figma, página "Login v2"\n- Documento de requisitos de segurança revisado pelo time de plataforma\n- Planilha de casos de teste`;
    const stored = docOf(long);
    const task = makeTask({ title: 'Login novo 4', description: stored });
    await seedTasksForEval([task]);
    const turn = buildContext({});

    const blindSection = await executeToolCall(
      'update_task',
      { task_id: task.id, description_edits: [{ action: 'replace_section', anchor: 'Referências', content: '- Figma v3' }] },
      turn,
      WEB,
    );
    check(blindSection.success === false && blindSection.error_code === 'description_unseen', 'blind replace_section held back', blindSection);
    check((blindSection.message ?? '').includes('Planilha de casos de teste'), 'the model gets the whole text', blindSection.message);
    check((await readDescription(task.id)) === stored, 'description untouched');

    // Same turn, after reading it: the precise edit goes through.
    const precise = await executeToolCall(
      'update_task',
      { task_id: task.id, description_edits: [{ action: 'replace', anchor: 'Protótipo no Figma, página "Login v2"', content: '- Protótipo no Figma, página "Login v3"' }] },
      turn,
      WEB,
    );
    check(precise.success === true, 'edit after reading is saved', precise);
    const md = tiptapDocToMarkdown(await readDescription(task.id));
    check(md.includes('- Protótipo no Figma, página "Login v3"\n- Documento de requisitos') && md.includes('- Planilha de casos de teste'), 'one line changed, the others kept', md);

    // A new turn, a blind full rewrite: held back too.
    const blindRewrite = await executeToolCall('update_task', { task_id: task.id, description: 'Só isso.' }, buildContext({}), WEB);
    check(blindRewrite.success === false && blindRewrite.error_code === 'description_unseen', 'blind full rewrite held back', blindRewrite);
    check(tiptapDocToMarkdown(await readDescription(task.id)) === md, 'description untouched by the rewrite');

    // The task's own chat shows the whole description: a rewrite is allowed there.
    const focused = await executeToolCall('update_task', { task_id: task.id, description: 'Só isso.' }, { ...buildContext({}), mode: 'task', focusedTask: task }, WEB);
    check(focused.success === true && tiptapDocToMarkdown(await readDescription(task.id)) === 'Só isso.', 'focused task can be rewritten', focused);
  });

  await testCase('update_task/schema aceita description_edits e recusa ação desconhecida', () => {
    const tool = getToolDefinition('update_task', WEB);
    const ok = validateToolArguments(tool, { task_id: 't', description_edits: [{ action: 'replace', anchor: 'a', content: 'b' }] });
    check(ok.ok, 'valid edits pass', ok.issues);
    const bad = validateToolArguments(tool, { task_id: 't', description_edits: [{ action: 'move', anchor: 'a' }] });
    check(!bad.ok, 'unknown action rejected', bad.issues);
  });

  await testCase('prompt/linha da tarefa lista as seções da descrição', () => {
    const line = formatTaskLine(makeTask({ title: 'Login', description: docOf(TASK_DESCRIPTION) }), '2026-01-01', '10:00');
    check(line.includes('seções: Contexto; Critérios de aceite; Próximos passos'), 'sections after the cut description', line);
  });

  await testCase('update_note/pendência na seção certa; âncora errada não escreve', async () => {
    const now = new Date().toISOString();
    await getDatabase().run(
      'INSERT INTO notes (id, user_id, title, content, preview, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['note-1', 'eval-user', '', docOf(NOTE), '', now, now],
    );
    const noteCtx = { ...ctx, openNote: { id: 'note-1', canWrite: true } };
    const readNote = async () =>
      getDatabase().get<{ title: string; content: string }>('SELECT title, content FROM notes WHERE id = ?', ['note-1']);

    const miss = await executeToolCall('update_note', { edits: [{ action: 'replace', anchor: 'Linha fantasma', content: 'x' }] }, noteCtx, WEB);
    check(miss.success === false && miss.error_code === 'anchor_not_found', 'structured miss', miss);
    check((await readNote())?.content === docOf(NOTE), 'note untouched');

    const r = await executeToolCall(
      'update_note',
      { title: 'Reunião de produto', edits: [{ action: 'append_to_section', anchor: 'Próximos passos', content: '- Ligar para o fornecedor' }] },
      noteCtx,
      WEB,
    );
    check(r.success === true && r.data?.content_changed === true && r.data?.title_changed === true, 'saved', r.data);
    const saved = await readNote();
    check(tiptapDocToMarkdown(saved?.content).includes('- [x] Mandar a ata\n- [ ] Ligar para o fornecedor\n\n## Riscos'), 'in "Próximos passos"', saved?.content);
    check(saved?.title === 'Reunião de produto', 'title set');
    check(r.changes?.content === 'add', 'confirmation kind', r.changes);

    const readOnly = await executeToolCall('update_note', { edits: [{ action: 'append', content: 'x' }] }, { ...ctx, openNote: { id: 'note-1', canWrite: false } }, WEB);
    check(readOnly.success === false && readOnly.error_code === 'read_only', 'read-only note refused', readOnly);
    const none = await executeToolCall('update_note', { edits: [{ action: 'append', content: 'x' }] }, ctx, WEB);
    check(none.success === false && none.error_code === 'no_open_note', 'no open note refused', none);
  });

  await testCase('confirmação/nota: escrevi, atualizei, reescrevi', () => {
    const op = (content: string): AgentOperation => ({
      tool: 'update_note', kind: 'write', args: {}, success: true, iteration: 0, persisted: { content },
    });
    check(buildConfirmation([op('add')], WEB, { preferredName: 'Doug' }) === 'Pronto, Doug! Escrevi na sua nota.', 'add');
    check(buildConfirmation([op('edit')], WEB) === 'Pronto! Atualizei sua nota.', 'edit');
    check(buildConfirmation([op('rewrite')], WEB) === 'Pronto! Reescrevi sua nota.', 'rewrite');
  });

  console.log(`\n[contextual-edits] ${passed} assertions passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
