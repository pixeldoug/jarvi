/**
 * Evaluation scenarios for the Web agent.
 *
 * Complements whatsapp-scenarios.ts with coverage for the web channel:
 * general mode (chat panel) and task mode (focused task sidebar).
 */

import { addDays, makeCategory, makeTask, todayIso } from '../helpers';
import type { EvalScenario } from './whatsapp-scenarios';

const TODAY = todayIso();
const TOMORROW = addDays(TODAY, 1);
const YESTERDAY = addDays(TODAY, -1);

export const WEB_SCENARIOS: EvalScenario[] = [
  // ── Task creation ─────────────────────────────────────────────────────────
  {
    name: 'web/create-task-simple',
    channel: 'web',
    input: 'preciso criar uma tarefa para revisar o contrato antes do fim do dia',
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'due_date', value: TODAY },
    ],
    mustContain: ['contrato'],
    mustNotContain: ['amanhã', 'sem data'],
    idealOutput: 'Feito! Tem algum detalhe importante sobre o contrato?',
    tags: ['web', 'task-creation', 'tool-calling'],
  },
  {
    name: 'web/create-multiple-tasks',
    channel: 'web',
    input: 'cria duas tarefas: pagar conta de luz e renovar seguro do carro',
    mustCallTool: ['create_task'],
    mustCallToolCount: { create_task: 2 },
    mustContain: ['luz', 'seguro'],
    idealOutput: 'Feito! Quer adicionar prazo para a conta de luz ou para o seguro?',
    tags: ['web', 'task-creation', 'multi-create', 'tool-calling'],
  },

  // ── Category reuse (must NOT invent new categories) ───────────────────────
  {
    name: 'web/reuse-existing-category',
    channel: 'web',
    input: 'cria uma tarefa pra pagar a fatura do cartão amanhã',
    contextOverrides: {
      categories: [
        makeCategory({ name: 'Trabalho' }),
        makeCategory({ name: 'Saúde' }),
        makeCategory({ name: 'Finanças' }),
      ],
    },
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'category', value: 'Finanças' },
    ],
    mustContain: ['fatura'],
    idealOutput: 'Criei a tarefa de pagar a fatura do cartão para amanhã, na categoria Finanças.',
    tags: ['web', 'task-creation', 'category', 'reuse'],
  },
  {
    name: 'web/no-invented-category-when-no-fit',
    channel: 'web',
    input: 'cria uma tarefa de comprar ração pro cachorro',
    contextOverrides: {
      categories: [
        makeCategory({ name: 'Trabalho' }),
        makeCategory({ name: 'Saúde' }),
      ],
    },
    mustCallTool: ['create_task'],
    // No existing category fits, so the agent must leave it uncategorized —
    // never invent a new free-text category like these plausible guesses.
    mustNotCallToolArgs: [
      { tool: 'create_task', arg: 'category', value: 'Pets' },
      { tool: 'create_task', arg: 'category', value: 'Compras' },
      { tool: 'create_task', arg: 'category', value: 'Animais' },
      { tool: 'create_task', arg: 'category', value: 'Casa' },
      { tool: 'create_task', arg: 'category', value: 'Pessoal' },
    ],
    // NOT mustContain('ração'): the current web prompt's "CRIAR TAREFA
    // (OBRIGATÓRIO)" rule explicitly forbids repeating the task title in the
    // confirmation text ("o artefato já comunica tudo isso") — the task-card
    // artifact is what shows the title, not the chat text.
    idealOutput: 'Feito — tarefa criada (sem categoria, já que nenhuma das existentes se encaixa).',
    tags: ['web', 'task-creation', 'category', 'no-invent'],
  },

  // ── Task updates ──────────────────────────────────────────────────────────
  {
    name: 'web/complete-task',
    channel: 'web',
    input: 'pode marcar a tarefa de enviar proposta como concluída?',
    contextOverrides: {
      activeTasks: [
        makeTask({ id: 'task-proposta', title: 'Enviar proposta para o cliente', due_date: TODAY }),
        makeTask({ id: 'task-reuniao', title: 'Reunião com fornecedor', due_date: TOMORROW }),
      ],
    },
    mustCallTool: ['complete_task'],
    mustCallToolArgs: [
      { tool: 'complete_task', arg: 'task_id', value: 'task-proposta' },
    ],
    mustNotCallToolArgs: [
      { tool: 'complete_task', arg: 'task_id', value: 'task-reuniao' },
    ],
    // NOT mustContain('proposta'): now that complete_task returns the task's
    // title (tools.ts fetches it before mutating), the UI renders a
    // TaskCardMessage with "Enviar proposta para o cliente" — same
    // "don't repeat what the card already shows" pattern as create_task.
    // The exact task affected is asserted via mustCallToolArgs above instead.
    idealOutput: 'Pronto! Tarefa concluída (o cartão mostra qual).',
    tags: ['web', 'task-update', 'complete', 'tool-calling'],
  },
  {
    name: 'web/delete-task',
    channel: 'web',
    input: 'pode deletar a tarefa de ligar pro banco?',
    contextOverrides: {
      activeTasks: [
        makeTask({ id: 'task-banco', title: 'Ligar para o banco', due_date: TODAY }),
        makeTask({ id: 'task-email', title: 'Responder e-mails pendentes', due_date: TODAY }),
      ],
    },
    mustCallTool: ['delete_task'],
    mustCallToolArgs: [
      { tool: 'delete_task', arg: 'task_id', value: 'task-banco' },
    ],
    mustNotCallToolArgs: [
      { tool: 'delete_task', arg: 'task_id', value: 'task-email' },
    ],
    // NOT mustContain('banco'): delete_task now returns the task's title
    // (fetched before deletion) and the UI renders a TaskCardMessage for it
    // (see ChatMessage.tsx / TaskCardMessage.tsx) — same "don't repeat" rule
    // as create_task. The exact task deleted is asserted via
    // mustCallToolArgs above instead.
    idealOutput: 'Tarefa deletada (o cartão mostra qual).',
    tags: ['web', 'task-update', 'delete', 'tool-calling'],
  },
  {
    name: 'web/update-task-priority',
    channel: 'web',
    input: 'a tarefa de entregar relatório é urgente, aumenta a prioridade',
    contextOverrides: {
      activeTasks: [
        makeTask({
          id: 'task-relatorio',
          title: 'Entregar relatório trimestral',
          due_date: TOMORROW,
          priority: 'low',
        }),
      ],
    },
    mustCallTool: ['update_task'],
    mustCallToolArgs: [
      { tool: 'update_task', arg: 'task_id', value: 'task-relatorio' },
      { tool: 'update_task', arg: 'priority', value: 'high' },
    ],
    mustContain: ['relatório'],
    idealOutput:
      'Feito — prioridade da tarefa "Entregar relatório trimestral" aumentada para alta (a tarefa vence amanhã).',
    tags: ['web', 'task-update', 'priority', 'tool-calling'],
  },

  // ── Task mode (focused task sidebar) ─────────────────────────────────────
  {
    name: 'web/task-mode-update-description',
    channel: 'web',
    input: 'adiciona na descrição que preciso levar o documento original e uma cópia',
    contextOverrides: {
      mode: 'task',
      focusedTask: makeTask({
        id: 'task-cartorio',
        title: 'Ir ao cartório reconhecer firma',
        description: null,
        due_date: TOMORROW,
      }),
    },
    mustCallTool: ['update_task'],
    mustCallToolArgs: [
      { tool: 'update_task', arg: 'task_id', value: 'task-cartorio' },
    ],
    mustContain: ['documento', 'descrição'],
    mustNotContain: ['não consigo', 'erro'],
    idealOutput:
      'Descrição atualizada: levar o documento original e uma cópia. Pergunta curta de contexto opcional (ex. qual documento é).',
    tags: ['web', 'task-mode', 'description-update', 'tool-calling'],
  },

  // ── Scope clarification ───────────────────────────────────────────────────
  {
    name: 'web/scope-clarification-before-listing',
    channel: 'web',
    input: 'quais são minhas tarefas?',
    contextOverrides: {
      activeTasks: [
        makeTask({ title: 'Tarefa A', due_date: TODAY }),
        makeTask({ title: 'Tarefa B', due_date: TOMORROW }),
        makeTask({ title: 'Tarefa C', due_date: YESTERDAY }),
      ],
    },
    mustNotCallTool: ['create_task', 'update_task', 'delete_task'],
    mustContain: ['hoje', 'semana'],
    // NOT '**': the current web formatting rules REQUIRE **negrito** to
    // highlight key info ("Use **negrito** para destacar informações-chave"),
    // and the agent correctly bolds the actual scope options being offered
    // (e.g. "Quer ver **as de hoje, da semana, ou todas**?"). Only structural
    // markdown that doesn't belong in a 1-line question stays forbidden.
    mustNotContain: ['Tarefa A', 'Tarefa B', 'Tarefa C', '###'],
    idealOutput: 'Quer ver as de hoje, da semana, ou todas?',
    tags: ['web', 'scope', 'clarification'],
  },

  // ── Overdue handling on web ───────────────────────────────────────────────
  {
    name: 'web/reschedule-overdue-task',
    channel: 'web',
    input: 'a tarefa de pagar o condomínio está atrasada, reagenda para amanhã',
    contextOverrides: {
      activeTasks: [
        makeTask({ id: 'task-condominio', title: 'Pagar condomínio', due_date: YESTERDAY }),
        makeTask({ id: 'task-academia', title: 'Renovar academia', due_date: YESTERDAY }),
      ],
    },
    mustCallTool: ['update_task'],
    mustCallToolCount: { update_task: 1 },
    mustCallToolArgs: [
      { tool: 'update_task', arg: 'task_id', value: 'task-condominio' },
      { tool: 'update_task', arg: 'due_date', value: TOMORROW },
    ],
    mustNotCallToolArgs: [
      { tool: 'update_task', arg: 'task_id', value: 'task-academia' },
    ],
    // NOT mustContain('condomínio'): with a single update_task call, the UI
    // renders a TaskCardMessage with the task's title already (see
    // ChatMessage.tsx) — repeated across multiple runs, the agent
    // consistently confirms with just "reagendei para amanhã" and lets the
    // card carry the title, the same "don't repeat what the card already
    // shows" pattern create_task follows explicitly.
    mustContain: ['amanhã'],
    idealOutput: 'Feito — reagendei para amanhã.',
    tags: ['web', 'overdue', 'reschedule', 'tool-calling'],
  },
];
