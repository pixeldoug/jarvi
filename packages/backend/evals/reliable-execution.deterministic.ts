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
    'search_web', 'offer_choices',
  ],
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
  | { type: 'separator' }
  | { type: 'choices'; question: string; choices: string[]; field: string; reason: string; taskId?: string; intro?: string }
  | { type: 'journey_nudge'; text: string; remaining: number; resumeLabel: string };

function recordingCallbacks(events: SseLike[]): AgentCallbacks {
  return {
    onText: (content) => events.push({ type: 'text', content }),
    onToolCall: (toolName) => events.push({ type: 'tool_call', toolName }),
    onToolResult: (toolName, success) => events.push({ type: 'tool_result', toolName, success }),
    onSeparator: () => events.push({ type: 'separator' }),
    // Mirrors the web adapter: the question is structured, not text.
    onQuestion: (q) =>
      events.push({ type: 'choices', question: q.text, choices: q.choices, field: q.field, reason: q.reason, taskId: q.taskId, intro: q.intro }),
    onJourneyNudge: (n) =>
      events.push({ type: 'journey_nudge', text: n.text, remaining: n.remaining, resumeLabel: n.resumeLabel }),
  };
}

const textOf = (events: SseLike[]): string =>
  events.filter((e): e is { type: 'text'; content: string } => e.type === 'text').map((e) => e.content).join('');
const choicesOf = (events: SseLike[]) =>
  events.filter((e): e is Extract<SseLike, { type: 'choices' }> => e.type === 'choices');
const nudgesOf = (events: SseLike[]) =>
  events.filter((e): e is Extract<SseLike, { type: 'journey_nudge' }> => e.type === 'journey_nudge');

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
    // Web: the backend confirms the create with a structured task reference
    // (rendered as the inline mention) right after the separator; the model's
    // own "Feito! Criei…" never reaches the user.
    check(separator !== -1 && separator > toolResult, 'separator follows the tool result', events);
    const taskId = r.operations[0]?.entity?.id;
    const afterSeparator = textOf(events.slice(separator));
    check(
      afterSeparator.startsWith(`Pronto, Doug! Criei {{task:${taskId}|Pagar IPTU}}.`),
      'backend confirmation with task reference comes first after the tool result',
      afterSeparator,
    );
    check(!/Feito!|Criei a tarefa/.test(afterSeparator), "model's own confirmation stripped", afterSeparator);
    // Prazo question is the system's: structured event, not in the text; the
    // model's own date question is dropped as a duplicate.
    const choices = choicesOf(events);
    check(choices.length === 1 && choices[0].reason === 'missing_due_date' && choices[0].taskId === taskId, 'one structured prazo question for the created task', choices);
    check(choices[0]?.question === 'Quando você pretende fazer isso?' && choices[0].choices.join('|') === 'Hoje|Amanhã|Esta semana|Ainda não sei', 'question + quick replies', choices[0]);
    check(!afterSeparator.includes('Quando você pretende'), 'question NOT repeated in the text stream (web)', afterSeparator);
    check(!afterSeparator.includes('Quer definir uma data'), "model's duplicate date question dropped", afterSeparator);
    check(r.reliability.pendingQuestions === 1, 'pendingQuestions === 1', r.reliability);
    check(r.operations.length === 1 && r.operations[0].success && r.reliability.claimsStripped >= 2, 'write recorded, claims counted', r);
    check(typeof r.reliability.timeToFirstTextMs === 'number', 'timeToFirstText measured', r.reliability);
    // Created WITH a prazo → the tríade moves on: the system asks the time, not the day.
    const withDate: SseLike[] = [];
    const rDated = await run(WEB, ctxFor('pagar o IPVA amanhã'), [
      { toolCalls: [{ name: 'create_task', args: { title: 'Pagar IPVA', due_date: TOMORROW } }] },
      { text: 'Boa, já está no radar.' },
    ], withDate);
    check(rDated.operations[0]?.success && !rDated.operations[0].duplicate, 'dated task really created', rDated.operations[0]);
    const datedQ = choicesOf(withDate);
    check(datedQ.length === 1 && datedQ[0].field === 'time', 'no prazo question when the task has a due_date — time is next', withDate);
    // Created with prazo AND time (no WhatsApp) → nothing to ask.
    const withBoth: SseLike[] = [];
    await run(WEB, ctxFor('dentista amanhã 9h'), [
      { toolCalls: [{ name: 'create_task', args: { title: 'Dentista', due_date: TOMORROW, time: '09:00' } }] },
      { text: 'Ok.' },
    ], withBoth);
    check(choicesOf(withBoth).length === 0, 'no question when prazo and horário were both given', withBoth);
  });

  // ── 7c. Política de próxima pergunta: o offer_choices do modelo é recusado ─
  await testCase('web/next-question: offer_choices do modelo recusado com pergunta do sistema pendente', async () => {
    const ctx = ctxFor('preciso marcar dermatologista');
    const events: SseLike[] = [];
    const r = await run(WEB, ctx, [
      { toolCalls: [{ name: 'create_task', args: { title: 'Marcar dermatologista' } }] },
      {
        text: 'Poxa, dermatologista é daquelas coisas que a gente acaba empurrando. Qual dia você quer marcar?',
        toolCalls: [{ name: 'offer_choices', args: { question: 'Qual dia?', choices: ['Hoje', 'Amanhã'] } }],
      },
      { text: 'Vou te ajudar a deixar isso andando.' },
    ], events);
    const offer = r.operations.find((o) => o.tool === 'offer_choices');
    check(offer?.success === false && offer.error?.code === 'question_pending', 'offer_choices refused (question_pending)', offer);
    check(choicesOf(events).length === 1 && choicesOf(events)[0].reason === 'missing_due_date', 'exactly one structured question — the system\'s', choicesOf(events));
    const text = textOf(events);
    check(/daquelas coisas que a gente acaba empurrando/.test(text), 'human sentence kept', text);
    check(!/Qual dia você quer marcar\?/.test(text), "model's date question dropped", text);
    check(/Vou te ajudar a deixar isso andando\./.test(text), 'follow-up after the refusal kept', text);
  });

  // ── 7d. Resposta "essa semana" sem tool call: o sistema continua a pergunta ─
  await testCase('web/next-question: período sem tool → pergunta do sistema com dias concretos', async () => {
    const task = makeTask({ title: 'Marcar dermatologista' });
    await seedTasksForEval([task]);
    const ctx = ctxFor('essa semana', [task]);
    const events: SseLike[] = [];
    const r = await run(WEB, ctx, [{ text: 'Beleza! Qual dia dessa semana fica melhor?' }], events);
    const q = choicesOf(events);
    check(q.length === 1 && q[0].reason === 'period_needs_day' && q[0].question === 'Qual dia dessa semana?', 'system asks which day of the week', q);
    check(q[0]?.choices.length >= 1 && q[0].choices.every((c) => /^(Seg|Ter|Qua|Qui|Sex|Sáb|Dom), \d{1,2}$/.test(c)), 'choices are concrete days', q[0]?.choices);
    check(!textOf(events).includes('Qual dia dessa semana fica melhor?'), "model's re-ask dropped", textOf(events));
    check(r.operations.length === 0, 'no write happened', r.operations);
    check(r.reliability.pendingQuestions === 1, 'pendingQuestions === 1', r.reliability);
    // And when the model does call offer_choices for the same thing, it is refused.
    const events3: SseLike[] = [];
    const r3 = await run(WEB, ctx, [
      { toolCalls: [{ name: 'offer_choices', args: { question: 'Qual dia dessa semana?', choices: ['Terça', 'Quinta'] } }] },
      { text: 'Só me diz o dia.' },
    ], events3);
    check(r3.operations[0]?.error?.code === 'question_pending', 'model offer_choices refused', r3.operations[0]);
    check(choicesOf(events3).length === 1 && choicesOf(events3)[0].reason === 'period_needs_day', 'system question emitted once', choicesOf(events3));
    // A long message that merely mentions "essa semana" is NOT a period reply.
    const events4: SseLike[] = [];
    await run(WEB, ctxFor('essa semana foi puxada, mas quero saber quais tarefas eu tenho abertas', [task]), [{ text: 'Você tem uma tarefa aberta: Marcar dermatologista.' }], events4);
    check(choicesOf(events4).length === 0, 'narrative "essa semana" does not trigger the question', events4);
  });

  // ── 7e. Prazo oficial já passado: due_date retido + pergunta do sistema ────
  await testCase('web/next-question: data passada retida → pergunta do sistema (sem nudge do modelo)', async () => {
    const task = makeTask({ title: 'Emitir IRPF' });
    await seedTasksForEval([task]);
    const ctx = ctxFor('n sei, tá atrasado', [task]);
    const events: SseLike[] = [];
    const r = await run(WEB, ctx, [
      { toolCalls: [{ name: 'update_task', args: { task_id: task.id, due_date: '2020-05-29', priority: 'high', description: 'Prazo oficial era 29/05.' } }] },
      { text: 'O prazo oficial já passou. Se quiser, eu posso te ajudar a organizar.' },
    ], events);
    const row = await readTask(task.id);
    check(row?.due_date === null, 'past due_date not persisted', row);
    check(row?.priority === 'high', 'other fields persisted', row);
    const q = choicesOf(events);
    check(q.length === 1 && q[0].reason === 'past_date_held' && q[0].taskId === task.id, 'system asks when the person will do it', q);
    check(r.operations[0]?.notes?.some((n) => n.includes('O sistema já perguntou')), 'model told the system asked', r.operations[0]?.notes);
    // Same hold on a task that already HAS a prazo → previous prazo stays, no question.
    const dated = makeTask({ title: 'Renovar CNH', due_date: TOMORROW });
    await seedTasksForEval([dated]);
    const events2: SseLike[] = [];
    await run(WEB, ctxFor('a cnh venceu faz tempo', [dated]), [
      { toolCalls: [{ name: 'update_task', args: { task_id: dated.id, due_date: '2020-01-10' } }] },
      { text: 'Ok.' },
    ], events2);
    check((await readTask(dated.id))?.due_date === TOMORROW, 'previous prazo kept', await readTask(dated.id));
    check(choicesOf(events2).length === 0, 'no question when the task keeps its own prazo', events2);
  });

  // ── 7g. Prazo respondido → o sistema pergunta o horário ───────────────────
  await testCase('web/next-question: dia respondido em tarefa sem prazo → pergunta de horário do sistema', async () => {
    const task = makeTask({ title: 'Marcar oftalmo' });
    await seedTasksForEval([task]);
    const events: SseLike[] = [];
    const r = await run(WEB, ctxFor('Amanhã', [task]), [
      { toolCalls: [{ name: 'update_task', args: { task_id: task.id, due_date: TOMORROW } }] },
      { text: 'Boa. Se quiser, eu também posso te ajudar com o horário. Que horas fica bom?' },
    ], events);
    check((await readTask(task.id))?.due_date === TOMORROW, 'due_date persisted', await readTask(task.id));
    const q = choicesOf(events);
    check(q.length === 1 && q[0].reason === 'missing_time' && q[0].field === 'time' && q[0].taskId === task.id, 'system asks the time for that task', q);
    check(q[0]?.question === 'Qual horário?' && q[0].choices.join('|') === '9h|14h|18h|Sem horário', 'question + quick replies', q[0]);
    check(!/Que horas fica bom\?/.test(textOf(events)), "model's own time question dropped", textOf(events));
    check(r.operations[0]?.notes?.some((n) => n.includes('já perguntou ao usuário "Qual horário?"')), 'model told the system asked', r.operations[0]?.notes);
    // The person already said a time the model dropped → no time question (never guess it).
    const withTime = makeTask({ title: 'Dentista' });
    await seedTasksForEval([withTime]);
    const events2: SseLike[] = [];
    await run(WEB, ctxFor('amanhã às 15h', [withTime]), [
      { toolCalls: [{ name: 'update_task', args: { task_id: withTime.id, due_date: TOMORROW } }] },
      { text: 'Ok.' },
    ], events2);
    check(choicesOf(events2).length === 0, 'no time question when the message already names a time', events2);
    // Moving an existing prazo does not reopen the time question.
    const dated = makeTask({ title: 'Renovar CNH', due_date: TODAY });
    await seedTasksForEval([dated]);
    const events3: SseLike[] = [];
    await run(WEB, ctxFor('joga a cnh pra amanhã', [dated]), [
      { toolCalls: [{ name: 'update_task', args: { task_id: dated.id, due_date: TOMORROW } }] },
      { text: 'Ok.' },
    ], events3);
    check(choicesOf(events3).length === 0, 'no time question when the task already had a prazo', events3);
    // Time given together with the date → nothing left to ask.
    const both = makeTask({ title: 'Reunião' });
    await seedTasksForEval([both]);
    const events4: SseLike[] = [];
    await run(WEB, ctxFor('amanhã', [both]), [
      { toolCalls: [{ name: 'update_task', args: { task_id: both.id, due_date: TOMORROW, time: '10:00' } }] },
      { text: 'Ok.' },
    ], events4);
    check(choicesOf(events4).length === 0, 'no time question when time was written', events4);
  });

  // ── 7h. Fast path: resposta à pergunta do sistema sem chamar o modelo ─────
  await testCase('web/fast-path: chip/texto curto → escrita + próxima pergunta, zero chamadas ao modelo', async () => {
    const { listRemindersForTask } = await import('../src/services/reminderService');
    const task = makeTask({ title: 'Marcar oftalmo' });
    await seedTasksForEval([task]);
    const canRemind = { whatsappVerified: true } as Partial<AgentContext>;
    const pendingDue = { taskId: task.id, field: 'due_date' } as const;

    // "Amanhã" to the prazo question → due_date written, time asked, no model.
    let events: SseLike[] = [];
    let r = await run(WEB, ctxFor('Amanhã', [task], { ...canRemind, pendingQuestion: pendingDue }), [
      { text: 'NUNCA DEVERIA SER CHAMADO' },
    ], events);
    check(r.modelCalls === 0 && r.reliability.fastPath === true, 'no model call; fastPath flagged', { calls: r.modelCalls, rel: r.reliability });
    check((await readTask(task.id))?.due_date === TOMORROW, 'due_date persisted by the fast path', await readTask(task.id));
    check(r.text.startsWith('Pronto, atualizei a tarefa.'), 'backend confirmation emitted', r.text);
    let q = choicesOf(events);
    check(q.length === 1 && q[0].field === 'time' && q[0].taskId === task.id, 'next question (horário) asked', q);
    check(!/NUNCA/.test(textOf(events)), 'model text absent', textOf(events));

    // "ok" to the time question → nothing written; the same question re-asked.
    events = [];
    const pendingTime = { taskId: task.id, field: 'time' } as const;
    r = await run(WEB, ctxFor('ok', [task], { ...canRemind, pendingQuestion: pendingTime }), [{ text: 'x' }], events);
    check(r.modelCalls === 0 && r.operations.length === 0, '"ok" → no model, no write', { calls: r.modelCalls, ops: r.operations });
    q = choicesOf(events);
    check(q.length === 1 && q[0].field === 'time' && q[0].question === 'Qual horário?', 'time question re-asked', q);
    check(/só falta isto/.test(textOf(events)), 'short lead-in before the re-ask', textOf(events));

    // "9h" → time written; reminder question with relative chips (task has a time).
    events = [];
    r = await run(WEB, ctxFor('9h', [task], { ...canRemind, pendingQuestion: pendingTime }), [{ text: 'x' }], events);
    check(r.modelCalls === 0 && (await readTask(task.id))?.time === '09:00', 'time persisted by the fast path', await readTask(task.id));
    q = choicesOf(events);
    check(q.length === 1 && q[0].field === 'reminders' && q[0].choices.includes('1 hora antes'), 'reminder question with relative chips', q);

    // "1 hora antes" → reminder created; tríade settled, nothing more asked.
    events = [];
    const pendingRem = { taskId: task.id, field: 'reminders' } as const;
    r = await run(WEB, ctxFor('1 hora antes', [task], { ...canRemind, pendingQuestion: pendingRem }), [{ text: 'x' }], events);
    const reminders = await listRemindersForTask(task.id, 'eval-user');
    check(r.modelCalls === 0 && reminders.length === 1, 'reminder created without the model', { calls: r.modelCalls, reminders });
    check(choicesOf(events).length === 0, 'tríade settled: no further question', events);
    check(/lembrete/i.test(r.text), 'confirmation mentions the reminder', r.text);

    // Skip: "Sem horário" persists the skip and moves on to the reminder question (day-only chips).
    const dayOnly = makeTask({ title: 'Pagar IPTU', due_date: TOMORROW });
    await seedTasksForEval([dayOnly]);
    events = [];
    r = await run(WEB, ctxFor('Sem horário', [dayOnly], { ...canRemind, pendingQuestion: { taskId: dayOnly.id, field: 'time' } }), [{ text: 'x' }], events);
    const skipped = await readTask(dayOnly.id);
    check(r.modelCalls === 0 && String(skipped?.agent_triad_skips ?? '').includes('time'), 'skip persisted on the task', skipped);
    q = choicesOf(events);
    check(q.length === 1 && q[0].field === 'reminders' && q[0].choices.join('|') === 'No dia (9h)|Na véspera (9h)|Sem lembrete', 'day-only reminder chips', q);
    // Asking the same task again later does not re-ask the skipped field.
    events = [];
    r = await run(WEB, ctxFor('Sem lembrete', [dayOnly], { ...canRemind, pendingQuestion: { taskId: dayOnly.id, field: 'reminders' } }), [{ text: 'x' }], events);
    check(r.modelCalls === 0 && choicesOf(events).length === 0, 'both skips honoured: nothing left to ask', events);

    // Rich reply → NOT the fast path: the model must read it.
    const rich = makeTask({ title: 'Consulta' });
    await seedTasksForEval([rich]);
    events = [];
    r = await run(WEB, ctxFor('amanhã, e anota que é com a Dra. Ana', [rich], { pendingQuestion: { taskId: rich.id, field: 'due_date' } }), [
      { toolCalls: [{ name: 'update_task', args: { task_id: rich.id, due_date: TOMORROW, description: 'Com a Dra. Ana' } }] },
      { text: 'Anotado.' },
    ], events);
    check(r.modelCalls === 2 && r.reliability.fastPath === false, 'rich answer goes to the model', { calls: r.modelCalls, rel: r.reliability });
    check(String((await readTask(rich.id))?.description ?? '').includes('Com a Dra. Ana'), 'context the person added was saved', await readTask(rich.id));
    // Without WhatsApp the reminder question is never asked.
    const noWa = makeTask({ title: 'Trocar óleo', due_date: TOMORROW });
    await seedTasksForEval([noWa]);
    events = [];
    await run(WEB, ctxFor('9h', [noWa], { whatsappVerified: false, pendingQuestion: { taskId: noWa.id, field: 'time' } }), [{ text: 'x' }], events);
    check(choicesOf(events).length === 0, 'no reminder question when WhatsApp is not connected', events);
  });

  // ── 7i. Onboarding: a fila e o encerramento são do backend ────────────────
  await testCase('web/onboarding: avanço entre tarefas e encerramento sem tool nem modelo', async () => {
    const { getDatabase } = await import('../src/database');
    await getDatabase().run('UPDATE users SET onboarding_journey_completed_at = NULL WHERE id = ?', ['eval-user']);
    await getDatabase().run('DELETE FROM tasks WHERE user_id = ?', ['eval-user']);
    const salao = makeTask({ title: 'Reservar salão da Chloe' });
    const compras = makeTask({ title: 'Comprar coisas pra festa' });
    await seedTasksForEval([salao, compras]);
    const journey = { onboardingJourneyPending: true, whatsappVerified: false, preferredName: 'doug' } as Partial<AgentContext>;

    // Task 1: prazo → time question on the SAME task (continue).
    let events: SseLike[] = [];
    let r = await run(WEB, ctxFor('Amanhã', [salao, compras], { ...journey, pendingQuestion: { taskId: salao.id, field: 'due_date' } }), [{ text: 'x' }], events);
    let q = choicesOf(events);
    check(r.modelCalls === 0 && q.length === 1 && q[0].taskId === salao.id && q[0].field === 'time', 'stays on the current task while it has a question', q);

    // Task 1 settled (no WhatsApp → no reminder) → advance to task 2 in ONE
    // conversational sentence that names it and asks — no "Agora X." wizard log.
    events = [];
    r = await run(WEB, ctxFor('Sem horário', [salao, compras], { ...journey, pendingQuestion: { taskId: salao.id, field: 'time' } }), [{ text: 'x' }], events);
    q = choicesOf(events);
    check(r.modelCalls === 0 && q.length === 1 && q[0].taskId === compras.id && q[0].field === 'due_date', 'advances to the next first task', q);
    check(
      textOf(events).trim() === `E sobre {{task:${compras.id}|Comprar coisas pra festa}}, quando você pretende fazer?`,
      'intro is one conversational sentence naming the task and asking',
      textOf(events),
    );
    check(q[0].intro !== undefined && q[0].question === 'Quando você pretende fazer isso?', 'artifact keeps the canonical question + carries the intro', q);
    check(!/fila|Agora \{\{/i.test(textOf(events)), 'no internal jargon, no wizard-log line', textOf(events));

    // Task 2 skipped → nothing left → the backend closes the journey itself.
    events = [];
    r = await run(WEB, ctxFor('Ainda não sei', [salao, compras], { ...journey, pendingQuestion: { taskId: compras.id, field: 'due_date' } }), [{ text: 'x' }], events);
    check(r.modelCalls === 0 && choicesOf(events).length === 0, 'no question left', events);
    const closing = textOf(events);
    check(/primeiras tarefas estão organizadas, doug/.test(closing) && /esquerda/.test(closing) && /WhatsApp/.test(closing), 'closing text emitted by the backend', closing);
    const user = await getDatabase().get<{ onboarding_journey_completed_at: string | null }>('SELECT onboarding_journey_completed_at FROM users WHERE id = ?', ['eval-user']);
    check(Boolean(user?.onboarding_journey_completed_at), 'journey marked complete in the DB', user);

    // Idempotent: a later turn does not re-emit the closing text.
    events = [];
    const later = makeTask({ title: 'Outra', due_date: TOMORROW });
    await seedTasksForEval([later]);
    await run(WEB, ctxFor('Sem horário', [later], { ...journey, pendingQuestion: { taskId: later.id, field: 'time' } }), [{ text: 'x' }], events);
    check(!/primeiras tarefas/.test(textOf(events)), 'closing text not repeated once marked', textOf(events));
    await getDatabase().run('UPDATE users SET onboarding_journey_completed_at = NULL WHERE id = ?', ['eval-user']);
  });

  // ── 7j. Onboarding: uma mensagem livre SUSPENDE a jornada (nudge, não "Agora X.") ──
  await testCase('web/onboarding: tarefa criada no chat não puxa a pessoa de volta para a fila; nudge discreto + Continuar', async () => {
    const { getDatabase } = await import('../src/database');
    await getDatabase().run('DELETE FROM tasks WHERE user_id = ?', ['eval-user']);
    // The wizard finished an hour ago: only tasks created up to then are first tasks.
    const wizardAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const beforeWizard = new Date(Date.now() - 61 * 60 * 1000).toISOString();
    await getDatabase().run(
      'UPDATE users SET onboarding_completed_at = ?, onboarding_journey_completed_at = NULL WHERE id = ?',
      [wizardAt, 'eval-user'],
    );
    const cnh = makeTask({ title: 'Renovar CNH', created_at: beforeWizard });
    const irpf = makeTask({ title: 'Pagar IRPF atrasado', created_at: beforeWizard });
    const oftalmo = makeTask({ title: 'Marcar oftalmo', created_at: beforeWizard });
    await seedTasksForEval([cnh, irpf, oftalmo]);
    const journey = { onboardingJourneyPending: true, whatsappVerified: false, preferredName: 'teste' } as Partial<AgentContext>;
    const first = [cnh, irpf, oftalmo];

    // Off-script: while the CNH question is on screen the person asks for a new
    // task. The model creates it; the new task gets ITS OWN tríade question.
    let events: SseLike[] = [];
    let r = await run(WEB, ctxFor('preciso comprar lampada da cozinha', first, { ...journey, pendingQuestion: { taskId: cnh.id, field: 'due_date' } }), [
      { toolCalls: [{ name: 'create_task', args: { title: 'Comprar lâmpada da cozinha' } }] },
      { text: 'Boa, teste.' },
    ], events);
    const lamp = r.operations.find((op) => op.tool === 'create_task')?.entity?.id ?? '';
    let q = choicesOf(events);
    check(Boolean(lamp) && q.length === 1 && q[0].taskId === lamp && q[0].field === 'due_date', "the new task's own prazo question is asked", q);
    check(nudgesOf(events).length === 0 && !/Agora \{\{|E sobre \{\{/.test(textOf(events)), 'no journey step while a question is open', events);

    // The new task's tríade ends ("Ainda não sei"). It is NOT a first task, so
    // the journey stays suspended: a discreet nudge, not "Agora Renovar CNH."
    events = [];
    r = await run(WEB, ctxFor('Ainda não sei', [...first], { ...journey, pendingQuestion: { taskId: lamp, field: 'due_date' } }), [{ text: 'x' }], events);
    check(r.modelCalls === 0, 'skip resolved without the model', r.modelCalls);
    check(choicesOf(events).length === 0, 'no first-task question is forced on the person', choicesOf(events));
    let nudges = nudgesOf(events);
    check(nudges.length === 1 && nudges[0].remaining === 3 && nudges[0].resumeLabel === 'Continuar', 'one nudge with the count of first tasks left', nudges);
    check(nudges[0]?.text === 'Você ainda tem 3 tarefas para organizar.', 'nudge copy', nudges[0]?.text);
    check(!/Agora|E sobre/.test(textOf(events)), 'no "Agora X." and no journey question in the text', textOf(events));
    check(r.text.includes('Você ainda tem 3 tarefas para organizar.'), 'composed text records the nudge', r.text);

    // "Continuar" under the nudge → resume: the first open first task, in one
    // conversational sentence, no model call.
    events = [];
    r = await run(WEB, ctxFor('Continuar', first, { ...journey, pendingQuestion: { field: 'journey' } }), [{ text: 'NUNCA' }], events);
    q = choicesOf(events);
    check(r.modelCalls === 0 && r.reliability.fastPath === true, 'resume is a fast path', { calls: r.modelCalls, rel: r.reliability });
    check(q.length === 1 && q[0].taskId === cnh.id && q[0].field === 'due_date', 'resumes on the first task still open', q);
    check(textOf(events).trim() === `Vamos lá. Sobre {{task:${cnh.id}|Renovar CNH}}, quando você pretende fazer?`, 'resume intro', textOf(events));

    // Back in the journey: answering the CNH question advances conversationally.
    events = [];
    r = await run(WEB, ctxFor('Ainda não sei', first, { ...journey, pendingQuestion: { taskId: cnh.id, field: 'due_date' } }), [{ text: 'x' }], events);
    q = choicesOf(events);
    check(r.modelCalls === 0 && q.length === 1 && q[0].taskId === irpf.id, 'active journey: advances to the next first task', q);
    check(textOf(events).trim() === `E sobre {{task:${irpf.id}|Pagar IRPF atrasado}}, quando você pretende fazer?`, 'conversational advance intro', textOf(events));

    // Free text under the nudge that is NOT a resume goes to the model as usual
    // (journey suspended again); a task it settles brings the nudge back.
    events = [];
    const later = makeTask({ title: 'Levar o carro' });
    await seedTasksForEval([later]);
    r = await run(WEB, ctxFor('levar o carro amanhã às 10', [...first, later], { ...journey, pendingQuestion: { field: 'journey' } }), [
      { toolCalls: [{ name: 'update_task', args: { task_id: later.id, due_date: TOMORROW, time: '10:00' } }] },
      { text: 'Se quiser, dá para deixar a chave do carro separada hoje à noite.' },
    ], events);
    check(r.modelCalls === 2, 'not a resume word → the model handles the message', r.modelCalls);
    q = choicesOf(events);
    nudges = nudgesOf(events);
    check(q.length === 0 && nudges.length === 1 && nudges[0].remaining === 2, 'off-script task settled → nudge again (2 left), no journey question', { q, nudges });
    check(
      r.text.startsWith('Pronto, atualizei a tarefa.') &&
        /chave do carro/.test(r.text) &&
        r.text.indexOf('chave do carro') < r.text.indexOf('Você ainda tem') &&
        r.text.endsWith('Você ainda tem 2 tarefas para organizar.'),
      'composed text keeps the order seen: confirmation, model text, nudge',
      r.text,
    );

    // A nudge alone never closes the journey; settling every first task does (even off-script).
    const { addTriadSkip } = await import('../src/services/agent/core/tasks');
    for (const t of [irpf, oftalmo]) await addTriadSkip(t.id, 'eval-user', 'due_date');
    events = [];
    r = await run(WEB, ctxFor('Sem horário', [...first, later], { ...journey, pendingQuestion: { taskId: later.id, field: 'time' } }), [{ text: 'x' }], events);
    check(nudgesOf(events).length === 0 && /primeiras tarefas estão organizadas, teste/.test(textOf(events)), 'all first tasks settled → closing, no nudge', textOf(events));
    await getDatabase().run('UPDATE users SET onboarding_completed_at = NULL, onboarding_journey_completed_at = NULL WHERE id = ?', ['eval-user']);
  });

  // ── 7f. WhatsApp (sem política): a pergunta de período continua em texto ───
  await testCase('whatsapp/next-question: sem UI de botões a pergunta vai em texto', async () => {
    const ctx = ctxFor('comprar presente da mãe');
    const events: SseLike[] = [];
    const r = await run(WHATSAPP, ctx, [
      { toolCalls: [{ name: 'create_task', args: { title: 'Comprar presente da mãe' } }] },
      { text: 'Quer que eu te lembre antes?' },
    ], events);
    check(choicesOf(events).length === 0 && !/Quando você pretende/.test(r.text), 'WhatsApp: policy off, no prazo question', r.text);
    check(/Quer que eu te lembre antes\?/.test(r.text), "model's question kept", r.text);
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
    // A past day the user never named (the model copying an official deadline
    // it looked up) is held; a past day the user DID name ("ontem") is not.
    const YESTERDAY = addDays(TODAY, -1);
    const d5 = reconcileDueDate('2020-05-29', 'preciso emitir meu irpf desse ano', 'America/Sao_Paulo');
    check(d5.action === 'hold' && d5.pastDate === true, 'unmentioned past due_date held', d5);
    const d6 = reconcileDueDate(YESTERDAY, 'esqueci de pagar a conta ontem', 'America/Sao_Paulo');
    check(d6.action !== 'hold', 'past day the user named is not held', d6);
    const d7 = reconcileDueDate(TODAY, 'preciso emitir meu irpf desse ano', 'America/Sao_Paulo');
    check(d7.action === 'keep_model_value', 'today is not "past"', d7);
    const d8 = reconcileDueDate(addDays(TODAY, 8), 'ontem o médico pediu o exame, marco semana que vem', 'America/Sao_Paulo');
    check(d8.action === 'hold' && !!d8.pendingQuestion, 'narrative "ontem" does not silence the period question', d8);

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
    // Regression (seen in the web UI): a "não" that does not negate the claim
    // verb must not shield the claim. Only "não/ainda não/nada + verb" does.
    const strayNegation = filterModelText(
      'Entendi, teste. Deixei isso organizado como uma tarefa pra não se perder no meio do caminho.\n\nAgora falta só definir o prazo. Qual dia você quer usar?',
      { hasWrites: () => true, hasPendingQuestions: () => false, persistedEchoes: () => [] },
    );
    check(!/Deixei isso organizado/.test(strayNegation.text), 'claim with an unrelated "não" dropped', strayNegation);
    check(/Qual dia você quer usar\?/.test(strayNegation.text), 'question after the claim kept', strayNegation);
    const realNegations = filterModelText(
      'Ainda não atualizei o prazo. Nada foi alterado na tarefa. Não criei nada novo, só anotei aqui.',
      { hasWrites: () => true, hasPendingQuestions: () => false, persistedEchoes: () => [] },
    );
    check(
      /Ainda não atualizei/.test(realNegations.text) && /Nada foi alterado/.test(realNegations.text) && /Não criei nada novo/.test(realNegations.text),
      'negated claims (não/ainda não/nada + verb) kept',
      realNegations,
    );
    // WhatsApp pipe-joined line: each fragment is gated on its own, and an
    // imperative re-ask ("me diga qual dia") is dropped when the backend
    // already asked. A negation in one fragment shields only that fragment.
    const piped = filterModelText(
      'Beleza, Doug | deixei o alinhamento às 14h | como “semana que vem” não fecha um dia, me diga qual dia exato pra eu ajustar o prazo | Posso te lembrar na véspera.',
      { hasWrites: () => true, hasPendingQuestions: () => true, persistedEchoes: () => [] },
    );
    check(piped.text === 'Posso te lembrar na véspera.', 'pipe fragments gated individually, re-ask dropped, no orphan pipes', piped);
    // Title echo: a fragment that is just the persisted title + time is
    // redundant; a real follow-up that mentions the title is not.
    const echoText =
      'alinhamento com o conselho fiscal às 14:00\nfalta só o dia exato da semana que vem para fechar o prazo.\nQuer que eu te lembre do alinhamento com o conselho fiscal na véspera?';
    const echoes = () => ['Alinhamento com o conselho fiscal'];
    const echoPending = filterModelText(echoText, { hasWrites: () => true, hasPendingQuestions: () => true, persistedEchoes: echoes });
    check(echoPending.text === '' && echoPending.dropped === 3, 'with a backend question pending: echo, re-ask and question all dropped', echoPending);
    const echoFree = filterModelText(echoText, { hasWrites: () => true, hasPendingQuestions: () => false, persistedEchoes: echoes });
    check(
      echoFree.text === 'falta só o dia exato da semana que vem para fechar o prazo.\nQuer que eu te lembre do alinhamento com o conselho fiscal na véspera?',
      'no question pending: only the bare title echo is dropped; follow-ups mentioning the title stay',
      echoFree,
    );
  });

  // ── Menções de tarefa escritas pelo MODELO ─────────────────────────────────
  // The web prompt asks the model to write `{{task:id|título}}` when it names
  // an existing task. The backend keeps the token only for ids it knows.
  await testCase('web/menção: id da lista vira chip, id inventado vira texto, token nunca chega pela metade', async () => {
    const irpf = makeTask({ title: 'Pagar IRPF atrasado', priority: 'high' });
    const dentista = makeTask({ title: 'Dentista', due_date: TOMORROW });
    await seedTasksForEval([irpf, dentista]);
    const ctx = ctxFor('oq preciso priorizar', [irpf, dentista]);
    const events: SseLike[] = [];
    const r = await run(
      WEB,
      ctx,
      [
        {
          text: `teste, a prioridade agora é:\n\n• {{task:${irpf.id}|pagar irpf atrasado}}. Está com prioridade alta.\n• {{task:ghost-123|Renovar seguro}}. Não achei essa.\n\nDepois vem {{task:${dentista.id}|Dentista}}.`,
        },
      ],
      events,
    );
    check(r.text.includes(`{{task:${irpf.id}|Pagar IRPF atrasado}}`), 'known id kept as a mention, with the persisted title', r.text);
    check(r.text.includes(`{{task:${dentista.id}|Dentista}}`), 'second known id kept', r.text);
    check(!r.text.includes('ghost-123') && /• Renovar seguro\. Não achei essa\./.test(r.text), 'unknown id downgraded to plain title', r.text);
    check(textOf(events) === r.text, 'streamed text equals composed text', { streamed: textOf(events), text: r.text });
    // No delta may contain a half-written token: the guard buffers "{{…}}".
    const partial = events.filter(
      (e): e is { type: 'text'; content: string } =>
        e.type === 'text' && /\{\{/.test(e.content) && !/\{\{task:[^}]*\|[^}]*\}\}/.test(e.content),
    );
    check(partial.length === 0, 'no partial {{task: token streamed', partial);
    check(r.reliability.claimsStripped === 0, 'plain prose with mentions is not a claim', r.reliability);
  });

  await testCase('web/menção: tarefa vinda de search_tasks pode ser mencionada', async () => {
    const far = makeTask({ title: 'Renovar passaporte', due_date: addDays(TODAY, 60) });
    await seedTasksForEval([far]);
    const ctx = ctxFor('tem algo sobre passaporte?', []); // not in the prompt list
    const r = await run(WEB, ctx, [
      { toolCalls: [{ name: 'search_tasks', args: { query: 'passaporte' } }] },
      { text: `Tem sim: {{task:${far.id}|Renovar passaporte}}, daqui a dois meses.` },
    ]);
    check(r.text.includes(`{{task:${far.id}|Renovar passaporte}}`), 'id returned by search_tasks is known', r.text);
  });

  await testCase('whatsapp/menção: superfície plain nunca recebe o token', async () => {
    const task = makeTask({ title: 'Pagar IRPF atrasado', priority: 'high' });
    await seedTasksForEval([task]);
    const ctx = ctxFor('o que priorizo?', [task]);
    const r = await run(WHATSAPP, ctx, [{ text: `Sua prioridade é {{task:${task.id}|Pagar IRPF atrasado}} | prioridade alta.` }]);
    check(!r.text.includes('{{'), 'no token on plain surface', r.text);
    check(r.text.includes('Pagar IRPF atrasado'), 'title kept as text', r.text);
  });

  await testCase('gate: o pipe dentro da menção não é separador de frase', async () => {
    const ctx = { hasWrites: () => true, hasPendingQuestions: () => false, persistedEchoes: () => ['Dentista'] };
    const kept = filterModelText('Antes disso, vale olhar {{task:abc|Dentista}} amanhã cedo.', ctx);
    check(kept.text === 'Antes disso, vale olhar {{task:abc|Dentista}} amanhã cedo.', 'mention survives the gate intact', kept);
    // A sentence that is ONLY the mention of a task just written is an echo.
    const echo = filterModelText('{{task:abc|Dentista}}', ctx);
    check(echo.text === '' && echo.dropped === 1, 'bare mention of the persisted title is still an echo', echo);
  });

  __setOpenAIClientForTesting(null);

  console.log(`\n[deterministic] ${passed} assertions passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[deterministic] fatal error:', err);
  process.exit(1);
});
