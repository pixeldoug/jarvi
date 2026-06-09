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
    mustContain: ['ração'],
    idealOutput: 'Criei a tarefa de comprar ração pro cachorro. Não adicionei categoria porque nenhuma das suas se encaixa.',
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
    mustContain: ['proposta'],
    idealOutput: 'Pronto! Marquei "Enviar proposta para o cliente" como concluída.',
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
    mustContain: ['banco'],
    idealOutput: 'Tarefa "Ligar para o banco" deletada.',
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
    idealOutput: 'Prioridade da tarefa "Entregar relatório trimestral" atualizada para alta.',
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
    idealOutput: 'Atualizei a descrição: levar documento original e uma cópia.',
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
    mustNotContain: ['Tarefa A', 'Tarefa B', 'Tarefa C', '**', '###'],
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
    mustContain: ['condomínio', 'amanhã'],
    idealOutput: 'Reagendei "Pagar condomínio" para amanhã.',
    tags: ['web', 'overdue', 'reschedule', 'tool-calling'],
  },
];
