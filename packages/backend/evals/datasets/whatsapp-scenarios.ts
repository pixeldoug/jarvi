/**
 * Evaluation scenarios for the WhatsApp agent.
 *
 * Each scenario defines:
 *  - input:    user message
 *  - context:  AgentContext overrides (tasks, memory, pending tasks, etc.)
 *  - expected: what the ideal response should contain / do
 *  - tags:     categories for filtering / grouping in Braintrust UI
 */

import {
  addDays,
  makeCategory,
  makeTask,
  nextWeekday,
  offsetTimeToday,
  todayIso,
  WEEKDAY,
} from '../helpers';
/**
 * Gold-standard WhatsApp task-creation confirmation, mirroring the mandatory
 * format in `buildWhatsappExtras` (prompt.ts): bold title + 🗓️, a due-date
 * line (or none, for undated tasks), then a short prazo ask when undated.
 *
 * Deliberately describes the date the way the USER phrased it ("sexta às
 * 16h") rather than the resolved YYYY-MM-DD/weekday label: the exact
 * calendar date the model lands on for ambiguous relative expressions isn't
 * perfectly reproducible run-to-run even with a fixed seed (see the eval
 * report's "determinism caveat") — pinning a specific resolved date here
 * risks the grader marking a *correctly computed but differently-run* date
 * as a factual disagreement. RuleChecker's `mustCallToolArgs` already
 * asserts the exact due_date; this idealOutput only needs to establish the
 * expected FORMAT/behavior, not re-litigate the date math.
 */
function waConfirmation(
  title: string,
  dateAsUserSaidIt: string | null,
  reminderHint = 'Jarvi sugere um prazo adequado ao tipo de compromisso e pergunta se o usuário quer definir uma data.',
): string {
  return dateAsUserSaidIt
    ? `Salvo! Tarefa "${title}" criada, com o compromisso marcado para ${dateAsUserSaidIt}. ${reminderHint}`
    : `Salvo! Tarefa "${title}" criada, sem data. ${reminderHint}`;
}

const TODAY = todayIso();
const TOMORROW = addDays(TODAY, 1);
const NEXT_WEEK = addDays(TODAY, 7);
const IN_SEVEN_DAYS = addDays(TODAY, 7);
const YESTERDAY = addDays(TODAY, -1);
// Weekday-anchored dates — "sexta"/"quarta" must resolve to the REAL next
// occurrence of that weekday from today, not a fixed day-count (see
// `nextWeekday` in helpers.ts for why a fixed offset silently breaks on most
// days of the week).
const NEXT_WEDNESDAY = nextWeekday(TODAY, WEEKDAY.quarta);
const NEXT_FRIDAY = nextWeekday(TODAY, WEEKDAY.sexta);
// Move-out date used in implicit-deadline scenario (25 days out)
const MOVE_OUT_DATE = addDays(TODAY, 25);
const MOVE_OUT_DATE_DISPLAY = MOVE_OUT_DATE.split('-').slice(1).reverse().join('/'); // DD/MM
// Wall-clock-relative times for the overdue/priority scenario — "11:00" is
// only "already passed" if the suite happens to run after 11am. A time
// anchored to "now" keeps the HORÁRIO JÁ PASSOU semantics true regardless of
// when the eval runs.
const TIME_ALREADY_PASSED_TODAY = offsetTimeToday(-120);

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
    // 🗓️ is REQUIRED by the current prompt ("O emoji 🗓️ faz parte do
    // formato — sempre inclua"), so it must not be in mustNotContain.
    mustNotContain: ['sem data', '📋', '✅'],
    tags: ['task-creation'],
  },
  {
    name: 'create-task/no-date',
    input: 'lembrar de renovar o passaporte',
    // The current prompt instructs the agent to NEVER write a date line
    // (literally "sem data" or otherwise) when the task has no due date —
    // it should omit the line entirely and instead offer a suggested
    // deadline. 🗓️ is required in every creation confirmation.
    mustContain: ['passaporte'],
    mustCallTool: ['create_task'],
    mustNotContain: ['Esta semana', 'Prioridade média', '📋', '✅', 'sem data'],
    idealOutput:
      'Salvo! Tarefa "Renovar o passaporte" criada, sem data informada. Jarvi sugere um prazo com antecedência adequada (ex.: 30 dias antes) e pergunta se o usuário quer definir uma data.',
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
      // "sexta" must resolve to the REAL next Friday from today, not a
      // fixed +4-day offset (only correct if today happens to be Monday).
      { tool: 'create_task', arg: 'due_date', value: NEXT_FRIDAY },
    ],
    mustNotContain: ['anotado', 'vou anotar', 'registrado', 'me manda de novo'],
    idealOutput: waConfirmation('Consulta Otorrino', 'sexta às 16h'),
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
    idealOutput: waConfirmation('Dentista', 'amanhã às 10h'),
    tags: ['task-creation', 'implicit-intent', 'noun-date'],
  },
  {
    name: 'create-task/noun-plus-date-academia',
    input: 'academia quarta 7h',
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      // "quarta" = real next Wednesday from today, not a fixed +2-day offset.
      { tool: 'create_task', arg: 'due_date', value: NEXT_WEDNESDAY },
      { tool: 'create_task', arg: 'time', value: '07:00' },
    ],
    mustNotContain: ['anotado', 'vou anotar'],
    idealOutput: waConfirmation('Academia', 'quarta às 7h'),
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
    idealOutput: waConfirmation('Reunião com o CEO', 'amanhã às 9h'),
    tags: ['task-creation', 'implicit-intent', 'passive-form'],
  },
  {
    name: 'create-task/passive-tenho-consulta',
    input: 'tenho consulta sexta às 14h',
    mustCallTool: ['create_task'],
    mustCallToolArgs: [
      // "sexta" = real next Friday from today, not a fixed +4-day offset.
      { tool: 'create_task', arg: 'due_date', value: NEXT_FRIDAY },
      { tool: 'create_task', arg: 'time', value: '14:00' },
    ],
    mustNotContain: ['anotado', 'vou anotar', 'quer que eu crie'],
    idealOutput: waConfirmation('Consulta', 'sexta às 14h'),
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
    idealOutput: waConfirmation('Farmácia', 'hoje à tarde'),
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
    idealOutput: waConfirmation('Ligar para Carlos', 'amanhã cedo'),
    tags: ['task-creation', 'implicit-intent', 'audio-fragment'],
  },
  {
    name: 'create-task/audio-fragment-reuniao-board',
    input: 'reunião board semana que vem 14h',
    mustCallTool: ['create_task'],
    // "semana que vem" WITHOUT a specific weekday is ambiguous (could mean
    // the same weekday next week, next Monday, etc.) — per product decision,
    // the agent creates the task immediately (still respects "criação
    // imediata") but leaves due_date unset and asks the user which day they
    // mean, instead of silently guessing a date that might be wrong.
    mustNotCallToolArgs: [
      { tool: 'create_task', arg: 'due_date', value: NEXT_WEEK },
    ],
    mustCallToolArgs: [
      { tool: 'create_task', arg: 'time', value: '14:00' },
    ],
    mustContain: ['dia'],
    mustNotContain: ['anotado', 'vou anotar'],
    idealOutput:
      'Salvo! Tarefa "Reunião board" criada, sem data ainda. Jarvi pergunta qual dia da semana que vem o usuário quer dizer.',
    tags: ['task-creation', 'implicit-intent', 'audio-fragment', 'clarify-date'],
  },

  {
    name: 'create-task/soft-mention-still-creates',
    input: 'preciso passar na farmácia comprar a receita do meu filho qualquer hora dessas',
    mustCallTool: ['create_task'],
    mustNotCallToolArgs: [{ tool: 'create_task', arg: 'due_date', value: TODAY }],
    mustNotContain: [
      'quer que eu crie',
      'posso anotar',
      'quer que eu registre',
      'anotado',
      'vou anotar',
      'quer transformar isso em tarefa',
    ],
    idealOutput: waConfirmation(
      'Passar na farmácia para comprar a receita do meu filho',
      null,
      'Jarvi pergunta se o usuário quer adicionar um prazo.',
    ),
    tags: ['task-creation', 'implicit-intent', 'proactivity'],
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
    // No rule mandates the literal word "amanhã" in the confirmation — the
    // task-focused prompt only requires the update to actually happen and be
    // confirmed. The agent may legitimately confirm with the resolved date
    // (e.g. "06/07") instead of echoing the relative word, so assert on the
    // due_date it actually saved plus a generic "prazo" confirmation instead.
    mustContain: ['prazo'],
    mustNotContain: ['sem data', 'não consegui'],
    mustCallTool: ['update_task'],
    mustCallToolArgs: [
      { tool: 'update_task', arg: 'task_id', value: 'task-present-mothers-day' },
      { tool: 'update_task', arg: 'due_date', value: TOMORROW },
    ],
    idealOutput:
      'Atualizei o prazo para amanhã (fim do dia) — confirmação curta, sem repetir todos os outros detalhes da tarefa.',
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
    // The UI only renders an individual task card when there's a SINGLE
    // update_task call in the message (see ChatMessage.tsx:
    // `shouldSummarizeTaskUpdates` collapses >1 update into a generic "N
    // tarefas atualizadas" card with no titles) — with 2 updates here, naming
    // which tasks were affected in the text is the ONLY way the user finds
    // out, so the ideal should expect the titles to be named, not omitted.
    idealOutput:
      'Pronto — tirei as datas das tarefas "P1 Botão Conectar no Apps muda quando está conectado" e "P2 Tag do Whatsapp Conectado aparece ser custom" (categoria Jarvi).',
    tags: ['web', 'multi-edit', 'clear-date', 'tool-calling'],
  },

  // ── Overdue handling ─────────────────────────────────────────────────────────
  {
    name: 'overdue/should-not-prioritize-past-time',
    input: 'o que eu devo priorizar agora?',
    contextOverrides: {
      activeTasks: [
        // Anchored to "now minus 2h" instead of a fixed "11:00" — a fixed
        // clock time only represents an ALREADY-PASSED same-day appointment
        // if the suite happens to run after that hour. Anchoring to "now"
        // keeps this scenario's HORÁRIO JÁ PASSOU premise true at any time
        // of day the eval runs.
        makeTask({ title: 'Reunião com Mendes', due_date: TODAY, time: TIME_ALREADY_PASSED_TODAY }),
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
    idealOutput: 'Sua próxima tarefa é: Revisar slides, hoje às 15:00.',
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
