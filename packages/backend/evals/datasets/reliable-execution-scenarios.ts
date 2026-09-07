/**
 * Evaluation scenarios — entrega 1 (execução e confirmações confiáveis).
 *
 * Every scenario here runs with `reliable: true`. Assertions target what the
 * BACKEND guarantees regardless of the model's wording: confirmations built
 * from the operations record, explicit failure lines, held-back ambiguous
 * dates and the continuity question that replaces them.
 *
 * The deterministic counterpart (`npm run eval:deterministic`) asserts the
 * same rules with a scripted model; this file checks the real model still
 * lands on the same user-visible outcome.
 */

import { addDays, makeTask, todayIso } from '../helpers';
import type { EvalScenario } from './whatsapp-scenarios';

const TODAY = todayIso();
const TOMORROW = addDays(TODAY, 1);

const CONTA_LUZ = makeTask({ title: 'Pagar conta de luz', due_date: TODAY });
const SEGURO_FANTASMA = makeTask({ title: 'Renovar seguro do carro' });
const DENTISTA = makeTask({ title: 'Dentista', due_date: TOMORROW, time: '15:00' });
const PNEUS = makeTask({ title: 'Trocar pneus', due_date: TODAY });

export const RELIABLE_EXECUTION_SCENARIOS: EvalScenario[] = [
  // ── "semana que vem" never becomes a due_date; the backend asks the day ───
  {
    name: 'reliable/whatsapp/semana-que-vem-pergunta-do-sistema',
    reliable: true,
    // Title deliberately distinct from every other scenario: the suite shares
    // one in-memory DB, and the dedup window would otherwise turn this create
    // into "já está na sua lista" depending on run order.
    input: 'alinhamento com o conselho fiscal semana que vem 14h',
    mustCallTool: ['create_task'],
    mustCallToolArgs: [{ tool: 'create_task', arg: 'time', value: '14:00' }],
    // Confirmation and question are backend-owned: exact strings are safe.
    mustContain: ['Salvo! Tarefa', 'Qual dia da semana que vem?'],
    // No weekday line can exist: the date was held, and a model-invented
    // schedule line is stripped by the sentence gate.
    mustNotContain: ['-feira', 'anotado', 'vou anotar'],
    // Backend-owned text is deterministic, so the gold standard is literal.
    idealOutput:
      'Salvo! Tarefa *Alinhamento com o conselho fiscal* criada! 🗓️\nQual dia da semana que vem?',
    tags: ['reliable-execution', 'task-creation', 'clarify-date', 'whatsapp'],
  },

  // ── Partial batch: one completes, the other doesn't exist ─────────────────
  {
    name: 'reliable/whatsapp/lote-parcial-conclusao',
    reliable: true,
    input: 'conclui a conta de luz e o seguro do carro',
    contextOverrides: { activeTasks: [CONTA_LUZ, SEGURO_FANTASMA] },
    unseededTaskIds: [SEGURO_FANTASMA.id],
    mustCallTool: ['complete_task'],
    mustContain: ['Pagar conta de luz concluída.', 'Não encontrei a tarefa para concluir.'],
    // The backend already said what happened; a restated "foi concluída" from
    // the model is a duplicate claim and must be gone.
    mustNotContain: ['seguro do carro concluída', 'duas tarefas concluídas', 'ambas', 'foi concluída'],
    idealOutput:
      'Pagar conta de luz concluída.\nNão encontrei a tarefa para concluir.\n\nEm seguida Jarvi pode oferecer procurar o seguro do carro nas tarefas ou pedir o nome exato.',
    tags: ['reliable-execution', 'task-completion', 'partial-failure', 'whatsapp'],
  },

  // ── Clearing a field: explicit null, explicit confirmation ────────────────
  {
    name: 'reliable/whatsapp/limpar-prazo',
    reliable: true,
    input: 'tira a data do dentista',
    contextOverrides: { activeTasks: [DENTISTA] },
    mustCallTool: ['update_task'],
    mustCallToolArgs: [{ tool: 'update_task', arg: 'due_date', value: null }],
    mustUpdateTaskIds: [DENTISTA.id],
    // "prazo removido" or, if the model also clears the time, "prazo e horário removidos".
    mustContain: ['Atualizei *Dentista*', 'removido'],
    mustNotCallTool: ['create_task', 'delete_task'],
    idealOutput: 'Atualizei *Dentista*: prazo e horário removidos.',
    tags: ['reliable-execution', 'task-update', 'clear-field', 'whatsapp'],
  },

  // ── Web: the card is the confirmation; the model keeps only the human part ─
  {
    name: 'reliable/web/criar-sem-eco',
    reliable: true,
    channel: 'web',
    input: 'cria uma tarefa pra pagar o IPTU',
    mustCallTool: ['create_task'],
    mustCallToolCount: { create_task: 1 },
    // No confirmation text at all: neither the model's ("criei", "Feito!") nor
    // a backend one — the tool_result card already shows the task. The claim
    // gate strips whatever the model restates.
    mustNotContain: ['criei', 'criada', 'Feito', 'Pronto!', 'Pronto,', 'Salvo', 'deixei', 'Resumo'],
    idealOutput:
      'Sem confirmação textual (o cartão da tarefa já apareceu). No máximo uma frase humana curta e UMA pergunta sobre prazo ou lembrete, de preferência via botões de resposta rápida.',
    tags: ['reliable-execution', 'task-creation', 'web'],
  },

  // ── Web: edits ARE confirmed by the backend, in one short line ────────────
  {
    name: 'reliable/web/atualizar-confirmacao-do-sistema',
    reliable: true,
    channel: 'web',
    input: 'muda a prioridade do dentista pra alta',
    contextOverrides: { activeTasks: [DENTISTA] },
    mustCallTool: ['update_task'],
    mustCallToolArgs: [{ tool: 'update_task', arg: 'priority', value: 'high' }],
    mustUpdateTaskIds: [DENTISTA.id],
    mustContain: ['Pronto, atualizei a tarefa.'],
    // Exactly one confirmation, owned by the backend — no model restatement
    // and no echo of the field the card already shows.
    mustNotContain: ['Resumo', 'alterei', 'prioridade alta', 'Atualização salva'],
    idealOutput: 'Pronto, atualizei a tarefa.',
    tags: ['reliable-execution', 'task-update', 'web'],
  },

  // ── "essa semana" is a period too (same rule the web prompt states) ───────
  {
    name: 'reliable/whatsapp/essa-semana-pergunta-do-sistema',
    reliable: true,
    input: 'preciso levar o carro pra revisão essa semana',
    mustCallTool: ['create_task'],
    mustNotCallTool: ['update_task'],
    mustContain: ['Salvo! Tarefa', 'Qual dia dessa semana?'],
    mustNotContain: ['-feira', 'anotado', 'vou anotar'],
    tags: ['reliable-execution', 'task-creation', 'clarify-date', 'whatsapp'],
  },

  // ── Task mode: the same date rule applies in the focused-task chat ────────
  {
    name: 'reliable/web/task-mode-semana-que-vem',
    reliable: true,
    channel: 'web',
    input: 'vou resolver isso semana que vem',
    contextOverrides: { focusedTask: PNEUS, mode: 'task' },
    // Two honest paths are accepted: the model updates the task (description)
    // and the BACKEND asks the day, or the model writes nothing and asks the
    // day itself. What must never happen: a guessed date or a "ficou para /
    // atualizei o prazo" claim.
    mustContain: ['dia', '?'],
    mustNotContain: ['-feira', 'atualizei o prazo', 'ficou para', 'ficou pra', 'reagendei'],
    mustNotCallTool: ['create_task', 'delete_task', 'complete_task'],
    idealOutput:
      'Jarvi não muda o prazo por conta própria: pergunta qual dia da semana que vem o usuário quer, sem afirmar nenhuma data.',
    tags: ['reliable-execution', 'task-mode', 'clarify-date', 'web'],
  },

  // ── Reading is never turned into writing, and the fallback stays silent ───
  {
    name: 'reliable/whatsapp/briefing-sem-escrita',
    reliable: true,
    input: 'o que tenho hoje?',
    contextOverrides: { activeTasks: [CONTA_LUZ, PNEUS] },
    mustNotCallTool: ['create_task', 'update_task', 'complete_task', 'delete_task'],
    mustContain: ['Pagar conta de luz', 'Trocar pneus'],
    mustNotContain: ['Ainda não alterei nada'],
    idealOutput:
      'Hoje você tem:\n— Pagar conta de luz\n— Trocar pneus\n\nPosso te ajudar com:\n1. detalhes de uma tarefa\n2. próximas tarefas\n3. tarefas vencidas',
    tags: ['reliable-execution', 'briefing', 'no-write', 'whatsapp'],
  },
];
