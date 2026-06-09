/**
 * Evaluation scenarios for the WhatsApp agent.
 *
 * Each scenario defines:
 *  - input:    user message
 *  - context:  AgentContext overrides (tasks, memory, pending tasks, etc.)
 *  - expected: what the ideal response should contain / do
 *  - tags:     categories for filtering / grouping in Braintrust UI
 */

import { addDays, makeCategory, makePendingTask, makeTask, todayIso } from '../helpers';

const TODAY = todayIso();
const TOMORROW = addDays(TODAY, 1);
const NEXT_WEEK = addDays(TODAY, 7);
const IN_TWO_DAYS = addDays(TODAY, 2);
const IN_FOUR_DAYS = addDays(TODAY, 4);
const IN_SEVEN_DAYS = addDays(TODAY, 7);
const YESTERDAY = addDays(TODAY, -1);
// Move-out date used in implicit-deadline scenario (25 days out)
const MOVE_OUT_DATE = addDays(TODAY, 25);
const MOVE_OUT_DATE_DISPLAY = MOVE_OUT_DATE.split('-').slice(1).reverse().join('/'); // DD/MM

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
    categories?: ReturnType<typeof makeCategory>[];
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
  /** Tool argument expectations. At least one call to tool must include arg === value. */
  mustCallToolArgs?: Array<{ tool: string; arg: string; value: string | null }>;
  /** Tool argument exclusions. No call to tool must include arg === value. */
  mustNotCallToolArgs?: Array<{ tool: string; arg: string; value: string | null }>;
  /** Task IDs that must be updated via update_task. */
  mustUpdateTaskIds?: string[];
  /** Task IDs that must not be updated via update_task. */
  mustNotUpdateTaskIds?: string[];
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
    mustContain: ['hoje'],
    mustNotContain: ['undefined', 'null', 'NaN'],
    tags: ['briefing', 'empty-state'],
  },

  // ── Task creation ────────────────────────────────────────────────────────────
  {
    name: 'create-task/simple',
    input: 'preciso ligar para o João amanhã às 10h',
    mustContain: ['João'],
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'due_date', value: TOMORROW },
      { tool: 'create_task', arg: 'time', value: '10:00' },
    ],
    mustNotContain: ['sem data', '📋', '🗓️', '✅'],
    tags: ['task-creation'],
  },
  {
    name: 'create-task/no-date',
    input: 'lembrar de renovar o passaporte',
    mustContain: ['passaporte', 'sem data'],
    mustCallTool: ['create_task'],
    mustNotContain: ['Esta semana', 'Prioridade média', '📋', '🗓️', '✅'],
    tags: ['task-creation', 'no-date'],
  },
  {
    name: 'create-task/with-priority',
    input: 'tarefa urgente: entregar relatório para o cliente até hoje',
    mustContain: ['relatório'],
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'priority', value: 'high' },
      { tool: 'create_task', arg: 'due_date', value: TODAY },
    ],
    tags: ['task-creation', 'priority'],
  },
  {
    name: 'create-task/relative-deadline-before-seven-days',
    channel: 'web',
    input: 'cancelar o jogo draw do iPad ANTES de 7 dias',
    mustContain: ['Draw', 'iPad'],
    mustNotContain: ['sem data', 'algum prazo', 'prazo específico'],
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'due_date', value: IN_SEVEN_DAYS },
    ],
    idealOutput:
      'Feito. Tem alguma informação sobre como cancelar o Draw no iPad?',
    tags: ['task-creation', 'relative-date', 'tool-calling'],
  },
  {
    name: 'create-task/appointment-block-no-intent-verb',
    input: 'consulta Otorrino sexta, 16h00 Dr Rodrigo Reis 420reais. Clinica CentralMed dia 15',
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'time', value: '16:00' },
      { tool: 'create_task', arg: 'due_date', value: IN_FOUR_DAYS },
    ],
    mustNotContain: ['anotado', 'vou anotar', 'registrado', 'me manda de novo'],
    idealOutput:
      'Consulta com otorrino Dr Rodrigo Reis — tarefa criada.',
    tags: ['task-creation', 'implicit-intent', 'appointment'],
  },
  // ── Substantivo + data (sem verbo de intenção) ───────────────────────────────
  {
    name: 'create-task/noun-plus-date-dentista',
    input: 'dentista amanhã às 10h',
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'due_date', value: TOMORROW },
      { tool: 'create_task', arg: 'time', value: '10:00' },
    ],
    mustNotContain: ['anotado', 'vou anotar', 'qual dentista', 'mais detalhes'],
    idealOutput: 'Dentista — tarefa criada.',
    tags: ['task-creation', 'implicit-intent', 'noun-date'],
  },
  {
    name: 'create-task/noun-plus-date-academia',
    input: 'academia quarta 7h',
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'due_date', value: IN_TWO_DAYS },
      { tool: 'create_task', arg: 'time', value: '07:00' },
    ],
    mustNotContain: ['anotado', 'vou anotar'],
    idealOutput: 'Academia — tarefa criada.',
    tags: ['task-creation', 'implicit-intent', 'noun-date'],
  },

  // ── Forma passiva / "tenho" ───────────────────────────────────────────────────
  {
    name: 'create-task/passive-tenho-reuniao',
    input: 'tenho reunião amanhã às 9h com o CEO',
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'due_date', value: TOMORROW },
      { tool: 'create_task', arg: 'time', value: '09:00' },
    ],
    mustNotContain: ['anotado', 'vou anotar', 'quer que eu crie'],
    idealOutput: 'Reunião com o CEO — tarefa criada.',
    tags: ['task-creation', 'implicit-intent', 'passive-form'],
  },
  {
    name: 'create-task/passive-tenho-consulta',
    input: 'tenho consulta sexta às 14h',
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'due_date', value: IN_FOUR_DAYS },
      { tool: 'create_task', arg: 'time', value: '14:00' },
    ],
    mustNotContain: ['anotado', 'vou anotar', 'quer que eu crie'],
    idealOutput: 'Consulta — tarefa criada.',
    tags: ['task-creation', 'implicit-intent', 'passive-form'],
  },

  // ── Áudio transcrito / fragmento sem verbo ───────────────────────────────────
  {
    name: 'create-task/audio-fragment-farmacia',
    input: 'farmácia hoje à tarde',
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'due_date', value: TODAY },
    ],
    mustNotContain: ['anotado', 'vou anotar', 'o que você precisa na farmácia'],
    idealOutput: 'Farmácia — tarefa criada.',
    tags: ['task-creation', 'implicit-intent', 'audio-fragment'],
  },
  {
    name: 'create-task/audio-fragment-liga-carlos',
    input: 'liga pro Carlos amanhã cedo',
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'due_date', value: TOMORROW },
    ],
    mustNotContain: ['anotado', 'vou anotar', 'quem é Carlos'],
    idealOutput: 'Ligar para o Carlos — tarefa criada.',
    tags: ['task-creation', 'implicit-intent', 'audio-fragment'],
  },
  {
    name: 'create-task/audio-fragment-reuniao-board',
    input: 'reunião board semana que vem 14h',
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'due_date', value: NEXT_WEEK },
      { tool: 'create_task', arg: 'time', value: '14:00' },
    ],
    mustNotContain: ['anotado', 'vou anotar'],
    idealOutput: 'Reunião com o board — tarefa criada.',
    tags: ['task-creation', 'implicit-intent', 'audio-fragment'],
  },

  {
    name: 'create-task/implicit-deadline-before-event-date',
    input: `preciso ver o portão da casa nova para os gatos. minha saída da casa atual é dia ${MOVE_OUT_DATE_DISPLAY} e preciso ter isso resolvido antes`,
    mustCallTool: ['create_task'],
    // The due_date must NOT be the move-out date itself — the task must be done before that day
    mustNotCallToolArgs: [
      { tool: 'create_task', arg: 'due_date', value: MOVE_OUT_DATE },
    ],
    // idealOutput omitted — the key behavior is the due_date being before the move-out date,
    // which is already validated by mustCallTool + mustNotCallToolArgs above.
    tags: ['task-creation', 'temporal-reasoning', 'implicit-deadline'],
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
    // "aba Integrações" is still correct here — pending tasks (AI-initiated) still live there
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
    input: 'pode retirar as datas das tasks vencidas da categoria Jarvi?',
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
        makeTask({
          id: 'task-jarvi-future',
          title: 'Verificar disponibilidade jarvi.ai',
          category: 'Jarvi',
          due_date: TOMORROW,
        }),
      ],
    },
    mustContain: ['datas'],
    mustNotContain: ['P1/P2/P3/P4', 'limpar os títulos'],
    mustCallTool: ['update_task'],
    mustCallToolCount: { update_task: 2 },
    mustUpdateTaskIds: ['task-jarvi-p1', 'task-jarvi-p2'],
    mustNotUpdateTaskIds: ['task-personal-present', 'task-jarvi-future'],
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
    mustNotCallTool: ['create_task', 'update_task', 'delete_task', 'complete_task'],
    tags: ['edge', 'empty-state'],
  },
  {
    name: 'edge/unrelated-question',
    input: 'qual a capital do brasil?',
    mustContain: ['Brasília'],
    mustNotContain: ['erro', 'error', 'não consigo'],
    tags: ['edge', 'off-topic'],
  },
];
