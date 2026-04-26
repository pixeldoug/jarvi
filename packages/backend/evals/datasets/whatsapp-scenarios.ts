/**
 * Evaluation scenarios for the WhatsApp agent.
 *
 * Each scenario defines:
 *  - input:    user message
 *  - context:  AgentContext overrides (tasks, memory, pending tasks, etc.)
 *  - expected: what the ideal response should contain / do
 *  - tags:     categories for filtering / grouping in Braintrust UI
 */

import { addDays, makePendingTask, makeTask, todayIso } from '../helpers';

const TODAY = todayIso();
const TOMORROW = addDays(TODAY, 1);
const NEXT_WEEK = addDays(TODAY, 7);
const YESTERDAY = addDays(TODAY, -1);

// ---------------------------------------------------------------------------
// Scenario shape
// ---------------------------------------------------------------------------

export interface EvalScenario {
  name: string;
  input: string;
  channel?: 'whatsapp' | 'web';
  contextOverrides?: {
    memory?: string;
    preferredName?: string;
    activeTasks?: ReturnType<typeof makeTask>[];
    pendingTasks?: ReturnType<typeof makePendingTask>[];
    focusedTask?: ReturnType<typeof makeTask>;
    mode?: 'general' | 'task';
  };
  /** Strings that MUST appear in the response (case-insensitive). */
  mustContain?: string[];
  /** Strings that must NOT appear in the response (case-insensitive). */
  mustNotContain?: string[];
  /** Tools that MUST be called during the scenario. */
  mustCallTool?: string[];
  /** Tools that must NOT be called during the scenario. */
  mustNotCallTool?: string[];
  /** Exact number of times a tool must be called. */
  mustCallToolCount?: Record<string, number>;
  /** Free-form gold standard used by the LLM-based scorer. */
  idealOutput?: string;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

export const SCENARIOS: EvalScenario[] = [
  // ── Daily briefing ──────────────────────────────────────────────────────────
  {
    name: 'briefing/morning-greeting',
    input: 'bom dia',
    contextOverrides: {
      activeTasks: [
        makeTask({ title: 'Reunião com cliente', due_date: TODAY, time: '09:00' }),
        makeTask({ title: 'Revisar proposta', due_date: TODAY }),
        makeTask({ title: 'Planejar viagem', due_date: NEXT_WEEK }),
      ],
    },
    mustContain: ['bom dia'],
    mustNotContain: [TOMORROW, NEXT_WEEK, 'Boa noite', 'Boa tarde'],
    idealOutput:
      'Bom dia, Doug! Hoje você tem: Reunião com cliente às 09:00 e Revisar proposta. Posso te ajudar com: 1. detalhes de uma tarefa, 2. próximas tarefas, 3. tarefas vencidas',
    tags: ['briefing', 'scope'],
  },
  {
    name: 'briefing/how-is-my-day',
    input: 'como está meu dia?',
    contextOverrides: {
      activeTasks: [
        makeTask({ title: 'Pagar DARF', due_date: TODAY }),
        makeTask({ title: 'Dar aviso prévio ao Tum', due_date: TOMORROW }),
        makeTask({ title: 'Retirar passaporte', due_date: NEXT_WEEK }),
      ],
    },
    mustContain: ['Pagar DARF'],
    mustNotContain: [
      'Dar aviso prévio',
      'Retirar passaporte',
      'Outras tarefas',
      '🔥',
      '🕐',
      '📌',
      '✅',
    ],
    idealOutput: 'Hoje você tem: Pagar DARF. Posso te ajudar com: 1. detalhes de uma tarefa, 2. próximas tarefas, 3. tarefas vencidas',
    tags: ['briefing', 'scope'],
  },
  {
    name: 'briefing/no-tasks-today',
    input: 'oi, como está meu dia?',
    contextOverrides: {
      activeTasks: [
        makeTask({ title: 'Task na próxima semana', due_date: NEXT_WEEK }),
      ],
    },
    mustContain: ['dia'],
    mustNotContain: ['undefined', 'null', 'NaN'],
    idealOutput: 'Sua agenda está livre hoje! Mas você tem tarefas para os próximos dias.',
    tags: ['briefing', 'empty-state'],
  },

  // ── Task creation ────────────────────────────────────────────────────────────
  {
    name: 'create-task/simple',
    input: 'preciso ligar para o João amanhã às 10h',
    mustContain: ['João', 'amanhã', '10'],
    mustNotContain: [
      'Já criei a tarefa no app',
      'Quer ajustar algo antes',
      'Sugestão de ajuste',
      'sem data',
      '📋',
      '🗓️',
      '✅',
    ],
    idealOutput: 'Ligar para o João — sugestão criada. Ela está na aba Integrações para você aprovar.',
    tags: ['task-creation', 'pending'],
  },
  {
    name: 'create-task/no-date',
    input: 'lembrar de renovar o passaporte',
    mustContain: ['passaporte', 'sem data'],
    mustNotContain: [
      'Esta semana',
      'Prioridade média',
      'Já criei a tarefa no app',
      '📋',
      '🗓️',
      '✅',
    ],
    idealOutput: 'Renovar o passaporte — sugestão criada. Sem data por enquanto. Quer adicionar um prazo?',
    tags: ['task-creation', 'no-date'],
  },
  {
    name: 'create-task/with-priority',
    input: 'tarefa urgente: entregar relatório para o cliente até hoje',
    mustContain: ['relatório'],
    idealOutput: 'Tarefa criada: Entregar relatório para o cliente — hoje, prioridade alta.',
    tags: ['task-creation', 'priority'],
  },
  {
    name: 'pending-task/add-date-before-confirming',
    input: 'vamos fazer amanhã',
    contextOverrides: {
      pendingTasks: [
        makePendingTask({
          id: 'pending-vpn-no-date',
          suggested_title: 'Configurar VPN no tablet e note da au',
          suggested_due_date: null,
        }),
      ],
    },
    mustContain: ['amanhã'],
    mustNotContain: ['confirmada', 'sem data'],
    mustCallTool: ['update_pending_task'],
    mustNotCallTool: ['confirm_pending_task'],
    idealOutput:
      'Perfeito — deixei para amanhã. Ela continua na aba Integrações para você aprovar.',
    tags: ['pending-task', 'date-update', 'tool-calling'],
  },
  {
    name: 'web-task/update-focused-task-due-date',
    channel: 'web',
    input: 'o presente tem que ser comprado até amanhã no fim do dia',
    contextOverrides: {
      mode: 'task',
      focusedTask: makeTask({
        id: 'task-present-mothers-day',
        title: 'Comprar presente da AU para o Dia das Mães',
        description: 'O presente do dia das mães tem que ser comprado até amanhã',
        due_date: null,
        priority: 'medium',
      }),
    },
    mustContain: ['amanhã'],
    mustNotContain: ['sem data', 'não consegui'],
    mustCallTool: ['update_task'],
    idealOutput:
      'Atualizei o prazo para amanhã no fim do dia.',
    tags: ['web', 'task-mode', 'date-update', 'tool-calling'],
  },
  {
    name: 'web/multi-edit-clear-jarvi-due-dates',
    channel: 'web',
    input: 'pode retirar as datas das tasks da categoria Jarvi?',
    contextOverrides: {
      activeTasks: [
        makeTask({
          id: 'task-jarvi-p1',
          title: 'P1 Botão Conectar no Apps muda quando está conectado',
          category: 'Jarvi',
          due_date: YESTERDAY,
        }),
        makeTask({
          id: 'task-jarvi-p2',
          title: 'P2 Tag do Whatsapp Conectado aparece ser custom',
          category: 'Jarvi',
          due_date: YESTERDAY,
        }),
        makeTask({
          id: 'task-personal-present',
          title: 'Comprar presente da AU para Dia das Mães',
          category: 'Pessoal',
          due_date: YESTERDAY,
        }),
      ],
    },
    mustContain: ['datas'],
    mustCallTool: ['update_task'],
    mustCallToolCount: { update_task: 2 },
    idealOutput: 'Pronto, tirei as datas das duas tarefas da categoria Jarvi.',
    tags: ['web', 'multi-edit', 'clear-date', 'tool-calling'],
  },

  // ── Overdue handling ─────────────────────────────────────────────────────────
  {
    name: 'overdue/should-not-prioritize-past-time',
    input: 'o que eu devo priorizar agora?',
    contextOverrides: {
      activeTasks: [
        makeTask({ title: 'Reunião com Mendes', due_date: TODAY, time: '11:00' }),
        makeTask({ title: 'Enviar contrato', due_date: TODAY }),
        makeTask({ title: 'Tarefas atrasadas', due_date: YESTERDAY }),
      ],
    },
    mustContain: ['Enviar contrato'],
    mustNotContain: [
      'prioridade é: Reunião com Mendes',
      'priorize Reunião com Mendes',
      'comece pela Reunião com Mendes',
      '⏰',
      '📌',
      '✚',
      '✅',
    ],
    idealOutput: 'Priorize Enviar contrato, que é para hoje. A Reunião com Mendes já passou; posso te ajudar a reagendar ou concluir.',
    tags: ['overdue', 'priority', 'time-aware'],
  },

  // ── Memory / personal context ────────────────────────────────────────────────
  {
    name: 'memory/uses-preferred-name',
    input: 'oi',
    contextOverrides: {
      preferredName: 'Doug',
      activeTasks: [],
    },
    mustContain: ['Doug'],
    mustNotContain: ['Hoje é', 'não encontrei tarefas', 'Posso te ajudar com:', 'tarefas vencidas'],
    idealOutput: 'Oi, Doug! Como posso te ajudar hoje?',
    tags: ['memory', 'greeting', 'personalization'],
  },

  // ── Jarvi voice ──────────────────────────────────────────────────────────────
  {
    name: 'voice/asks-scope-before-listing',
    input: 'quais são minhas tarefas?',
    contextOverrides: {
      activeTasks: [
        makeTask({ title: 'Task A', due_date: TODAY }),
        makeTask({ title: 'Task B', due_date: TOMORROW }),
      ],
    },
    mustContain: ['hoje', 'semana'],
    mustNotContain: ['**', '###', '```', '- [', 'Task A', 'Task B'],
    idealOutput: 'Quer ver as de hoje, da semana, ou todas?',
    tags: ['voice', 'scope', 'clarification'],
  },
  {
    name: 'voice/concise-response',
    input: 'qual minha próxima tarefa?',
    contextOverrides: {
      activeTasks: [
        makeTask({ title: 'Revisar slides', due_date: TODAY, time: '15:00' }),
      ],
    },
    mustContain: ['Revisar slides'],
    idealOutput: 'Revisar slides às 15:00.',
    tags: ['voice', 'conciseness'],
  },

  // ── Error / edge cases ───────────────────────────────────────────────────────
  {
    name: 'edge/empty-task-list',
    input: 'mostre minhas tarefas',
    contextOverrides: {
      activeTasks: [],
    },
    mustNotContain: ['undefined', 'null', 'error'],
    idealOutput: 'Você não tem tarefas ativas no momento. Quer criar uma?',
    tags: ['edge', 'empty-state'],
  },
  {
    name: 'edge/unrelated-question',
    input: 'qual a capital do brasil?',
    mustContain: ['Brasília'],
    mustNotContain: ['erro', 'error', 'não consigo'],
    idealOutput: 'A capital do Brasil é Brasília.',
    tags: ['edge', 'off-topic'],
  },
];
