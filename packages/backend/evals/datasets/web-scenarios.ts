/**
 * Evaluation scenarios for the Web agent.
 *
 * Complements whatsapp-scenarios.ts with coverage for the web channel:
 * general mode (chat panel) and task mode (focused task sidebar).
 */

import { addDays, makeCategory, makeTask, nextWeekday, todayIso, WEEKDAY } from '../helpers';
import type { EvalScenario } from './whatsapp-scenarios';

const TODAY = todayIso();
const TOMORROW = addDays(TODAY, 1);
const YESTERDAY = addDays(TODAY, -1);
const SATURDAY = nextWeekday(TODAY, WEEKDAY.sabado);
const SATURDAY_DISPLAY = SATURDAY.split('-').slice(1).reverse().join('/');
// Every day the agent could silently pick when told only "essa semana".
const THIS_WEEK_DAYS = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i));
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
    idealOutput: 'Poxa, revisar contrato ainda hoje é puxado. Já deixei a tarefa pronta. Se faltar como lembrar, oferece isso num offer_choices.',
    tags: ['web', 'task-creation', 'tool-calling'],
  },
  {
    name: 'web/create-multiple-tasks',
    channel: 'web',
    input: 'cria duas tarefas: pagar conta de luz e renovar seguro do carro',
    mustCallTool: ['create_task'],
    mustCallToolCount: { create_task: 2 },
    mustContain: ['luz', 'seguro'],
    idealOutput: 'Deixei as duas tarefas prontas e desbloqueio uma de cada vez, com uma pergunta (offer_choices) se faltar prazo.',
    tags: ['web', 'task-creation', 'multi-create', 'tool-calling'],
  },
  {
    name: 'web/create-task-offer-one-choice',
    channel: 'web',
    input: 'preciso marcar oftalmo',
    mustCallTool: ['create_task', 'offer_choices'],
    mustNotContain: ['Embaixo', 'Ainda falta combinar', 'Particular', 'Pelo convênio'],
    idealOutput:
      'Cria a tarefa e oferece UMA pergunta com opções (prazo). Não lista dia, local e lembrete juntos.',
    tags: ['web', 'task-creation', 'offer-choices', 'tool-calling'],
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
    idealOutput: 'Feito! Tarefa criada (sem categoria, já que nenhuma das existentes se encaixa).',
    tags: ['web', 'task-creation', 'category', 'no-invent'],
  },

  // ── Task mentions in prose ────────────────────────────────────────────────
  // Naming an existing task in the chat must use the `{{task:id|title}}`
  // token (rendered as the clickable task mention), not bold or quotes.
  {
    name: 'web/priority-answer-uses-task-mention',
    channel: 'web',
    // "hoje" pins the scope so the scenario measures the mention, not the
    // "qual período?" clarification the agent may ask for an open question.
    input: 'oq preciso priorizar hoje',
    contextOverrides: {
      activeTasks: [
        makeTask({ id: 'task-irpf', title: 'Pagar IRPF atrasado', priority: 'high', due_date: TODAY }),
        makeTask({ id: 'task-mercado', title: 'Fazer compras do mês', due_date: TODAY }),
      ],
    },
    mustNotCallTool: ['create_task', 'update_task', 'search_tasks'],
    // Rules run on the raw text (the mention token); the judge sees the
    // token collapsed to the quoted title, hence the plain idealOutput.
    mustContain: ['{{task:task-irpf|'],
    mustNotContain: ['**Pagar IRPF atrasado**', '"Pagar IRPF atrasado"', '**{{task:'],
    idealOutput:
      'Doug, hoje a prioridade é "Pagar IRPF atrasado" (prioridade alta). Depois vem "Fazer compras do mês". Curto, sem listar campos da tarefa.',
    tags: ['web', 'priority', 'task-mention'],
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
      'Feito! Prioridade da tarefa "Entregar relatório trimestral" aumentada para alta (a tarefa vence amanhã).',
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
    mustContain: ['documento'],
    mustNotContain: ['não consigo', 'erro', 'Resumo', 'Atualização salva'],
    idealOutput: 'Pronto, atualizei a descrição. Pergunta curta opcional se faltar um detalhe (ex. qual documento).',
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
    idealOutput: 'Feito! Reagendei para amanhã.',
    tags: ['web', 'overdue', 'reschedule', 'tool-calling'],
  },

  // ── Multi-turn ─────────────────────────────────────────────────────────────
  {
    // Web deadline follow-up: turn 1 creates the task without a date (and per
    // the web rules asks the prazo question via offer_choices); the user's
    // one-word answer in turn 2 must become an update_task with the resolved
    // due_date — not a new task, not just a chat confirmation.
    name: 'web/multiturn-deadline-followup',
    channel: 'web',
    turns: [
      {
        input: 'preciso marcar oftalmo',
        mustCallTool: ['create_task'],
      },
      {
        input: 'amanhã',
        mustCallTool: ['update_task'],
        mustNotCallTool: ['create_task'],
        mustCallToolArgs: [
          { tool: 'update_task', arg: 'due_date', value: TOMORROW },
        ],
      },
    ],
    tags: ['web', 'multiturn', 'deadline-followup', 'tool-calling'],
  },
  {
    // A period is not a deadline. Answering the prazo question with "essa
    // semana" must narrow to concrete days via offer_choices; resolving it to
    // a week boundary behind the user's back is the bug this guards.
    name: 'web/multiturn-periodo-vago-prazo',
    channel: 'web',
    turns: [
      {
        input: 'preciso comprar as coisas do aniversário da Chloe',
        mustCallTool: ['create_task'],
      },
      {
        // A period is not a deadline: no day of it may be written without the
        // user naming one. The follow-up should also go out as offer_choices,
        // but the agent never calls that tool in any scenario today, so
        // asserting it here would only add a permanently red test.
        input: 'essa semana',
        mustNotCallToolArgs: THIS_WEEK_DAYS.flatMap((day) => [
          { tool: 'update_task', arg: 'due_date', value: day },
          { tool: 'create_task', arg: 'due_date', value: day },
        ]),
      },
    ],
    tags: ['web', 'multiturn', 'deadline-followup', 'vague-period', 'tool-calling'],
  },
  {
    // Regression: after the due date is already saved, "ok" to "shall I
    // continue with the other task?" must start that other task — not
    // re-apply the same due date on the one just finished.
    name: 'web/ok-continues-next-task',
    channel: 'web',
    contextOverrides: {
      preferredName: 'doug',
      activeTasks: [
        makeTask({
          id: 'task-salao-chloe',
          title: 'Reservar salão de niver da Chloe',
          due_date: SATURDAY,
        }),
        makeTask({
          id: 'task-compras-chloe',
          title: 'Comprar coisas pra festa da Chloe',
        }),
      ],
    },
    seedHistory: [
      {
        role: 'user',
        content: `Sábado, ${SATURDAY_DISPLAY}`,
      },
      {
        role: 'assistant',
        content:
          `Boa, doug. Já deixei **Reservar salão de niver da Chloe** com prazo para sábado, ${SATURDAY_DISPLAY}.\n\nSe quiser, agora eu sigo com a outra tarefa da Chloe.`,
      },
    ],
    input: 'ok',
    mustCallTool: ['offer_choices'],
    mustNotCallTool: ['update_task'],
    mustNotUpdateTaskIds: ['task-salao-chloe'],
    mustNotContain: ['atualizei a data'],
    idealOutput:
      'Começa a outra tarefa da Chloe (Comprar coisas pra festa) perguntando o prazo via offer_choices. Não chama update_task de novo no salão.',
    tags: ['web', 'onboarding', 'ack', 'next-task', 'tool-calling'],
  },
  {
    // Legacy path only: with reliable execution the journey is advanced and
    // closed by the backend (`onboardingJourney.ts`) — no tool exists for the
    // model to call. That path is covered by `reliable-execution.deterministic.ts`.
    name: 'web/onboarding-journey-close',
    channel: 'web',
    reliable: false,
    contextOverrides: {
      preferredName: 'doug',
      onboardingJourneyPending: true,
      activeTasks: [
        makeTask({
          id: 'task-salao-chloe',
          title: 'Reservar salão de niver da Chloe',
          due_date: SATURDAY,
        }),
        makeTask({
          id: 'task-compras-chloe',
          title: 'Comprar coisas pra festa da Chloe',
          due_date: SATURDAY,
        }),
      ],
    },
    seedHistory: [
      {
        role: 'user',
        content: 'Ainda não sei',
      },
      {
        role: 'assistant',
        content:
          'Tranquilo, doug. Deixei Comprar coisas pra festa da Chloe sem prazo por enquanto.\n\nComo você quer ser lembrado?',
      },
    ],
    input: 'Ainda não quero lembrete',
    mustCallTool: ['complete_onboarding_journey'],
    mustNotCallTool: ['offer_choices'],
    mustContain: ['esquerda', 'WhatsApp'],
    idealOutput:
      'Chama complete_onboarding_journey e fecha a jornada: painel à esquerda do chat para gerenciar tarefas, e Jarvi disponível no WhatsApp. Sem offer_choices.',
    tags: ['web', 'onboarding', 'journey-close', 'tool-calling'],
  },
];
