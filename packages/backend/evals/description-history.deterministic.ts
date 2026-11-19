/**
 * Deterministic eval — a task description keeps what it already says.
 *
 * Two regressions, both from one real conversation (a task chat where the user
 * sent an update with a screenshot):
 *   1. the agent rewrote the description and the previous context was gone;
 *   2. right after saving, the chat failed with "400 Input tokens exceed the
 *      configured limit": the tool result handed the model the stored row,
 *      attached image included, as text.
 *
 * Drives `runAgent` with a SCRIPTED model (no network, no cost) and asserts
 * what was stored, what the model was sent and what the user saw.
 *
 * Run:
 *   npm run eval:description-history     (from packages/backend)
 *
 * Exits 1 on any failing assertion so CI can gate on it.
 */

import 'dotenv/config';

import type OpenAI from 'openai';
import { buildContext, makeTask, seedTasksForEval, setupEvalDatabase } from './helpers';
import type { AgentContext, ChannelProfile, TaskRow } from '../src/services/agent/core/types';

interface ScriptedTurn {
  text?: string;
  toolCall?: { name: string; args: Record<string, unknown> };
  /** The call fails with this error instead of answering. */
  error?: { status: number; message: string };
}

/** Streaming client that records what each model call was sent. */
function scriptedClient(turns: ScriptedTurn[]): { client: OpenAI; requests: string[] } {
  const requests: string[] = [];
  let call = 0;
  const client = {
    chat: {
      completions: {
        create: async (params: { messages: unknown }) => {
          requests.push(JSON.stringify(params.messages));
          const turn = turns[call] ?? { text: '' };
          call++;
          if (turn.error) throw Object.assign(new Error(turn.error.message), { status: turn.error.status });
          async function* iterate() {
            if (turn.text) yield { choices: [{ delta: { content: turn.text } }] };
            if (turn.toolCall) {
              yield {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: 'call_0',
                          function: { name: turn.toolCall.name, arguments: JSON.stringify(turn.toolCall.args) },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            yield { choices: [{ delta: {}, finish_reason: turn.toolCall ? 'tool_calls' : 'stop' }] };
            yield { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } };
          }
          return iterate();
        },
      },
    },
  };
  return { client: client as unknown as OpenAI, requests };
}

const WEB: ChannelProfile = {
  id: 'web',
  taskCreationTarget: 'tasks',
  toolsAvailable: ['create_task', 'update_task', 'complete_task', 'delete_task', 'search_tasks'],
  outputFormat: 'markdown',
  transport: 'stream',
  enableBriefing: false,
  enableMemoryReconciliation: true,
  enableDedup: true,
  enableAntiHallucinationRetry: true,
  supportsTaskMode: true,
  reliableExecution: true,
  enableNextQuestionPolicy: true,
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

// The task as it was before the update that lost its context.
const BEFORE_MD = [
  '## Contexto',
  'Sua máquina LG lava e seca parou no meio do ciclo e mostra o código de erro OE no display.',
  'Ela foi comprada em 03/2024 e a garantia de fábrica já acabou.',
  '',
  '## Atualizações',
  '- Em 12/10/2026, você tentou limpar o filtro de drenagem e o erro continuou.',
  '- Em 05/11/2026, você pediu um orçamento por telefone: R$ 480 só a visita.',
  '',
  '## Próximos passos',
  '- [ ] Ligar para a assistência técnica da LG.',
  '- [ ] Separar a nota fiscal.',
].join('\n');

// What the model sent: the context rewritten as today's status, older updates gone.
const REWRITE_MD = [
  '## Contexto',
  'Você está aguardando o contato da assistência técnica autorizada da LG para avaliar sua máquina lava e seca.',
  '',
  '## Atualizações',
  '- Em 19/11/2026, você entrou em contato com a LG assistência técnica e uma autorizada deve entrar em contato em até 2 dias úteis.',
  '- Ordem de serviço: RNN26119019063.',
  '',
  '## Próximos passos',
  '- [ ] Aguardar o contato da assistência técnica autorizada.',
].join('\n');

// A well-behaved update: every older line copied, the news added.
const ADDITIVE_MD = [
  '## Contexto',
  'Sua máquina LG lava e seca parou no meio do ciclo e mostra o código de erro OE no display.',
  'Ela foi comprada em 03/2024 e a garantia de fábrica já acabou.',
  '',
  '## Atualizações',
  '- Em 12/10/2026, você tentou limpar o filtro de drenagem e o erro continuou.',
  '- Em 05/11/2026, você pediu um orçamento por telefone: R$ 480 só a visita.',
  '- Em 19/11/2026, você entrou em contato com a LG e uma autorizada deve ligar em até 2 dias úteis.',
  '',
  '## Próximos passos',
  '- [ ] Aguardar o contato da assistência técnica autorizada.',
].join('\n');

/** A 300 KB "image" as the web stores it in a description. */
const IMAGE_DATA_URL = `data:image/png;base64,${'iVBORw0KGgoAAAANSUhEUgAA'.repeat(12_500)}`;

async function main(): Promise<void> {
  await setupEvalDatabase();
  const { runAgent, __setOpenAIClientForTesting, isContextTooLargeError } = await import('../src/services/agent/core/runAgent');
  const { buildTaskFocusedPrompt } = await import('../src/services/agent/core/prompt');
  const { keepDescriptionHistory, isRemovalRequested } = await import('../src/services/agent/core/descriptionHistory');
  const { mergeAgentDescriptionUpdate } = await import('../src/services/agent/core/taskDescriptionMerge');
  const { toModelVisible } = await import('../src/services/agent/core/toolResultForModel');
  const { markdownToTiptapDoc } = await import('../src/utils/markdownToTiptapDoc');
  const { tiptapDocToMarkdown } = await import('../src/utils/tiptapDoc');
  const { getDatabase } = await import('../src/database');

  const docOf = (markdown: string, attachments?: unknown[]): string =>
    JSON.stringify({ ...markdownToTiptapDoc(markdown), ...(attachments ? { _attachments: attachments } : {}) });
  const storedMarkdown = async (id: string): Promise<string> => {
    const row = await getDatabase().get<{ description: string | null }>('SELECT description FROM tasks WHERE id = ?', [id]);
    return tiptapDocToMarkdown(row?.description);
  };
  const storedRaw = async (id: string): Promise<string> =>
    (await getDatabase().get<{ description: string | null }>('SELECT description FROM tasks WHERE id = ?', [id]))?.description ?? '';

  const runTaskChat = async (task: TaskRow, message: string, turns: ScriptedTurn[]) => {
    const ctx: AgentContext = {
      ...buildContext({ focusedTask: task }),
      originalUserMessage: message,
      latestUserMessage: message,
    };
    const scripted = scriptedClient(turns);
    __setOpenAIClientForTesting(scripted.client);
    let text = '';
    const result = await runAgent(
      WEB,
      ctx,
      buildTaskFocusedPrompt(task, ctx, WEB),
      [{ role: 'user', content: message }],
      { onText: (chunk) => { text += chunk; } },
    );
    return { result, streamed: text, requests: scripted.requests };
  };

  // ── The guard itself ───────────────────────────────────────────────────────
  await testCase('guard: um rewrite que apaga o contexto devolve as linhas para Histórico', async () => {
    const kept = keepDescriptionHistory(docOf(BEFORE_MD), docOf(REWRITE_MD));
    const md = tiptapDocToMarkdown(kept.value);
    check(kept.preserved.length === 4, 'the 4 older fact lines were put back', kept.preserved);
    check(md.includes('## Histórico'), 'a Histórico section exists', md);
    for (const line of ['código de erro OE', 'comprada em 03/2024', 'Em 12/10/2026', 'R$ 480']) {
      check(md.includes(line), `still there: ${line}`, md);
    }
    check(md.indexOf('## Histórico') < md.indexOf('## Próximos passos'), 'Histórico comes before Próximos passos', md);
    check(md.includes('RNN26119019063') && md.includes('Você está aguardando'), "the model's new text is kept too", md);
    check(!md.includes('Separar a nota fiscal'), 'pending steps are free to change', md);
  });

  await testCase('guard: atualização que copia tudo não cria Histórico', async () => {
    const kept = keepDescriptionHistory(docOf(BEFORE_MD), docOf(ADDITIVE_MD));
    check(kept.preserved.length === 0, 'nothing to put back', kept.preserved);
    check(kept.value === docOf(ADDITIVE_MD), 'stored exactly as sent');
  });

  await testCase('guard: reescrita leve passa; número ou código que some não passa', async () => {
    const before = docOf('## Contexto\nVocê pediu um orçamento por telefone em 05/11/2026 e a visita custa R$ 480.\nOrdem de serviço: RNN26119019063.');
    const reworded = docOf('## Contexto\nEm 05/11/2026 você pediu orçamento por telefone; a visita custa R$ 480.\nOrdem de serviço: RNN26119019063.');
    check(keepDescriptionHistory(before, reworded).preserved.length === 0, 'same facts in other words: kept', keepDescriptionHistory(before, reworded).preserved);

    const lostNumber = docOf('## Contexto\nVocê pediu um orçamento por telefone em 05/11/2026 e a visita custa R$ 480.\nOrdem de serviço aberta.');
    const kept = keepDescriptionHistory(before, lostNumber);
    check(kept.preserved.length === 1 && kept.preserved[0].includes('RNN26119019063'), 'the line whose code vanished is put back', kept.preserved);

    const split = docOf('## Contexto\n- Você pediu um orçamento por telefone em 05/11/2026.\n- A visita custa R$ 480.\n- Ordem de serviço: RNN26119019063.');
    check(keepDescriptionHistory(before, split).preserved.length === 0, 'a line split in two: kept', keepDescriptionHistory(before, split).preserved);
  });

  await testCase('guard: Histórico que já existe recebe as linhas; anexos e texto legado', async () => {
    const before = docOf('## Contexto\nO portão da garagem trava ao fechar desde 02/09/2026.\n\n## Histórico\n- Em 10/09/2026 o técnico trocou a placa.', [{ name: 'foto', previewData: IMAGE_DATA_URL }]);
    const next = docOf('## Contexto\nO portão voltou a funcionar.\n\n## Histórico\n- Em 10/09/2026 o técnico trocou a placa.\n\n## Próximos passos\n- [ ] Pagar o técnico.', [{ name: 'foto', previewData: IMAGE_DATA_URL }]);
    const kept = keepDescriptionHistory(before, next);
    const md = tiptapDocToMarkdown(kept.value);
    check((md.match(/## Histórico/g) ?? []).length === 1, 'one Histórico section, not two', md);
    check(/## Histórico\n\n- Em 10\/09\/2026 o técnico trocou a placa\.\n- O portão da garagem trava ao fechar desde 02\/09\/2026\./.test(md), 'the dropped line joined the existing list', md);
    check(JSON.parse(kept.value)._attachments?.[0]?.previewData === IMAGE_DATA_URL, 'attachments untouched');

    const legacy = keepDescriptionHistory('Comprar na loja da Rua Augusta, 1200. Falar com a Marta.', docOf('## Contexto\nComprar tinta branca.'));
    check(legacy.preserved.length === 1 && tiptapDocToMarkdown(legacy.value).includes('Rua Augusta, 1200'), 'a legacy plain-text description is protected too', legacy);
  });

  await testCase('remoção: só com o pedido do usuário', async () => {
    check(isRemovalRequested(true, 'apaga a parte do orçamento da descrição'), 'flag + "apaga": allowed');
    check(isRemovalRequested(true, 'Reescreve a descrição mais curta'), 'flag + "reescreve": allowed');
    check(!isRemovalRequested(true, 'falei com a LG hoje e eles vão me ligar'), 'flag without the user asking: refused');
    check(!isRemovalRequested(undefined, 'apaga tudo'), 'no flag: refused');
    check(isRemovalRequested(true, undefined), 'flag on a channel without the message: trusted');

    const cleared = mergeAgentDescriptionUpdate(docOf(BEFORE_MD), null, 'America/Sao_Paulo');
    check(cleared.skip && cleared.held === 'history', 'clearing a description with history is refused', cleared);
    const allowed = mergeAgentDescriptionUpdate(docOf(BEFORE_MD), null, 'America/Sao_Paulo', { allowRemoval: true });
    check(!allowed.skip && allowed.value === null, 'cleared when the user asked', allowed);
    const rewrite = mergeAgentDescriptionUpdate(docOf(BEFORE_MD), REWRITE_MD, 'America/Sao_Paulo', { allowRemoval: true });
    check(!tiptapDocToMarkdown(rewrite.value).includes('Histórico'), 'a requested rewrite is stored as sent', rewrite.value);
  });

  // ── Through the agent, as in the task chat ─────────────────────────────────
  await testCase('chat da tarefa: o contexto anterior fica e a IA nunca recebe a imagem como texto', async () => {
    const task = makeTask({
      title: 'Ver conserto máquina LG lava e seca',
      description: docOf(BEFORE_MD, [{ name: 'image', ext: '.png', mimeType: 'image/png', previewData: IMAGE_DATA_URL }]),
    });
    await seedTasksForEval([task]);

    const { result, streamed, requests } = await runTaskChat(
      task,
      'EU entrei em contato hoje com a LG assitencia tecnica e eles me dissearm q em 2 dias uteis uma autoraizada vai entrar em contato cmg pra uma visita',
      [
        { toolCall: { name: 'update_task', args: { task_id: task.id, description: REWRITE_MD } } },
        { text: 'Quer que eu te lembre em 2 dias úteis?' },
      ],
    );

    const md = await storedMarkdown(task.id);
    for (const line of ['código de erro OE', 'comprada em 03/2024', 'Em 12/10/2026', 'R$ 480']) {
      check(md.includes(line), `stored description still has: ${line}`, md);
    }
    check(md.includes('## Histórico') && md.includes('RNN26119019063'), 'old lines under Histórico, new text kept', md);
    check(JSON.parse(await storedRaw(task.id))._attachments?.length === 1, 'the attached image is still on the task');

    check(requests.length === 2, 'two model calls', requests.length);
    check(requests[0].includes('## Contexto') && requests[0].includes('- Em 12/10/2026'), 'the prompt shows the description as Markdown', requests[0].slice(0, 400));
    check(!requests[1].includes(';base64,'), 'no file in what the model is sent after the write');
    check(requests[1].length < 60_000, 'the follow-up request stays small', requests[1].length);
    check(requests[1].includes('Histórico') && requests[1].includes('mantidas em'), 'the model is told what was kept, and sees the stored text');

    const op = result.operations[0];
    check(op?.success && op.notes?.some((n) => n.includes('Histórico')), 'the operation records that lines were kept', op?.notes);
    check(streamed.startsWith('Pronto, atualizei a tarefa.'), 'the user sees the usual confirmation', streamed);
  });

  await testCase('chat da tarefa: falha na chamada depois de salvar não vira erro', async () => {
    const task = makeTask({ title: 'Trocar pneu do carro', description: docOf('## Contexto\nO pneu dianteiro direito furou em 14/11/2026.') });
    await seedTasksForEval([task]);
    const tooLarge = { status: 400, message: '400 Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 366499 tokens. Please reduce the length of the messages.' };
    check(isContextTooLargeError(tooLarge), 'the provider error is recognized');

    const { result, streamed } = await runTaskChat(task, 'levei na borracharia hoje, fica pronto amanhã', [
      {
        toolCall: {
          name: 'update_task',
          args: {
            task_id: task.id,
            description: '## Contexto\nO pneu dianteiro direito furou em 14/11/2026.\n\n## Atualizações\n- Em 19/11/2026, você levou o carro na borracharia.',
          },
        },
      },
      { error: tooLarge },
    ]);
    check(result.operations[0]?.success === true, 'the write happened', result.operations);
    check(streamed.trim() === 'Pronto, atualizei a tarefa.' && result.text.trim() === 'Pronto, atualizei a tarefa.', 'the turn ends on the confirmation', { streamed, text: result.text });
    check((await storedMarkdown(task.id)).includes('borracharia'), 'the update is stored');

    // With nothing written, the failure is still a failure.
    let thrown: unknown;
    try {
      await runTaskChat(task, 'oi', [{ error: tooLarge }]);
    } catch (err) {
      thrown = err;
    }
    check(thrown !== undefined, 'a failure with nothing saved still surfaces');
  });

  await testCase('chat da tarefa: o usuário pediu para apagar', async () => {
    const task = makeTask({ title: 'Reforma da cozinha', description: docOf(BEFORE_MD) });
    await seedTasksForEval([task]);
    const shorter = '## Contexto\nSua máquina LG lava e seca mostra o código de erro OE no display.';

    await runTaskChat(task, 'falei com eles de novo', [
      { toolCall: { name: 'update_task', args: { task_id: task.id, description: shorter, user_asked_to_remove: true } } },
      { text: '' },
    ]);
    check((await storedMarkdown(task.id)).includes('R$ 480'), 'flag alone, user did not ask: nothing lost', await storedMarkdown(task.id));

    await seedTasksForEval([task]);
    await runTaskChat(task, 'apaga as atualizações antigas, deixa só o contexto', [
      { toolCall: { name: 'update_task', args: { task_id: task.id, description: shorter, user_asked_to_remove: true } } },
      { text: '' },
    ]);
    const md = await storedMarkdown(task.id);
    check(!md.includes('R$ 480') && !md.includes('Histórico'), 'user asked: stored as sent', md);
  });

  await testCase('resultado para o modelo: descrição vira texto, nada de arquivo nem string sem limite', async () => {
    const raw = docOf(BEFORE_MD, [{ name: 'image', mimeType: 'image/png', previewData: IMAGE_DATA_URL }]);
    const visible = toModelVisible({ id: 't1', description: raw, tasks: [{ id: 't2', description: raw }], blob: `x ${IMAGE_DATA_URL} y`, long: 'a'.repeat(50_000) });
    check(visible.description.startsWith('## Contexto') && !visible.description.includes('base64'), 'description is its Markdown', visible.description.slice(0, 80));
    check(visible.tasks[0].description.startsWith('## Contexto'), 'nested descriptions too');
    check(visible.blob === 'x [arquivo] y', 'a data URL anywhere is dropped', visible.blob.slice(0, 40));
    check(visible.long.length === 12_000, 'long strings are bounded', visible.long.length);
    check(JSON.stringify(visible).length < 30_000, 'the whole result is small', JSON.stringify(visible).length);
  });

  console.log(`\n${passed} assertions passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
