/**
 * Deterministic eval — entrega 1 (execução e confirmações confiáveis).
 *
 * Drives `runAgent` with a SCRIPTED model (no network, no cost) so the
 * backend rules can be asserted exactly: what got persisted, what the user
 * saw, in which order, and what the model was told. The LLM-based suite
 * (`npm run eval`) still measures the model; this one measures the backend.
 *
 * Run:
 *   npm run eval:deterministic     (from packages/backend)
 *
 * Exits 1 on the first failing assertion group so CI can gate on it.
 */

import 'dotenv/config';

import type OpenAI from 'openai';
import { addDays, buildContext, makeTask, nextWeekday, setupEvalDatabase, seedTasksForEval, todayIso, WEEKDAY } from './helpers';
import type { AgentCallbacks, AgentContext, ChannelProfile, TaskRow } from '../src/services/agent/core/types';

// ---------------------------------------------------------------------------
// Scripted OpenAI client
// ---------------------------------------------------------------------------

interface ScriptedToolCall {
  name: string;
  args: Record<string, unknown> | string;
}

interface ScriptedTurn {
  text?: string;
  toolCalls?: ScriptedToolCall[];
}

function toolCallsPayload(calls: ScriptedToolCall[] | undefined) {
  return (calls ?? []).map((tc, i) => ({
    id: `call_${i}`,
    type: 'function' as const,
    function: {
      name: tc.name,
      arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args),
    },
  }));
}

/** Non-streaming responses, one per model call, in order. */
function scriptedSingleClient(turns: ScriptedTurn[]): { client: OpenAI; calls: () => number } {
  let call = 0;
  const client = {
    chat: {
      completions: {
        create: async () => {
          const turn = turns[call] ?? { text: '' };
          call++;
          const tool_calls = toolCallsPayload(turn.toolCalls);
          return {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: turn.text ?? null,
                  tool_calls: tool_calls.length ? tool_calls : undefined,
                },
                finish_reason: tool_calls.length ? 'tool_calls' : 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          };
        },
      },
    },
  };
  return { client: client as unknown as OpenAI, calls: () => call };
}

/** Streaming responses: text is split into word-sized deltas. */
function scriptedStreamClient(turns: ScriptedTurn[]): { client: OpenAI; calls: () => number } {
  let call = 0;
  const client = {
    chat: {
      completions: {
        create: async () => {
          const turn = turns[call] ?? { text: '' };
          call++;
          const tool_calls = toolCallsPayload(turn.toolCalls);
          const deltas = (turn.text ?? '').split(/(?<=\s)/);
          async function* iterate() {
            for (const d of deltas) {
              if (d) yield { choices: [{ delta: { content: d } }] };
            }
            if (tool_calls.length) {
              yield {
                choices: [
                  {
                    delta: {
                      tool_calls: tool_calls.map((tc, index) => ({
                        index,
                        id: tc.id,
                        function: { name: tc.function.name, arguments: tc.function.arguments },
                      })),
                    },
                  },
                ],
              };
            }
            yield {
              choices: [{ delta: {}, finish_reason: tool_calls.length ? 'tool_calls' : 'stop' }],
            };
            yield { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } };
          }
          return iterate();
        },
      },
    },
  };
  return { client: client as unknown as OpenAI, calls: () => call };
}

// ---------------------------------------------------------------------------
// Profiles (mirror production; transport per test)
// ---------------------------------------------------------------------------

const WHATSAPP: ChannelProfile = {
  id: 'whatsapp',
  taskCreationTarget: 'tasks',
  toolsAvailable: ['create_task', 'update_task', 'complete_task', 'delete_task', 'search_tasks', 'update_memory'],
  outputFormat: 'plain',
  transport: 'single',
  enableBriefing: true,
  enableMemoryReconciliation: false,
  enableDedup: true,
  enableAntiHallucinationRetry: true,
  supportsTaskMode: false,
  reliableExecution: true,
};

const WEB: ChannelProfile = {
  id: 'web',
  taskCreationTarget: 'tasks',
  toolsAvailable: [
    'create_task', 'update_task', 'complete_task', 'delete_task', 'search_tasks', 'update_memory',
    'create_list', 'update_list', 'delete_list', 'show_list',
    'create_category', 'update_category', 'delete_category', 'show_category', 'scan_gmail',
  ],
  outputFormat: 'markdown',
  transport: 'stream',
  enableBriefing: false,
  enableMemoryReconciliation: true,
  enableDedup: true,
  enableAntiHallucinationRetry: true,
  supportsTaskMode: true,
  reliableExecution: true,
};

// ---------------------------------------------------------------------------
// Tiny assertion harness
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

async function readTask(id: string): Promise<Record<string, unknown> | undefined> {
  const { getDatabase } = await import('../src/database');
  return getDatabase().get('SELECT * FROM tasks WHERE id = ?', [id]);
}

async function countTasks(): Promise<number> {
  const { getDatabase } = await import('../src/database');
  const row = await getDatabase().get<{ n: number }>('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?', ['eval-user']);
  return row?.n ?? 0;
}

type SseLike =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolName: string }
  | { type: 'tool_result'; toolName: string; success: boolean }
  | { type: 'separator' };

function recordingCallbacks(events: SseLike[]): AgentCallbacks {
  return {
    onText: (content) => events.push({ type: 'text', content }),
    onToolCall: (toolName) => events.push({ type: 'tool_call', toolName }),
    onToolResult: (toolName, success) => events.push({ type: 'tool_result', toolName, success }),
    onSeparator: () => events.push({ type: 'separator' }),
  };
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await setupEvalDatabase();
  const { runAgent, __setOpenAIClientForTesting } = await import('../src/services/agent/core/runAgent');
  const { buildSystemPrompt, buildTaskFocusedPrompt } = await import('../src/services/agent/core/prompt');
  const { buildConfirmation, filterModelText } = await import('../src/services/agent/core/confirmations');
  const { validateToolArguments } = await import('../src/services/agent/core/toolValidation');
  const { getToolDefinition } = await import('../src/services/agent/core/tools');
  const { reconcileDueDate, detectDateExpressions } = await import('../src/services/agent/core/dateExpressions');

  const TODAY = todayIso();
  const TOMORROW = addDays(TODAY, 1);
  const NEXT_FRIDAY = nextWeekday(TODAY, WEEKDAY.sexta);

  const run = async (
    profile: ChannelProfile,
    ctx: AgentContext,
    turns: ScriptedTurn[],
    events: SseLike[] = [],
  ) => {
    const scripted = profile.transport === 'stream' ? scriptedStreamClient(turns) : scriptedSingleClient(turns);
    __setOpenAIClientForTesting(scripted.client);
    const systemPrompt =
      ctx.mode === 'task' && ctx.focusedTask
        ? buildTaskFocusedPrompt(ctx.focusedTask, ctx, profile)
        : buildSystemPrompt(ctx, profile);
    const result = await runAgent(
      profile,
      ctx,
      systemPrompt,
      [{ role: 'user', content: ctx.originalUserMessage ?? '' }],
      recordingCallbacks(events),
    );
    return { ...result, modelCalls: scripted.calls() };
  };

  const ctxFor = (message: string, tasks: TaskRow[] = [], extra: Partial<AgentContext> = {}): AgentContext => {
    const ctx = buildContext({ activeTasks: tasks });
    ctx.originalUserMessage = message;
    return { ...ctx, ...extra };
  };

  // ── 1. "semana que vem" nunca vira due_date; o backend pergunta o dia ──────
  await testCase('whatsapp/semana-que-vem: prazo retido + pergunta do sistema', async () => {
    const ctx = ctxFor('reunião board semana que vem 14h');
    const r = await run(WHATSAPP, ctx, [
      {
        toolCalls: [
          { name: 'create_task', args: { title: 'Reunião board', due_date: addDays(TODAY, 7), time: '14:00' } },
        ],
      },
      { text: 'Salvo! Tarefa *Reunião board* criada! 🗓️\nSegunda-feira às 14h00\nQuer que eu te lembre antes?' },
    ]);
    const op = r.operations.find((o) => o.tool === 'create_task');
    check(op?.success === true, 'create_task ran and succeeded', op);
    const row = op?.entity?.id ? await readTask(op.entity.id) : undefined;
    check(row && row.due_date === null, 'due_date was NOT persisted', row);
    check(row && row.time === '14:00', 'time was persisted', row);
    check(r.text.includes('Salvo! Tarefa *Reunião board* criada! 🗓️'), 'backend confirmation present', r.text);
    check(r.text.includes('Qual dia da semana que vem?'), 'backend asked which day', r.text);
    check(!/segunda-feira/i.test(r.text), "model's invented date line stripped", r.text);
    check(!r.text.includes('Quer que eu te lembre'), "model's question dropped (backend already asked)", r.text);
    check(r.reliability.pendingQuestions === 1, 'pendingQuestions === 1', r.reliability);
    check(r.reliability.claimsStripped >= 2, 'claims stripped counted', r.reliability);
    check(r.modelCalls === 2, 'no retry/extra model calls', r.modelCalls);
    check(op?.pendingQuestion?.reason === 'period_needs_day', 'op carries the pending question', op?.pendingQuestion);
  });

  // ── 2. Lote parcial: uma conclui, outra não existe ─────────────────────────
  await testCase('whatsapp/lote-parcial: sucesso e falha explícitos', async () => {
    const existing = makeTask({ title: 'Pagar conta de luz', due_date: TODAY });
    await seedTasksForEval([existing]);
    const ghost = makeTask({ title: 'Renovar seguro' }); // shown in context, absent from DB
    const ctx = ctxFor('conclui a conta de luz e o seguro', [existing, ghost]);
    const r = await run(WHATSAPP, ctx, [
      {
        toolCalls: [
          { name: 'complete_task', args: { task_id: existing.id } },
          { name: 'complete_task', args: { task_id: ghost.id } },
        ],
      },
      { text: 'Concluí as duas tarefas! Bom trabalho.' },
    ]);
    const [ok, missing] = r.operations;
    check(ok?.success === true && missing?.success === false, 'one success, one failure', r.operations);
    check(missing?.error?.code === 'not_found', 'failure code is not_found', missing?.error);
    check(r.text.includes('Pagar conta de luz concluída.'), 'success line names the task', r.text);
    check(r.text.includes('Não encontrei a tarefa para concluir.'), 'failure line explicit', r.text);
    check(!/Concluí as duas/i.test(r.text), 'false batch claim stripped', r.text);
    const row = await readTask(existing.id);
    check(Number(row?.completed) === 1, 'existing task really completed', row);
  });

  // ── 3. Afirmação sem ação: nenhuma re-escrita, fallback honesto ───────────
  await testCase('whatsapp/claim-sem-tool: fallback honesto, sem retry', async () => {
    const task = makeTask({ title: 'Dentista', due_date: TODAY });
    await seedTasksForEval([task]);
    const before = await readTask(task.id);
    const ctx = ctxFor('joga o dentista pra amanhã', [task]);
    const r = await run(WHATSAPP, ctx, [{ text: 'Pronto! Reagendei o dentista para amanhã.' }]);
    check(r.operations.length === 0, 'no tool ran', r.operations);
    check(r.text === 'Ainda não alterei nada. Quer que eu faça isso agora?', 'honest fallback text', r.text);
    check(r.modelCalls === 1, 'no forced-tool retry inside runAgent', r.modelCalls);
    const after = await readTask(task.id);
    check(after?.due_date === before?.due_date, 'task untouched', { before, after });
  });

  // ── 4. update: "" não limpa (mantém), null limpa ───────────────────────────
  await testCase('web/update: string vazia mantém, null limpa', async () => {
    const task = makeTask({ title: 'Revisar contrato', due_date: TOMORROW, priority: 'low' });
    await seedTasksForEval([task]);

    // 4a — "" on due_date must be ignored; priority still written.
    let ctx = ctxFor('deixa o contrato como prioridade alta', [task]);
    let events: SseLike[] = [];
    let r = await run(WEB, ctx, [
      { toolCalls: [{ name: 'update_task', args: { task_id: task.id, due_date: '', priority: 'high' } }] },
      { text: 'Atualizei a tarefa e removi a data.' },
    ], events);
    let row = await readTask(task.id);
    check(row?.due_date === TOMORROW, 'due_date kept when model sent ""', row);
    check(row?.priority === 'high', 'priority written', row);
    let op = r.operations[0];
    check(op?.persisted && !('due_date' in op.persisted) && op.persisted.priority === 'high', 'persisted reflects only real changes', op?.persisted);
    check(r.text.startsWith('Pronto, atualizei a tarefa.'), 'web confirmation short', r.text);
    check(!/removi a data/i.test(r.text), 'false "removi a data" stripped', r.text);
    check(op?.notes?.some((n) => n.includes('"due_date" ignorado')), 'model told the field was ignored', op?.notes);

    // 4b — explicit null clears.
    ctx = ctxFor('tira a data do contrato', [task]);
    events = [];
    r = await run(WEB, ctx, [
      { toolCalls: [{ name: 'update_task', args: { task_id: task.id, due_date: null } }] },
      { text: 'Pronto!' },
    ], events);
    row = await readTask(task.id);
    check(row?.due_date === null, 'due_date cleared with explicit null', row);
    op = r.operations[0];
    check(op?.persisted?.due_date === null, 'persisted records the clear', op?.persisted);
    const plain = buildConfirmation(r.operations, { outputFormat: 'plain' });
    check(plain?.includes('prazo removido'), 'plain-surface confirmation says "prazo removido"', plain);
    check(r.text === 'Pronto, atualizei a tarefa.', 'web text is just the confirmation', r.text);
  });

  // ── 5. Argumentos inválidos: nada é escrito, falha explícita ──────────────
  await testCase('whatsapp/args-inválidos: due_date fora do formato', async () => {
    const before = await countTasks();
    const ctx = ctxFor('comprar pão amanhã');
    const r = await run(WHATSAPP, ctx, [
      { toolCalls: [{ name: 'create_task', args: { title: 'Comprar pão', due_date: 'amanhã' } }] },
      { text: 'Salvo! Tarefa *Comprar pão* criada! 🗓️' },
    ]);
    check((await countTasks()) === before, 'no task created', { before });
    const op = r.operations[0];
    check(op?.success === false && op.error?.code === 'invalid_arguments', 'op failed with invalid_arguments', op);
    check(r.reliability.invalidToolCalls === 1, 'invalidToolCalls === 1', r.reliability);
    check(r.text.includes('Não consegui criar a tarefa: dados inválidos em prazo.'), 'user told which field', r.text);
    check(!r.text.includes('criada! 🗓️'), 'false creation claim stripped', r.text);
  });

  // ── 6. Data corrigida quando a mensagem tem UMA expressão inequívoca ──────
  await testCase('whatsapp/data-corrigida: "sexta" vs. proposta do modelo', async () => {
    const wrong = addDays(NEXT_FRIDAY, 3); // a Monday — neither Friday nor its eve
    const ctx = ctxFor('consulta com o cardiologista sexta 16h');
    const r = await run(WHATSAPP, ctx, [
      { toolCalls: [{ name: 'create_task', args: { title: 'Consulta cardiologista', due_date: wrong, time: '16:00' } }] },
      { text: 'Salvo! Tarefa *Consulta cardiologista* criada! 🗓️' },
    ]);
    const op = r.operations[0];
    const row = op?.entity?.id ? await readTask(op.entity.id) : undefined;
    check(row?.due_date === NEXT_FRIDAY, 'due_date snapped to the Friday the user said', { row, NEXT_FRIDAY, wrong });
    check(r.reliability.dateCorrections === 1, 'dateCorrections === 1', r.reliability);
    check(op?.notes?.some((n) => n.startsWith('due_date corrigido')), 'model told about the correction', op?.notes);
    check(typeof op?.persisted?.due_label === 'string' && r.text.includes(String(op?.persisted?.due_label)), 'confirmation echoes the persisted label', { text: r.text, label: op?.persisted?.due_label });
  });

  // ── 7. Stream: confirmação sai DEPOIS do resultado e antes do texto do modelo
  await testCase('web/stream: ordem dos eventos e sem texto do modelo antes do resultado', async () => {
    const ctx = ctxFor('cria uma tarefa pra pagar o IPTU');
    const events: SseLike[] = [];
    const r = await run(WEB, ctx, [
      { text: 'Vou criar isso pra você. Feito! Criei a tarefa Pagar IPTU.', toolCalls: [{ name: 'create_task', args: { title: 'Pagar IPTU' } }] },
      { text: 'Feito! Criei a tarefa. Quer definir uma data pra isso?' },
    ], events);
    // Design decision: non-claim preamble ("Vou criar isso pra você.") still
    // streams before the tool runs — holding ALL text until the end of every
    // iteration would kill token streaming for plain answers too. What must
    // never precede the result is a CLAIM; those are gated sentence by sentence.
    const toolResult = events.findIndex((e) => e.type === 'tool_result');
    const separator = events.findIndex((e) => e.type === 'separator');
    const textsBefore = events
      .slice(0, toolResult)
      .filter((e): e is { type: 'text'; content: string } => e.type === 'text')
      .map((e) => e.content)
      .join('');
    check(toolResult !== -1 && !/feito|criei/i.test(textsBefore), 'no claim reached the user before the tool result', events);
    // Web: the tool_result card IS the confirmation of a successful create —
    // the backend adds no text of its own ("humano primeiro"); only the
    // model's non-claim sentences follow the separator.
    check(separator !== -1 && separator > toolResult, 'separator follows the tool result', events);
    const texts = events.filter((e): e is { type: 'text'; content: string } => e.type === 'text').map((e) => e.content);
    check(!texts.some((t) => /feito|criei/i.test(t)), "neither the model's nor a backend confirmation reached the user", texts);
    check(texts.some((t) => t.includes('Quer definir uma data pra isso?')), 'model question kept', texts);
    check(r.text === 'Quer definir uma data pra isso?', 'composed final text is the human part only', r.text);
    check(r.operations.length === 1 && r.operations[0].success && r.reliability.claimsStripped >= 2, 'write recorded, claims counted', r);
    check(typeof r.reliability.timeToFirstTextMs === 'number', 'timeToFirstText measured', r.reliability);
  });

  // ── 7b. Web: edições e falhas continuam confirmadas pelo sistema ──────────
  await testCase('web/update: confirmação do sistema, sem eco do modelo', async () => {
    const task = makeTask({ title: 'Dentista', due_date: TOMORROW, priority: 'low' });
    await seedTasksForEval([task]);
    const ctx = ctxFor('muda a prioridade do dentista pra alta', [task]);
    const r = await run(WEB, ctx, [
      { toolCalls: [{ name: 'update_task', args: { task_id: task.id, priority: 'high' } }] },
      { text: 'Pronto! Alterei a prioridade para alta. Quer um lembrete?' },
    ]);
    check(r.text.startsWith('Pronto, atualizei a tarefa.'), 'backend confirmation first', r.text);
    check(!/Alterei|para alta/.test(r.text) && /Quer um lembrete\?/.test(r.text), 'model restatement dropped, question kept', r.text);
    const missing = await run(WEB, ctxFor('conclui a tarefa fantasma', [task]), [
      { toolCalls: [{ name: 'complete_task', args: { task_id: 'nope-123' } }] },
      { text: 'Feito! Tarefa concluída.' },
    ]);
    check(missing.text === 'Não encontrei a tarefa para concluir.', 'not_found surfaced, false claim dropped', missing.text);
  });

  // ── 8. Modo tarefa (web): a mesma regra de "semana que vem" vale ──────────
  await testCase('web/task-mode: "semana que vem" também é retido no chat da tarefa', async () => {
    const task = makeTask({ title: 'Trocar pneus', due_date: TODAY });
    await seedTasksForEval([task]);
    const ctx = ctxFor('vou resolver isso semana que vem', [], { mode: 'task', focusedTask: task });
    const r = await run(WEB, ctx, [
      { toolCalls: [{ name: 'update_task', args: { task_id: task.id, due_date: addDays(TODAY, 7), description: 'Você vai resolver na semana seguinte.' } }] },
      { text: 'Pronto, atualizei a tarefa. Qual dia você prefere?' },
    ]);
    const row = await readTask(task.id);
    check(row?.due_date === TODAY, 'previous due_date kept', row);
    check(typeof row?.description === 'string' && row.description.includes('resolver'), 'description still written', row);
    check(r.text.includes('Qual dia da semana que vem?'), 'backend question emitted', r.text);
    check(!r.text.includes('Qual dia você prefere?'), 'duplicate model question dropped', r.text);
  });

  // ── 9. Flag desligada: comportamento legado intacto ───────────────────────
  await testCase('legacy/flag-off: texto do modelo cru, prazo do modelo persistido', async () => {
    const ctx = ctxFor('almoço com investidores semana que vem 12h');
    const legacy: ChannelProfile = { ...WHATSAPP, reliableExecution: false };
    const r = await run(legacy, ctx, [
      { toolCalls: [{ name: 'create_task', args: { title: 'Almoço com investidores', due_date: addDays(TODAY, 7), time: '12:00' } }] },
      { text: 'Salvo! Tarefa *Almoço com investidores* criada! 🗓️' },
    ]);
    check(r.text === 'Salvo! Tarefa *Almoço com investidores* criada! 🗓️', 'raw model text returned', r.text);
    const op = r.operations[0];
    const row = op?.entity?.id ? await readTask(op.entity.id) : undefined;
    check(row?.due_date === addDays(TODAY, 7), 'legacy persists the model due_date', row);
    check(r.reliability.enabled === false && r.reliability.claimsStripped === 0, 'reliability off', r.reliability);
    check(r.operations.length === 1, 'operations still recorded for telemetry', r.operations.length);
  });

  // ── 10. Unidades puras ────────────────────────────────────────────────────
  await testCase('unit/toolValidation + dateExpressions + gate', async () => {
    const def = getToolDefinition('update_task', WEB);
    const v = validateToolArguments(def, { task_id: 'x', due_date: '2026-13-40', priority: 'urgent', bogus: 1 });
    check(v.ok === false, 'rejects bad pattern and enum', v);
    check(v.issues.some((i) => i.path === 'due_date') && v.issues.some((i) => i.path === 'priority'), 'both fields reported', v.issues);
    check(v.ignored.includes('bogus'), 'unknown key ignored, not fatal', v.ignored);

    const ok = validateToolArguments(def, { task_id: 'x', due_date: null, recurrence_type: 'none', time: '9:30' });
    check(ok.ok === true && ok.args.due_date === null && ok.args.recurrence_type === 'none', 'null clears; "none" is a valid enum', ok);

    check(detectDateExpressions('antes da semana que vem', 'America/Sao_Paulo').length === 0, '"antes da semana que vem" is not a period', undefined);
    check(detectDateExpressions('falei com ele sexta passada', 'America/Sao_Paulo').length === 0, '"sexta passada" is narrative', undefined);
    const d1 = reconcileDueDate(addDays(TODAY, 7), 'reunião semana que vem', 'America/Sao_Paulo');
    check(d1.action === 'hold' && Boolean(d1.pendingQuestion), 'period → hold + question', d1);
    // Same periods the web prompt lists ("PERÍODO NÃO É PRAZO").
    const p1 = reconcileDueDate(addDays(TODAY, 2), 'levar o carro pra revisão essa semana', 'America/Sao_Paulo');
    check(p1.action === 'hold' && p1.pendingQuestion?.text === 'Qual dia dessa semana?', '"essa semana" is a period', p1);
    const p2 = reconcileDueDate(addDays(TODAY, 20), 'pagar o IPTU até o fim do mês', 'America/Sao_Paulo');
    check(p2.action === 'hold' && p2.pendingQuestion?.text === 'Qual dia do mês?', '"até o fim do mês" is a period', p2);
    const p3 = reconcileDueDate(addDays(TODAY, 3), 'resolver isso nos próximos dias', 'America/Sao_Paulo');
    check(p3.action === 'hold' && Boolean(p3.pendingQuestion), '"nos próximos dias" is a period', p3);
    const p4 = reconcileDueDate(undefined, 'sexta dessa semana tem dentista', 'America/Sao_Paulo');
    check(p4.action === 'keep_model_value' && !p4.pendingQuestion, 'weekday next to the period makes it concrete', p4);
    check(detectDateExpressions('essa semana foi puxada, falei com ele sexta passada', 'America/Sao_Paulo').every((e) => e.kind === 'period_this_week'), 'narrative "sexta passada" still ignored', undefined);
    const d2 = reconcileDueDate(TODAY, 'consulta amanhã', 'America/Sao_Paulo');
    check(d2.action === 'keep_model_value', 'eve of tomorrow is allowed (due = when it must be done)', d2);
    const d3 = reconcileDueDate(addDays(TODAY, 5), 'hoje falei com o João e amanhã ele responde, cobro sexta', 'America/Sao_Paulo');
    check(d3.action === 'keep_model_value', 'multi-clause message left to the model', d3);
    const d4 = reconcileDueDate(TOMORROW, 'entregar dia 24', 'America/Sao_Paulo');
    check(d4.action === 'keep_model_value' || d4.action === 'correct', 'explicit day handled deterministically', d4);

    const gate = filterModelText(
      'Pronto! Criei a tarefa. Não consegui achar a outra, qual você quis dizer? Quer que eu adicione um prazo?',
      { hasWrites: () => true, hasPendingQuestions: () => false, persistedEchoes: () => [] },
    );
    check(!/Criei a tarefa/.test(gate.text) && !/^Pronto/.test(gate.text), 'claims and bare acks dropped', gate);
    check(/Não consegui achar a outra/.test(gate.text) && /Quer que eu adicione um prazo\?/.test(gate.text), 'negations and questions kept', gate);
    const passive = filterModelText(
      'A conta de luz foi concluída. O seguro do carro não foi encontrado como tarefa ativa. Se quiser, eu procuro nas concluídas.',
      { hasWrites: () => true, hasPendingQuestions: () => false, persistedEchoes: () => [] },
    );
    check(!/foi concluída/.test(passive.text), 'passive restatement of a write dropped', passive);
    check(/não foi encontrado/.test(passive.text) && /Se quiser/.test(passive.text), 'negated sentence and offer kept', passive);
  });

  __setOpenAIClientForTesting(null);

  console.log(`\n[deterministic] ${passed} assertions passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[deterministic] fatal error:', err);
  process.exit(1);
});
