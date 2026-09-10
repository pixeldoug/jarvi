/**
 * Unified tool registry: schemas + executors for every tool the agent can
 * invoke. The set of tools exposed to the model in any given turn is
 * filtered down by `profile.toolsAvailable`, so the WhatsApp adapter can
 * advertise just the task/memory subset while web sees the full surface.
 *
 * `create_task` writes directly to `tasks` for both channels.
 * WhatsApp tasks carry `source='whatsapp'` and `original_whatsapp_content`
 * so the WhatsApp chip is rendered in the UI.
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../../../database';
import { sanitizeTimeString, extractTimeFromText } from '../../../utils/taskTime';
import { hasIO, getIO } from '../../../utils/ioManager';
import {
  fetchRecentEmails,
  getGmailTokens,
  markEmailsAsProcessed,
} from '../../gmailService';
import { analyzeEmails } from '../../gmailAnalysisService';
import { persistMemory } from './memory';
import { mergeAgentDescriptionUpdate } from './taskDescriptionMerge';
import { prepareDescriptionForStorage } from './prepareDescriptionForStorage';
import {
  getTaskById,
  getUserCategories,
  normalizeTaskDueDate,
  normalizeTaskTime,
  resolveExistingCategoryName,
  safeParseCategoryNames,
  searchUserTasks,
} from './tasks';
import { formatDueDateLabel } from './time';
import {
  applyRemindersToTask,
  RECURRENCE_TOOL_PROPERTIES,
  REMINDERS_TOOL_PROPERTY,
  sanitizeRecurrenceType,
  sanitizeRecurrenceUntil,
  serializeRecurrenceConfig,
  summarizeRemindersForTool,
} from './taskRecurrenceReminder';
import { listRemindersForTask, rescheduleRemindersForTask } from '../../reminderService';
import { generateNextOccurrenceIfRecurring } from '../../recurrenceService';
import { recordTaskCreated } from '../../taskTelemetry';
import { searchWeb } from '../../webSearchService';
import { capitalizeTaskTitle } from '../../../utils/taskTitle';
import { reconcileDueDate } from './dateExpressions';
import { fetchOnboardingJourneyTasks, markOnboardingJourneyComplete } from './onboardingJourney';
import {
  decideNextQuestion,
  dueDateQuestion,
  periodQuestion,
  triadStateOf,
  type TriadPolicy,
} from './nextQuestion';
import type {
  AgentContext,
  AgentPendingQuestion,
  ChannelProfile,
  ListRow,
  CategoryRow,
  ToolExecutionResult,
  ToolName,
} from './types';

// ---------------------------------------------------------------------------
// Tool schemas (unified across channels)
// ---------------------------------------------------------------------------

const ALL_TOOLS: Record<ToolName, ChatCompletionTool> = {
  create_task: {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Cria uma nova tarefa para o usuário.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título da tarefa (conciso e descritivo)' },
          description: {
            type: 'string',
            description:
              'Descrição ou detalhes adicionais em Markdown. Segunda pessoa ("você"), nunca "o usuário". Use datas absolutas (DD/MM/AAAA), nunca "hoje"/"amanhã"/"ontem" — o texto é relido dias depois.',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Prioridade',
          },
          due_date: {
            type: 'string',
            description:
              'Data de vencimento no formato YYYY-MM-DD. Converta prazos relativos como "amanhã", "em até 7 dias", "antes de 7 dias" usando o calendário atual.',
          },
          time: {
            type: 'string',
            description:
              'Horário no formato HH:MM (24h). SEMPRE extraia e converta horários ditos pelo usuário: "13h30"→"13:30", "9h"→"09:00", "9h45"→"09:45", "às 14h"→"14:00", "1h30 da tarde"→"13:30", "meio-dia"→"12:00", "meia-noite"→"00:00". NÃO confunda com durações ("em 2h", "por 3h").',
          },
          category: { type: 'string', description: 'Categoria da tarefa' },
          ...RECURRENCE_TOOL_PROPERTIES,
          ...REMINDERS_TOOL_PROPERTY,
        },
        required: ['title'],
      },
    },
  },
  update_task: {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Atualiza campos de uma tarefa existente.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'ID da tarefa a atualizar' },
          title: { type: 'string' },
          description: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description:
              'Descrição completa atualizada em Markdown estruturado (## títulos, - listas, - [ ] checklists). Segunda pessoa ("você"), nunca "o usuário". Reescreva o documento inteiro de forma coerente: preserve fatos em Contexto/Atualizações, mas reavalie Próximos passos para refletir só ações ainda pendentes. Anexos da tarefa são preservados automaticamente pelo sistema. Use datas absolutas (DD/MM/AAAA), nunca "hoje"/"amanhã"/"ontem". Use null para limpar apenas quando não houver anexos.',
          },
          priority: {
            anyOf: [
              { type: 'string', enum: ['low', 'medium', 'high'] },
              { type: 'null' },
            ],
            description: 'Prioridade, ou null para limpar',
          },
          due_date: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Data de vencimento no formato YYYY-MM-DD, ou null para remover a data',
          },
          time: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description:
              'Horário no formato HH:MM (24h), ou null para remover o horário. Converta formatos ditos pelo usuário: "13h30"→"13:30", "9h"→"09:00", "às 14h"→"14:00", "meio-dia"→"12:00".',
          },
          category: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Categoria, ou null para limpar',
          },
          recurrence_type: RECURRENCE_TOOL_PROPERTIES.recurrence_type,
          recurrence_config: RECURRENCE_TOOL_PROPERTIES.recurrence_config,
          recurrence_until: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Data final da recorrência (YYYY-MM-DD), ou null para remover.',
          },
          reminders: REMINDERS_TOOL_PROPERTY.reminders,
        },
        required: ['task_id'],
      },
    },
  },
  complete_task: {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Marca uma tarefa como concluída.',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id'],
      },
    },
  },
  delete_task: {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Exclui permanentemente uma tarefa.',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id'],
      },
    },
  },
  search_tasks: {
    type: 'function',
    function: {
      name: 'search_tasks',
      description:
        'Busca tarefas do usuário no banco quando a informação NÃO está nas seções de tarefas já mostradas no contexto. Use para: detalhes de uma tarefa que só aparece no ÍNDICE, períodos fora dos próximos 7 dias ("o que tenho em julho?"), busca por texto/categoria/prioridade, ou tarefas concluídas. NÃO use se a tarefa já aparece em detalhe no contexto — responda direto para evitar latência.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Texto a procurar no título e na descrição (case-insensitive).',
          },
          category: { type: 'string', description: 'Filtrar por categoria exata.' },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Filtrar por prioridade.',
          },
          due_from: {
            type: 'string',
            description: 'Data inicial do período (YYYY-MM-DD), inclusive.',
          },
          due_to: {
            type: 'string',
            description: 'Data final do período (YYYY-MM-DD), inclusive.',
          },
          include_completed: {
            type: 'boolean',
            description: 'Se true, inclui tarefas concluídas. Padrão: false.',
          },
          limit: {
            type: 'number',
            description: 'Máximo de resultados (padrão 20, máximo 50).',
          },
        },
        required: [],
      },
    },
  },
  update_memory: {
    type: 'function',
    function: {
      name: 'update_memory',
      description:
        'Atualiza o perfil de memória do usuário. O campo summary deve conter TODO o conhecimento acumulado — mescle sempre com a memória anterior, nunca descarte.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description:
              'Perfil completo e acumulado do usuário: relacionamentos, preferências, hábitos, contexto pessoal e profissional. Em terceira pessoa, em português.',
          },
        },
        required: ['summary'],
      },
    },
  },
  create_list: {
    type: 'function',
    function: {
      name: 'create_list',
      description:
        'Cria um filtro personalizado (lista) para agrupar tarefas. Requer ao menos um critério: categorias, prioridade ou app conectado.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome da lista/filtro' },
          description: { type: 'string', description: 'Descrição opcional' },
          category_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nomes das categorias incluídas neste filtro',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Filtrar por prioridade',
          },
          connected_app: {
            type: 'string',
            enum: ['whatsapp'],
            description: 'Filtrar por app de origem',
          },
          show_completed: {
            type: 'boolean',
            description: 'Se false, oculta tarefas concluídas. Padrão: true',
          },
          filter_no_category: {
            type: 'boolean',
            description: 'Se true, mostra apenas tarefas SEM categoria atribuída',
          },
        },
        required: ['name'],
      },
    },
  },
  update_list: {
    type: 'function',
    function: {
      name: 'update_list',
      description: 'Atualiza um filtro/lista existente do usuário.',
      parameters: {
        type: 'object',
        properties: {
          list_id: { type: 'string', description: 'ID da lista a atualizar' },
          name: { type: 'string', description: 'Novo nome' },
          description: { type: 'string', description: 'Nova descrição' },
          category_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nova lista de categorias',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Novo filtro de prioridade (null para remover)',
          },
          connected_app: {
            type: 'string',
            enum: ['whatsapp'],
            description: 'Novo filtro de app (null para remover)',
          },
          show_completed: {
            type: 'boolean',
            description: 'Mostrar ou ocultar tarefas concluídas',
          },
          filter_no_category: {
            type: 'boolean',
            description: 'Se true, mostra apenas tarefas sem categoria',
          },
        },
        required: ['list_id'],
      },
    },
  },
  delete_list: {
    type: 'function',
    function: {
      name: 'delete_list',
      description: 'Exclui um filtro/lista do usuário.',
      parameters: {
        type: 'object',
        properties: {
          list_id: { type: 'string', description: 'ID da lista a excluir' },
        },
        required: ['list_id'],
      },
    },
  },
  show_list: {
    type: 'function',
    function: {
      name: 'show_list',
      description:
        'Exibe um filtro/lista existente como artefato clicável no chat, para que o usuário possa navegar até ele com um clique. Use sempre que mencionar ou recomendar uma lista existente.',
      parameters: {
        type: 'object',
        properties: {
          list_id: { type: 'string', description: 'ID da lista a exibir' },
        },
        required: ['list_id'],
      },
    },
  },
  create_category: {
    type: 'function',
    function: {
      name: 'create_category',
      description: 'Cria uma nova categoria para organizar as tarefas do usuário.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome da categoria' },
          color: { type: 'string', description: 'Cor em hex (ex: #FF5733)' },
          icon: { type: 'string', description: 'Ícone da categoria' },
        },
        required: ['name'],
      },
    },
  },
  update_category: {
    type: 'function',
    function: {
      name: 'update_category',
      description:
        'Atualiza uma categoria existente. Renomear propaga automaticamente para todas as tarefas e listas.',
      parameters: {
        type: 'object',
        properties: {
          category_id: { type: 'string', description: 'ID da categoria a atualizar' },
          name: { type: 'string', description: 'Novo nome' },
          color: { type: 'string', description: 'Nova cor em hex' },
          icon: { type: 'string', description: 'Novo ícone' },
          visible: { type: 'boolean', description: 'Visível na sidebar' },
        },
        required: ['category_id'],
      },
    },
  },
  delete_category: {
    type: 'function',
    function: {
      name: 'delete_category',
      description: 'Exclui uma categoria. As tarefas que pertenciam a ela ficam sem categoria.',
      parameters: {
        type: 'object',
        properties: {
          category_id: { type: 'string', description: 'ID da categoria a excluir' },
        },
        required: ['category_id'],
      },
    },
  },
  show_category: {
    type: 'function',
    function: {
      name: 'show_category',
      description:
        'Exibe uma categoria existente como artefato clicável no chat. Use sempre que mencionar ou recomendar uma categoria existente.',
      parameters: {
        type: 'object',
        properties: {
          category_id: { type: 'string', description: 'ID da categoria a exibir' },
        },
        required: ['category_id'],
      },
    },
  },
  scan_gmail: {
    type: 'function',
    function: {
      name: 'scan_gmail',
      description:
        'Analisa os emails recentes do Gmail do usuário e cria sugestões de tarefas para emails que requerem ação. Use quando o usuário pedir para verificar o Gmail, checar emails, ver se tem algo no email, ou qualquer variação disso.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  search_web: {
    type: 'function',
    function: {
      name: 'search_web',
      description:
        'Pesquisa na web um fato externo necessário para desbloquear uma tarefa: prazo oficial, telefone, endereço, horário de funcionamento, se um estabelecimento oferece um serviço. Não use para opinião, tutorial genérico, nem para o que o usuário já disse. No máximo 2 buscas por turno. Depois de receber o resultado, salve os fatos úteis na descrição da tarefa com update_task e fale pouco no chat.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Consulta específica em português, com cidade/país quando for local (ex: "ressonância magnética clínica Ubatuba telefone", "prazo IRPF 2026 Receita Federal").',
          },
        },
        required: ['query'],
      },
    },
  },
  offer_choices: {
    type: 'function',
    function: {
      name: 'offer_choices',
      description:
        'Exibe a pergunta como artefato de respostas rápidas (botões clicáveis) no chat web. Use SOMENTE quando você precisa de uma resposta agora e já tem 2 a 5 opções concretas. Uma pergunta por turno. Sirva para prazo, lembrete, convênio, qual clínica, sim/não, hoje/semana/todas. NÃO escreva as opções como bullets no texto. NÃO use para listar tarefas, fatos ou um formulário com vários campos ao mesmo tempo.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description:
              'A pergunta concreta mostrada acima dos botões (ex: "Quer particular ou convênio?").',
          },
          choices: {
            type: 'array',
            items: { type: 'string' },
            description:
              '2 a 5 opções curtas (até ~80 caracteres) que a pessoa pode tocar. Ex: ["Hoje","Amanhã","Essa semana"]; ["Particular","Pelo convênio"]; ["Fumagalli em Ubatuba","HOC em Caraguá"].',
          },
        },
        required: ['question', 'choices'],
      },
    },
  },
  // Legacy path only (reliable execution off): the web adapter does not expose
  // this tool when the backend runs the onboarding journey itself.
  complete_onboarding_journey: {
    type: 'function',
    function: {
      name: 'complete_onboarding_journey',
      description:
        'Encerra a jornada das primeiras tarefas do onboarding. Chame UMA ÚNICA VEZ, só no web, quando a tríade (o quê / quando / como lembrar) da ÚLTIMA tarefa da fila estiver resolvida. Sem parâmetros. Devolve a lista de tarefas organizadas para você fechar a conversa. NÃO chame em conversas normais fora do onboarding.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Strict schemas (entrega 1). Applied only with `profile.reliableExecution` so
// the flag-off path keeps sending the exact schemas the baseline was measured
// with. Patterns are what the server validates against (see toolValidation.ts);
// `additionalProperties: false` makes unknown keys drop instead of leaking into
// executors.
// ---------------------------------------------------------------------------

// Calendar-valid month/day; an optional time suffix is tolerated because
// `normalizeTaskDueDate` strips it ("2026-09-13T00:00:00" → "2026-09-13").
export const ISO_DATE_PATTERN = '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])(T.*)?$';
export const CLOCK_TIME_PATTERN = '^([01]?\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$';

const DATE_FIELDS = new Set(['due_date', 'due_from', 'due_to', 'recurrence_until']);
const TIME_FIELDS = new Set(['time']);

type SchemaNode = Record<string, unknown> & {
  type?: string;
  properties?: Record<string, SchemaNode>;
  anyOf?: SchemaNode[];
  items?: SchemaNode;
};

function strictifyNode(node: SchemaNode, key?: string): SchemaNode {
  const out: SchemaNode = { ...node };
  if (key && DATE_FIELDS.has(key) && out.type === 'string') out.pattern = ISO_DATE_PATTERN;
  if (key && TIME_FIELDS.has(key) && out.type === 'string') out.pattern = CLOCK_TIME_PATTERN;
  if (out.anyOf) out.anyOf = out.anyOf.map((branch) => strictifyNode(branch, key));
  if (out.items) out.items = strictifyNode(out.items);
  if (out.type === 'object' && out.properties) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, strictifyNode(v, k)]),
    );
    if (out.additionalProperties === undefined) out.additionalProperties = false;
  }
  return out;
}

export function strictifyTool(tool: ChatCompletionTool): ChatCompletionTool {
  if (tool.type !== 'function' || !tool.function.parameters) return tool;
  return {
    ...tool,
    function: {
      ...tool.function,
      parameters: strictifyNode(tool.function.parameters as SchemaNode),
    },
  };
}

export function getToolsForChannel(profile: ChannelProfile): ChatCompletionTool[] {
  const tools = profile.toolsAvailable.map((name) => ALL_TOOLS[name]).filter(Boolean);
  return profile.reliableExecution ? tools.map(strictifyTool) : tools;
}

export function getToolDefinition(name: string, profile: ChannelProfile): ChatCompletionTool | undefined {
  const tool = ALL_TOOLS[name as ToolName];
  if (!tool) return undefined;
  return profile.reliableExecution ? strictifyTool(tool) : tool;
}

// Set of tool names that cause task creation. Used by the anti-hallucination
// guardrail to detect "I created the task" claims that weren't backed by an
// actual tool call.
export const CREATION_TOOL_NAMES = new Set<ToolName>(['create_task']);
export const UPDATE_TOOL_NAMES = new Set<ToolName>(['update_task', 'complete_task']);

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

const PENDING_TASK_TTL_DAYS = 7;

/** "9:30" / "13:30:00" → "09:30". Leaves anything unparseable untouched. */
function normalizeClockTime(value: string | null): string | null {
  if (!value) return value;
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : value;
}

/**
 * Entrega 1 — the backend, not the model, has the last word on due_date when
 * the user's own words make the model's proposal impossible or premature.
 * Returns the value to persist plus notes for the model / operations record.
 */
function reconcileDueDateArg(
  proposed: string | null,
  ctx: AgentContext,
  profile: ChannelProfile,
): {
  dueDate: string | null;
  /** True when the model's value was deliberately not persisted. */
  held: boolean;
  notes: string[];
  pendingQuestion?: AgentPendingQuestion;
} {
  if (!profile.reliableExecution) return { dueDate: proposed, held: false, notes: [] };

  const decision = reconcileDueDate(
    proposed ?? undefined,
    ctx.originalUserMessage,
    ctx.timezone,
  );
  const notes: string[] = [];
  let pendingQuestion: AgentPendingQuestion | undefined = decision.pendingQuestion
    ? periodQuestion(decision.pendingQuestion.expression, ctx.timezone)
    : undefined;

  if (decision.action === 'hold') {
    if (decision.pastDate && profile.enableNextQuestionPolicy) {
      // The task must not be born overdue AND the prazo question is still
      // open: the backend asks it (the executor drops it again if the task
      // already had a prazo of its own).
      pendingQuestion = dueDateQuestion('past_date_held');
    }
    notes.push(
      decision.pastDate
        ? pendingQuestion
          ? `due_date NÃO salvo: ${decision.reason}. A tarefa não pode ficar vencida por uma data que a pessoa não escolheu. O sistema já perguntou ao usuário quando ele vai fazer — não pergunte de novo nem afirme um prazo.`
          : `due_date NÃO salvo: ${decision.reason}. A tarefa não pode ficar vencida por uma data que a pessoa não escolheu — pergunte quando ela vai fazer e não afirme um prazo.`
        : `due_date NÃO salvo: ${decision.reason}. O sistema já perguntou ao usuário qual dia — não pergunte de novo nem afirme um prazo.`,
    );
    return { dueDate: null, held: true, notes, pendingQuestion };
  }
  if (decision.action === 'correct' && decision.value) {
    notes.push(`due_date corrigido para ${decision.value}: ${decision.reason}.`);
    return { dueDate: decision.value, held: false, notes, pendingQuestion };
  }
  if (pendingQuestion) {
    notes.push(
      `Tarefa salva sem prazo: "${pendingQuestion.expression}" não define um dia. O sistema já perguntou ao usuário qual dia — não pergunte de novo.`,
    );
  }
  return { dueDate: proposed, held: false, notes, pendingQuestion };
}

async function executeCreateTask(
  args: Record<string, unknown>,
  ctx: AgentContext,
  profile: ChannelProfile,
): Promise<ToolExecutionResult> {
  const now = new Date().toISOString();
  const title = capitalizeTaskTitle(String(args.title || '').trim());
  if (!title) {
    return { success: false, error_code: 'invalid_arguments', message: 'title é obrigatório' };
  }

  const description = args.description
    ? prepareDescriptionForStorage(String(args.description), ctx.timezone)
    : null;
  const priority = args.priority ? String(args.priority) : null;
  const proposedDueDate = args.due_date ? normalizeTaskDueDate(String(args.due_date)) : null;
  const dueDecision = reconcileDueDateArg(proposedDueDate, ctx, profile);
  const dueDate = dueDecision.dueDate;
  // Deterministic safety net: if the model failed to extract the time, try to
  // recover it from the original user message ("quarta 13h30" → "13:30").
  const time = normalizeClockTime(
    sanitizeTimeString(args.time) ?? extractTimeFromText(ctx.originalUserMessage),
  );
  // Deterministic guard: only accept categories that already exist for this
  // user. Anything the model invents is dropped (null) so the curated set never
  // drifts. New categories must be created explicitly via create_category.
  const existingCategories = await getUserCategories(ctx.userId);
  const category = resolveExistingCategoryName(
    args.category ? String(args.category) : null,
    existingCategories,
  );

  const recurrenceType = sanitizeRecurrenceType(args.recurrence_type);
  const recurrenceConfig = serializeRecurrenceConfig(
    args.recurrence_config,
    recurrenceType,
    dueDate,
  );
  const recurrenceUntil = sanitizeRecurrenceUntil(args.recurrence_until);

  const source = profile.id === 'whatsapp' ? 'whatsapp' : 'manual';
  const originalContent = profile.id === 'whatsapp' ? (ctx.originalUserMessage ?? null) : null;

  const result = await executeCreateTaskAsActive(
    {
      title,
      description,
      priority,
      dueDate,
      time,
      category,
      recurrenceType,
      recurrenceConfig,
      recurrenceUntil,
      reminders: args.reminders,
      now,
      source,
      originalContent,
    },
    ctx,
  );

  if (dueDecision.notes.length) {
    result.notes = [...(result.notes ?? []), ...dueDecision.notes];
    if (result.data) result.data.notes = result.notes;
  }

  const createdId = result.entity?.id;
  let pendingQuestion = dueDecision.pendingQuestion;
  if (!pendingQuestion && result.success && createdId && triadPolicyEnabled(profile)) {
    // Tríade: a task is born → the state machine says what to ask first
    // (prazo, horário or lembrete) — the system asks, not the model.
    pendingQuestion = decideNextQuestion(
      {
        taskId: createdId,
        taskTitle: title,
        dueDate,
        time,
        remindersCount: Number(result.changes?.reminders_count ?? 0),
        skips: [],
      },
      triadPolicyFor(ctx),
    ) ?? undefined;
    if (pendingQuestion) {
      result.notes = [...(result.notes ?? []), systemAskedNote(pendingQuestion)];
      if (result.data) result.data.notes = result.notes;
    }
  }
  if (pendingQuestion) {
    result.pending_question = createdId ? { ...pendingQuestion, taskId: createdId, taskTitle: title } : pendingQuestion;
  }
  return result;
}

function triadPolicyEnabled(profile: ChannelProfile): boolean {
  return Boolean(profile.reliableExecution && profile.enableNextQuestionPolicy);
}

/** What the tríade can ask for this user (reminders need a way to deliver them). */
export function triadPolicyFor(ctx: AgentContext, extra: Partial<TriadPolicy> = {}): TriadPolicy {
  return { canRemind: Boolean(ctx.whatsappVerified), ...extra };
}

/** Executor note telling the model a system question is already on screen. */
export function systemAskedNote(question: AgentPendingQuestion): string {
  return `O sistema já perguntou ao usuário "${question.text}" (com opções). NÃO faça essa pergunta de novo — nem por texto, nem por offer_choices — e não ofereça "ajudar com" isso. Fique com a parte humana: 1-2 frases, ou nada.`;
}

interface CreateTaskInput {
  title: string;
  description: string | null;
  priority: string | null;
  dueDate: string | null;
  time: string | null;
  category: string | null;
  recurrenceType?: string;
  recurrenceConfig?: string | null;
  recurrenceUntil?: string | null;
  reminders?: unknown;
  now: string;
  source?: string;
  originalContent?: string | null;
}

async function executeCreateTaskAsActive(
  input: CreateTaskInput,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const taskId = uuidv4();
  const {
    title,
    description,
    priority,
    dueDate,
    time,
    category,
    recurrenceType = 'none',
    recurrenceConfig = null,
    recurrenceUntil = null,
    reminders,
    now,
  } = input;
  const source = input.source ?? 'manual';
  const originalContent = input.originalContent ?? null;

  if (isPostgreSQL()) {
    await getPool().query(
      `INSERT INTO tasks (id, user_id, title, description, priority, category, due_date, time, recurrence_type, recurrence_config, recurrence_until, source, original_whatsapp_content, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        taskId,
        ctx.userId,
        title,
        description,
        priority,
        category,
        dueDate,
        time,
        recurrenceType,
        recurrenceConfig,
        recurrenceUntil,
        source,
        originalContent,
        now,
        now,
      ],
    );
  } else {
    await getDatabase().run(
      `INSERT INTO tasks (id, user_id, title, description, priority, category, due_date, time, recurrence_type, recurrence_config, recurrence_until, source, original_whatsapp_content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        ctx.userId,
        title,
        description,
        priority,
        category,
        dueDate,
        time,
        recurrenceType,
        recurrenceConfig,
        recurrenceUntil,
        source,
        originalContent,
        now,
        now,
      ],
    );
  }

  const savedReminders = await applyRemindersToTask(taskId, ctx.userId, reminders, 'create');

  if (source === 'whatsapp' && hasIO()) {
    getIO().to(`user:${ctx.userId}`).emit('task:created', { id: taskId, source });
  }

  recordTaskCreated({
    email: ctx.email ?? '',
    source: source === 'whatsapp' ? 'whatsapp' : 'agent_web',
    taskId,
    priority,
    hasDueDate: !!dueDate,
    hasCategory: !!category,
    hasRecurrence: recurrenceType !== 'none',
  });

  // Deterministic, trustworthy date label (e.g. "Terça-feira, 16/05 às 17h00")
  // so the WhatsApp confirmation can echo it verbatim instead of letting the
  // model format the date itself (which drifts and can expose parsing errors).
  const dueLabel = formatDueDateLabel(
    normalizeTaskDueDate(dueDate),
    normalizeTaskTime(time),
  );

  const persisted = {
    id: taskId,
    title,
    description,
    priority,
    due_date: dueDate,
    time,
    category,
    recurrence_type: recurrenceType,
    recurrence_config: recurrenceConfig,
    due_label: dueLabel,
    reminders_count: savedReminders.length,
    reminders: summarizeRemindersForTool(savedReminders),
  };

  return {
    success: true,
    data: { ...persisted },
    changes: { ...persisted },
    entity: { type: 'task', id: taskId, title },
  };
}

async function executeCreateTaskAsPending(
  input: CreateTaskInput,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const pendingId = uuidv4();
  const { title, description, priority, dueDate, time, category, now } = input;

  const expiresAt = new Date(
    Date.now() + PENDING_TASK_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const whatsappContent = ctx.originalUserMessage ?? null;

  if (isPostgreSQL()) {
    await getPool().query(
      `INSERT INTO pending_tasks (
         id, user_id, source, raw_content, original_whatsapp_content,
         suggested_title, suggested_description, suggested_priority,
         suggested_due_date, suggested_time, suggested_category,
         status, whatsapp_phone, whatsapp_message_sid, expires_at,
         created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        pendingId,
        ctx.userId,
        'whatsapp',
        whatsappContent,
        whatsappContent,
        title,
        description,
        priority,
        dueDate,
        time,
        category,
        'awaiting_confirmation',
        ctx.whatsappPhone ?? null,
        ctx.whatsappMessageSid ?? null,
        expiresAt,
        now,
        now,
      ],
    );
  } else {
    await getDatabase().run(
      `INSERT INTO pending_tasks (
         id, user_id, source, raw_content, original_whatsapp_content,
         suggested_title, suggested_description, suggested_priority,
         suggested_due_date, suggested_time, suggested_category,
         status, whatsapp_phone, whatsapp_message_sid, expires_at,
         created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pendingId,
        ctx.userId,
        'whatsapp',
        whatsappContent,
        whatsappContent,
        title,
        description,
        priority,
        dueDate,
        time,
        category,
        'awaiting_confirmation',
        ctx.whatsappPhone ?? null,
        ctx.whatsappMessageSid ?? null,
        expiresAt,
        now,
        now,
      ],
    );
  }

  if (hasIO()) {
    getIO().to(`user:${ctx.userId}`).emit('pending-task:created', {
      id: pendingId,
      source: 'whatsapp',
    });
  }

  return { success: true, data: { id: pendingId, title, pending: true } };
}

async function executeUpdateTask(
  args: Record<string, unknown>,
  ctx: AgentContext,
  profile: ChannelProfile,
): Promise<ToolExecutionResult> {
  const now = new Date().toISOString();
  const taskId = String(args.task_id || '');
  if (!taskId) {
    return { success: false, error_code: 'invalid_arguments', message: 'task_id é obrigatório' };
  }

  const task = await getTaskById(taskId, ctx.userId);
  if (!task) {
    return {
      success: false,
      error_code: 'not_found',
      message: 'Tarefa não encontrada',
      entity: { type: 'task', id: taskId },
    };
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  // What this call actually wrote, post-normalization — the confirmation
  // echoes THIS, never the model's arguments.
  const changes: Record<string, unknown> = {};
  const notes: string[] = [];
  let pendingQuestion: AgentPendingQuestion | undefined;
  let paramIdx = 1;
  const ph = () => (isPostgreSQL() ? `$${paramIdx++}` : '?');
  // Legacy (flag off): "", "null", "undefined" are treated as a clear
  // request. With reliableExecution, validation already dropped those
  // sentinels upstream (→ keep), so only an explicit JSON null reaches here.
  const normalizeNullableField = (value: unknown): unknown => {
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed || ['null', 'undefined'].includes(trimmed.toLowerCase())) return null;
    return trimmed;
  };

  // Entrega 1 — a due_date the user's words can't support is not written:
  // the previous value stays until the user picks a concrete day.
  if (args.due_date !== undefined) {
    const proposed =
      args.due_date === null ? null : normalizeTaskDueDate(normalizeNullableField(args.due_date));
    const decision = reconcileDueDateArg(proposed, ctx, profile);
    if (decision.held) {
      delete args.due_date;
      notes.push(...decision.notes);
      notes.push('due_date anterior mantido.');
    } else {
      if (decision.notes.length) notes.push(...decision.notes);
      if (decision.dueDate !== proposed) args.due_date = decision.dueDate;
    }
    pendingQuestion = decision.pendingQuestion;
  } else if (profile.reliableExecution) {
    // No due_date proposed, but the user may still have named a period that
    // needs a day ("vou ver isso semana que vem") — ask, don't guess.
    const decision = reconcileDueDateArg(null, ctx, profile);
    pendingQuestion = decision.pendingQuestion;
    if (decision.notes.length) notes.push(...decision.notes);
  }

  let existingCategories: CategoryRow[] | null = null;
  const fieldKeys = [
    'title',
    'description',
    'priority',
    'due_date',
    'time',
    'category',
    'recurrence_type',
    'recurrence_config',
    'recurrence_until',
  ] as const;

  const write = (key: string, value: unknown): void => {
    fields.push(`${key} = ${ph()}`);
    values.push(value);
    changes[key] = value;
  };

  for (const key of fieldKeys) {
    if (args[key] === undefined) continue;

    if (key === 'description') {
      const merged = mergeAgentDescriptionUpdate(task.description, args[key], ctx.timezone);
      if (merged.skip) {
        if (args[key] === null) notes.push('description não limpa: a tarefa tem anexos protegidos.');
        continue;
      }
      write(key, merged.value);
      continue;
    }

    if (key === 'recurrence_type') {
      write(key, sanitizeRecurrenceType(args[key]));
      continue;
    }

    if (key === 'recurrence_config') {
      const recurrenceType = sanitizeRecurrenceType(
        args.recurrence_type !== undefined ? args.recurrence_type : task.recurrence_type,
      );
      const dueForConfig =
        args.due_date !== undefined
          ? normalizeNullableField(args.due_date) as string | null
          : normalizeTaskDueDate(task.due_date);
      write(key, serializeRecurrenceConfig(args[key], recurrenceType, dueForConfig));
      continue;
    }

    if (key === 'recurrence_until') {
      write(key, sanitizeRecurrenceUntil(normalizeNullableField(args[key])));
      continue;
    }

    if (key === 'title') {
      const normalized = normalizeNullableField(args[key]);
      write(key, typeof normalized === 'string' ? capitalizeTaskTitle(normalized) : normalized);
      continue;
    }

    if (key === 'time') {
      write(key, normalizeClockTime(sanitizeTimeString(args[key])));
    } else if (key === 'category') {
      // Allow clearing (null), but snap any non-null value to an existing
      // category so the agent can't introduce free-text drift.
      const normalized = normalizeNullableField(args[key]);
      if (normalized === null) {
        write(key, null);
      } else {
        if (!existingCategories) existingCategories = await getUserCategories(ctx.userId);
        const resolved = resolveExistingCategoryName(String(normalized), existingCategories);
        if (resolved === null && profile.reliableExecution) {
          // Unknown category: never invent one, never wipe the current one.
          // (Legacy path below keeps writing null, as the baseline did.)
          notes.push(`category "${String(normalized)}" ignorada: não existe; categoria anterior mantida.`);
          continue;
        }
        write(key, resolved);
      }
    } else if (key === 'due_date') {
      write(key, normalizeTaskDueDate(normalizeNullableField(args[key])));
    } else {
      write(key, normalizeNullableField(args[key]));
    }
  }

  // A held past date only leaves a question open when the task really has no
  // prazo of its own (the previous due_date, if any, stays).
  if (pendingQuestion?.reason === 'past_date_held' && normalizeTaskDueDate(task.due_date)) {
    pendingQuestion = undefined;
  }
  if (pendingQuestion) pendingQuestion = { ...pendingQuestion, taskId, taskTitle: task.title };

  if (!fields.length && args.reminders === undefined) {
    const result: ToolExecutionResult = {
      success: true,
      data: { id: taskId, title: task.title, unchanged: true, ...(notes.length ? { notes } : {}) },
      changes: {},
      unchanged: true,
      entity: { type: 'task', id: taskId, title: task.title },
      notes,
    };
    if (pendingQuestion) result.pending_question = pendingQuestion;
    return result;
  }

  if (fields.length) {
    fields.push(`updated_at = ${ph()}`);
    values.push(now);
    values.push(taskId);
    values.push(ctx.userId);

    const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ${ph()} AND user_id = ${ph()}`;
    if (isPostgreSQL()) {
      await getPool().query(sql, values);
    } else {
      await getDatabase().run(sql, values);
    }
  }

  let savedReminders: ReturnType<typeof summarizeRemindersForTool> | undefined;
  if (args.reminders !== undefined) {
    const created = await applyRemindersToTask(taskId, ctx.userId, args.reminders, 'replace');
    savedReminders = summarizeRemindersForTool(created);
    changes.reminders = savedReminders;
    changes.reminders_count = savedReminders.length;
  } else if (
    fields.some((f) => f.startsWith('due_date') || f.startsWith('time'))
  ) {
    await rescheduleRemindersForTask(taskId);
  }

  // When recurrence_type changes without an explicit config, rebuild defaults.
  if (args.recurrence_type !== undefined && args.recurrence_config === undefined) {
    const recurrenceType = sanitizeRecurrenceType(args.recurrence_type);
    const dueForConfig =
      args.due_date !== undefined
        ? (normalizeNullableField(args.due_date) as string | null)
        : normalizeTaskDueDate(task.due_date);
    const configJson = serializeRecurrenceConfig(null, recurrenceType, dueForConfig);
    if (isPostgreSQL()) {
      await getPool().query(
        'UPDATE tasks SET recurrence_config = $1 WHERE id = $2 AND user_id = $3',
        [configJson, taskId, ctx.userId],
      );
    } else {
      await getDatabase().run(
        'UPDATE tasks SET recurrence_config = ? WHERE id = ? AND user_id = ?',
        [configJson, taskId, ctx.userId],
      );
    }
  }

  const updated = await getTaskById(taskId, ctx.userId);
  const data: Record<string, unknown> =
    (updated as unknown as Record<string, unknown>) || { id: taskId };
  if (savedReminders !== undefined) {
    data.reminders_count = savedReminders.length;
    data.reminders = savedReminders;
  }
  const finalDue = normalizeTaskDueDate(updated?.due_date ?? null);
  const finalTime = normalizeTaskTime(updated?.time ?? null);
  // Deterministic label for the persisted schedule, so confirmations never
  // have to format dates themselves.
  if ('due_date' in changes || 'time' in changes) {
    changes.due_label = formatDueDateLabel(finalDue, finalTime);
    data.due_label = changes.due_label;
  }

  // Tríade transition: the task just got its first prazo (typically the
  // answer to the system's own date question) or this update IS the answer
  // to a pending system question about it → the state machine decides the
  // next question (horário, lembrete or nothing). Arbitrary later edits
  // (moving an old prazo) do not reopen the tríade.
  const gainedFirstDueDate =
    finalDue !== null && normalizeTaskDueDate(task.due_date) === null && 'due_date' in changes;
  const answersPendingQuestion = ctx.pendingQuestion?.taskId === taskId;
  if (updated && !pendingQuestion && triadPolicyEnabled(profile) && (gainedFirstDueDate || answersPendingQuestion)) {
    const remindersCount =
      savedReminders !== undefined
        ? savedReminders.length
        : (await listRemindersForTask(taskId, ctx.userId)).length;
    pendingQuestion = decideNextQuestion(
      triadStateOf(updated, remindersCount),
      triadPolicyFor(ctx, {
        // The person named a time the model dropped: never guess it, never ask it.
        timeNamedButUnsaved:
          finalTime === null && args.time === undefined && extractTimeFromText(ctx.originalUserMessage) !== null,
      }),
    ) ?? undefined;
    if (pendingQuestion) notes.push(systemAskedNote(pendingQuestion));
  }
  if (notes.length) data.notes = notes;

  const result: ToolExecutionResult = {
    success: true,
    data,
    changes,
    entity: { type: 'task', id: taskId, title: (updated?.title ?? task.title) as string },
    notes,
  };
  if (pendingQuestion) {
    result.pending_question = { ...pendingQuestion, taskId, taskTitle: (updated?.title ?? task.title) as string };
  }
  return result;
}

async function executeCompleteTask(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const now = new Date().toISOString();
  const taskId = String(args.task_id || '');
  if (!taskId) {
    return { success: false, error_code: 'invalid_arguments', message: 'task_id é obrigatório' };
  }

  // Fetch the title BEFORE mutating so both the model's confirmation text and
  // the UI's task card can reference it — without this, "concluída"/"deletada"
  // confirmations have no way to say WHICH task was affected.
  const existing = await getTaskById(taskId, ctx.userId);
  // Completing a task that doesn't exist used to "succeed" (UPDATE of 0 rows).
  // The result must be truthful or every confirmation built on it lies.
  if (!existing) {
    return {
      success: false,
      error_code: 'not_found',
      message: 'Tarefa não encontrada',
      entity: { type: 'task', id: taskId },
    };
  }

  if (isPostgreSQL()) {
    await getPool().query(
      'UPDATE tasks SET completed = TRUE, updated_at = $1 WHERE id = $2 AND user_id = $3',
      [now, taskId, ctx.userId],
    );
  } else {
    await getDatabase().run(
      'UPDATE tasks SET completed = 1, updated_at = ? WHERE id = ? AND user_id = ?',
      [now, taskId, ctx.userId],
    );
  }

  // Generate the next occurrence immediately for recurring tasks, mirroring
  // what taskController.toggleTaskCompletion does on the REST path. Without
  // this, completing a recurring task via the agent would leave the series
  // stalled until the next hourly cron sweep.
  if (existing.recurrence_type && existing.recurrence_type !== 'none') {
    await generateNextOccurrenceIfRecurring(taskId);
  }

  return {
    success: true,
    data: { id: taskId, title: existing.title, completed: true },
    changes: { completed: true },
    entity: { type: 'task', id: taskId, title: existing.title },
  };
}

async function executeDeleteTask(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const taskId = String(args.task_id || '');
  if (!taskId) {
    return { success: false, error_code: 'invalid_arguments', message: 'task_id é obrigatório' };
  }

  // Fetch BEFORE deleting — once the row is gone there's no way to recover
  // the title, and both the confirmation text and the UI's task card need it.
  const existing = await getTaskById(taskId, ctx.userId);
  if (!existing) {
    return {
      success: false,
      error_code: 'not_found',
      message: 'Tarefa não encontrada',
      entity: { type: 'task', id: taskId },
    };
  }

  if (isPostgreSQL()) {
    await getPool().query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [
      taskId,
      ctx.userId,
    ]);
  } else {
    await getDatabase().run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [
      taskId,
      ctx.userId,
    ]);
  }
  return {
    success: true,
    data: { id: taskId, title: existing.title, deleted: true },
    changes: { deleted: true },
    entity: { type: 'task', id: taskId, title: existing.title },
  };
}

async function executeUpdateMemory(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const summary = String(args.summary || '').trim();
  if (!summary) return { success: false, message: 'summary vazio' };
  await persistMemory(ctx.userId, summary);
  return { success: true };
}

function truncateDescription(value: string, maxLength = 200): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

async function executeSearchTasks(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const asString = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;

  const rows = await searchUserTasks(ctx.userId, {
    query: asString(args.query),
    category: asString(args.category),
    priority: asString(args.priority),
    dueFrom: asString(args.due_from),
    dueTo: asString(args.due_to),
    includeCompleted: args.include_completed === true,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
  });

  const tasks = rows.map((t) => ({
    id: t.id,
    title: t.title,
    due_date: normalizeTaskDueDate(t.due_date),
    time: normalizeTaskTime(t.time),
    priority: t.priority ?? null,
    category: t.category ?? null,
    completed: Boolean(t.completed),
    description: t.description?.trim() ? truncateDescription(t.description) : null,
  }));

  return { success: true, data: { count: tasks.length, tasks } };
}

// ---------------------------------------------------------------------------
// Lists & categories (web only)
// ---------------------------------------------------------------------------

async function executeCreateList(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const now = new Date().toISOString();
  const listName = String(args.name || '').trim();
  if (!listName) return { success: false, message: 'Nome da lista é obrigatório' };

  const categoryNames = Array.isArray(args.category_names)
    ? (args.category_names as string[]).map(String).filter(Boolean)
    : [];
  const priority = args.priority ? String(args.priority) : null;
  const connectedApp = args.connected_app ? String(args.connected_app) : null;
  const showCompleted = args.show_completed === false ? 0 : 1;
  const filterNoCategory = args.filter_no_category ? 1 : 0;

  if (categoryNames.length === 0 && !priority && !connectedApp && !filterNoCategory) {
    return {
      success: false,
      message:
        'Ao menos um critério de filtro é necessário (categoria, prioridade, app conectado ou sem categoria)',
    };
  }

  const listId = uuidv4();
  const categoryNamesJson = JSON.stringify(categoryNames);

  if (isPostgreSQL()) {
    await getPool().query(
      `INSERT INTO lists (id, user_id, name, category_names, priority, connected_app, show_completed, filter_no_category, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        listId,
        ctx.userId,
        listName,
        categoryNamesJson,
        priority,
        connectedApp,
        showCompleted,
        filterNoCategory,
        now,
        now,
      ],
    );
  } else {
    await getDatabase().run(
      `INSERT INTO lists (id, user_id, name, category_names, priority, connected_app, show_completed, filter_no_category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        listId,
        ctx.userId,
        listName,
        categoryNamesJson,
        priority,
        connectedApp,
        showCompleted,
        filterNoCategory,
        now,
        now,
      ],
    );
  }

  return {
    success: true,
    data: {
      id: listId,
      name: listName,
      category_names: categoryNames,
      priority,
      connected_app: connectedApp,
      show_completed: showCompleted === 1,
      filter_no_category: filterNoCategory === 1,
    },
    changes: { name: listName },
    entity: { type: 'list', id: listId, title: listName },
  };
}

async function executeUpdateList(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const now = new Date().toISOString();
  const listId = String(args.list_id || '');
  if (!listId) return { success: false, message: 'list_id é obrigatório' };

  let existing: ListRow | null = null;
  if (isPostgreSQL()) {
    const result = await getPool().query(
      'SELECT * FROM lists WHERE id = $1 AND user_id = $2',
      [listId, ctx.userId],
    );
    existing = (result.rows[0] as ListRow) || null;
  } else {
    existing =
      (await getDatabase().get<ListRow>(
        'SELECT * FROM lists WHERE id = ? AND user_id = ?',
        [listId, ctx.userId],
      )) || null;
  }
  if (!existing) {
    return {
      success: false,
      error_code: 'not_found',
      message: 'Lista não encontrada',
      entity: { type: 'list', id: listId },
    };
  }

  const newName = args.name ? String(args.name).trim() : existing.name;
  const newCategoryNames = Array.isArray(args.category_names)
    ? JSON.stringify((args.category_names as string[]).map(String).filter(Boolean))
    : existing.category_names;
  const newPriority =
    args.priority !== undefined
      ? args.priority
        ? String(args.priority)
        : null
      : existing.priority;
  const newConnectedApp =
    args.connected_app !== undefined
      ? args.connected_app
        ? String(args.connected_app)
        : null
      : existing.connected_app;
  const newShowCompleted =
    args.show_completed !== undefined
      ? args.show_completed
        ? 1
        : 0
      : existing.show_completed ?? 1;
  const newFilterNoCategory =
    args.filter_no_category !== undefined
      ? args.filter_no_category
        ? 1
        : 0
      : existing.filter_no_category ?? 0;

  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE lists SET name=$1, category_names=$2, priority=$3, connected_app=$4, show_completed=$5, filter_no_category=$6, updated_at=$7
       WHERE id=$8 AND user_id=$9`,
      [
        newName,
        newCategoryNames,
        newPriority,
        newConnectedApp,
        newShowCompleted,
        newFilterNoCategory,
        now,
        listId,
        ctx.userId,
      ],
    );
  } else {
    await getDatabase().run(
      `UPDATE lists SET name=?, category_names=?, priority=?, connected_app=?, show_completed=?, filter_no_category=?, updated_at=?
       WHERE id=? AND user_id=?`,
      [
        newName,
        newCategoryNames,
        newPriority,
        newConnectedApp,
        newShowCompleted,
        newFilterNoCategory,
        now,
        listId,
        ctx.userId,
      ],
    );
  }

  return {
    success: true,
    data: {
      id: listId,
      name: newName,
      priority: newPriority,
      connected_app: newConnectedApp,
      show_completed: newShowCompleted === 1,
      filter_no_category: newFilterNoCategory === 1,
    },
    changes: { name: newName },
    entity: { type: 'list', id: listId, title: newName },
  };
}

async function executeDeleteList(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const listId = String(args.list_id || '');
  if (!listId) return { success: false, error_code: 'invalid_arguments', message: 'list_id é obrigatório' };

  if (isPostgreSQL()) {
    await getPool().query('DELETE FROM lists WHERE id = $1 AND user_id = $2', [
      listId,
      ctx.userId,
    ]);
  } else {
    await getDatabase().run('DELETE FROM lists WHERE id = ? AND user_id = ?', [
      listId,
      ctx.userId,
    ]);
  }
  return {
    success: true,
    data: { id: listId, deleted: true },
    changes: { deleted: true },
    entity: { type: 'list', id: listId },
  };
}

async function executeShowList(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const listId = String(args.list_id || '');
  if (!listId) return { success: false, message: 'list_id é obrigatório' };

  let row: ListRow | null = null;
  if (isPostgreSQL()) {
    const result = await getPool().query(
      'SELECT * FROM lists WHERE id = $1 AND user_id = $2',
      [listId, ctx.userId],
    );
    row = (result.rows[0] as ListRow) || null;
  } else {
    row =
      (await getDatabase().get<ListRow>(
        'SELECT * FROM lists WHERE id = ? AND user_id = ?',
        [listId, ctx.userId],
      )) || null;
  }
  if (!row) return { success: false, message: 'Lista não encontrada' };

  return {
    success: true,
    data: {
      id: row.id,
      name: row.name,
      category_names: safeParseCategoryNames(row.category_names),
      priority: row.priority ?? null,
      connected_app: row.connected_app ?? null,
      show_completed: row.show_completed !== 0,
      filter_no_category: Boolean(row.filter_no_category),
    },
  };
}

async function executeCreateCategory(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const now = new Date().toISOString();
  const categoryName = String(args.name || '').trim();
  if (!categoryName) return { success: false, message: 'Nome da categoria é obrigatório' };

  const color = args.color ? String(args.color) : null;
  const icon = args.icon ? String(args.icon) : null;
  const categoryId = uuidv4();

  let position = 0;
  if (isPostgreSQL()) {
    const posResult = await getPool().query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM categories WHERE user_id = $1',
      [ctx.userId],
    );
    position = posResult.rows[0]?.next_pos ?? 0;
    await getPool().query(
      `INSERT INTO categories (id, user_id, name, color, icon, position, visible, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8)`,
      [categoryId, ctx.userId, categoryName, color, icon, position, now, now],
    );
  } else {
    const posResult = await getDatabase().get<{ next_pos: number }>(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM categories WHERE user_id = ?',
      [ctx.userId],
    );
    position = posResult?.next_pos ?? 0;
    await getDatabase().run(
      `INSERT INTO categories (id, user_id, name, color, icon, position, visible, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [categoryId, ctx.userId, categoryName, color, icon, position, now, now],
    );
  }

  return {
    success: true,
    data: { id: categoryId, name: categoryName, color, icon },
    changes: { name: categoryName },
    entity: { type: 'category', id: categoryId, title: categoryName },
  };
}

async function executeUpdateCategory(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const now = new Date().toISOString();
  const categoryId = String(args.category_id || '');
  if (!categoryId) return { success: false, message: 'category_id é obrigatório' };

  let existing: CategoryRow | null = null;
  if (isPostgreSQL()) {
    const result = await getPool().query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, ctx.userId],
    );
    existing = (result.rows[0] as CategoryRow) || null;
  } else {
    existing =
      (await getDatabase().get<CategoryRow>(
        'SELECT * FROM categories WHERE id = ? AND user_id = ?',
        [categoryId, ctx.userId],
      )) || null;
  }
  if (!existing) {
    return {
      success: false,
      error_code: 'not_found',
      message: 'Categoria não encontrada',
      entity: { type: 'category', id: categoryId },
    };
  }

  const newName = args.name ? String(args.name).trim() : existing.name;
  const newColor =
    args.color !== undefined ? (args.color ? String(args.color) : null) : existing.color;
  const newIcon =
    args.icon !== undefined ? (args.icon ? String(args.icon) : null) : existing.icon;
  const newVisible =
    args.visible !== undefined ? (args.visible ? 1 : 0) : existing.visible ?? 1;

  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE categories SET name=$1, color=$2, icon=$3, visible=$4, updated_at=$5
       WHERE id=$6 AND user_id=$7`,
      [newName, newColor, newIcon, newVisible, now, categoryId, ctx.userId],
    );
    if (newName !== existing.name) {
      await getPool().query(
        'UPDATE tasks SET category=$1 WHERE user_id=$2 AND category=$3',
        [newName, ctx.userId, existing.name],
      );
      const lists = await getPool().query(
        'SELECT id, category_names FROM lists WHERE user_id = $1',
        [ctx.userId],
      );
      for (const row of lists.rows) {
        const names = safeParseCategoryNames(row.category_names);
        const idx = names.indexOf(existing.name);
        if (idx !== -1) {
          names[idx] = newName;
          await getPool().query('UPDATE lists SET category_names=$1 WHERE id=$2', [
            JSON.stringify(names),
            row.id,
          ]);
        }
      }
    }
  } else {
    await getDatabase().run(
      `UPDATE categories SET name=?, color=?, icon=?, visible=?, updated_at=? WHERE id=? AND user_id=?`,
      [newName, newColor, newIcon, newVisible, now, categoryId, ctx.userId],
    );
    if (newName !== existing.name) {
      await getDatabase().run(
        'UPDATE tasks SET category=? WHERE user_id=? AND category=?',
        [newName, ctx.userId, existing.name],
      );
      const lists = await getDatabase().all<ListRow[]>(
        'SELECT id, category_names FROM lists WHERE user_id = ?',
        [ctx.userId],
      );
      for (const row of lists) {
        const names = safeParseCategoryNames(row.category_names);
        const idx = names.indexOf(existing.name);
        if (idx !== -1) {
          names[idx] = newName;
          await getDatabase().run('UPDATE lists SET category_names=? WHERE id=?', [
            JSON.stringify(names),
            row.id,
          ]);
        }
      }
    }
  }

  return {
    success: true,
    data: {
      id: categoryId,
      name: newName,
      color: newColor,
      icon: newIcon,
      visible: newVisible === 1,
    },
    changes: { name: newName },
    entity: { type: 'category', id: categoryId, title: newName },
  };
}

async function executeDeleteCategory(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const categoryId = String(args.category_id || '');
  if (!categoryId) return { success: false, message: 'category_id é obrigatório' };

  if (isPostgreSQL()) {
    const result = await getPool().query(
      'SELECT name FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, ctx.userId],
    );
    const categoryName = result.rows[0]?.name;
    await getPool().query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [
      categoryId,
      ctx.userId,
    ]);
    if (categoryName) {
      await getPool().query(
        'UPDATE tasks SET category=NULL WHERE user_id=$1 AND category=$2',
        [ctx.userId, categoryName],
      );
      const lists = await getPool().query(
        'SELECT id, category_names FROM lists WHERE user_id = $1',
        [ctx.userId],
      );
      for (const row of lists.rows) {
        const names = safeParseCategoryNames(row.category_names).filter(
          (n) => n !== categoryName,
        );
        await getPool().query('UPDATE lists SET category_names=$1 WHERE id=$2', [
          JSON.stringify(names),
          row.id,
        ]);
      }
    }
  } else {
    const row = await getDatabase().get<{ name: string }>(
      'SELECT name FROM categories WHERE id = ? AND user_id = ?',
      [categoryId, ctx.userId],
    );
    const categoryName = row?.name;
    await getDatabase().run('DELETE FROM categories WHERE id = ? AND user_id = ?', [
      categoryId,
      ctx.userId,
    ]);
    if (categoryName) {
      await getDatabase().run(
        'UPDATE tasks SET category=NULL WHERE user_id=? AND category=?',
        [ctx.userId, categoryName],
      );
      const lists = await getDatabase().all<ListRow[]>(
        'SELECT id, category_names FROM lists WHERE user_id = ?',
        [ctx.userId],
      );
      for (const listRow of lists) {
        const names = safeParseCategoryNames(listRow.category_names).filter(
          (n) => n !== categoryName,
        );
        await getDatabase().run('UPDATE lists SET category_names=? WHERE id=?', [
          JSON.stringify(names),
          listRow.id,
        ]);
      }
    }
  }

  return {
    success: true,
    data: { id: categoryId, deleted: true },
    changes: { deleted: true },
    entity: { type: 'category', id: categoryId },
  };
}

async function executeShowCategory(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const categoryId = String(args.category_id || '');
  if (!categoryId) return { success: false, message: 'category_id é obrigatório' };

  let row: CategoryRow | null = null;
  if (isPostgreSQL()) {
    const result = await getPool().query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, ctx.userId],
    );
    row = (result.rows[0] as CategoryRow) || null;
  } else {
    row =
      (await getDatabase().get<CategoryRow>(
        'SELECT * FROM categories WHERE id = ? AND user_id = ?',
        [categoryId, ctx.userId],
      )) || null;
  }
  if (!row) return { success: false, message: 'Categoria não encontrada' };

  return {
    success: true,
    data: { id: row.id, name: row.name, color: row.color ?? null, icon: row.icon ?? null },
  };
}

// ---------------------------------------------------------------------------
// Gmail (web only)
// ---------------------------------------------------------------------------

async function executeScanGmail(
  _args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const tokens = await getGmailTokens(ctx.userId);
  if (!tokens) {
    return {
      success: false,
      message:
        'Gmail não está conectado. O usuário precisa conectar o Gmail em Configurações → Apps → Gmail.',
    };
  }

  const emails = await fetchRecentEmails(ctx.userId);
  if (emails.length === 0) {
    return {
      success: true,
      data: { analyzed: 0, created: 0 },
      message: 'Nenhum email encontrado na caixa de entrada dos últimos 3 dias.',
    };
  }

  const results = await analyzeEmails(emails);
  let created = 0;
  const nowTs = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + PENDING_TASK_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const createdTitles: string[] = [];
  const successfullyAnalyzedIds: string[] = [];

  for (const { email, suggestion, analyzed } of results) {
    if (analyzed) successfullyAnalyzedIds.push(email.id);
    if (!suggestion.isActionable || !suggestion.title) continue;

    const pendingId = uuidv4();
    const rawContent = `De: ${email.from}\nAssunto: ${email.subject}\nData: ${email.date}\n\n${email.snippet}`;

    if (isPostgreSQL()) {
      await getPool().query(
        `INSERT INTO pending_tasks (
           id, user_id, source, gmail_message_id, raw_content,
           suggested_title, suggested_description, suggested_priority,
           suggested_due_date, suggested_category,
           status, expires_at, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO NOTHING`,
        [
          pendingId,
          ctx.userId,
          'gmail',
          email.id,
          rawContent,
          suggestion.title,
          suggestion.description,
          suggestion.priority,
          suggestion.due_date,
          suggestion.category,
          'awaiting_confirmation',
          expiresAt,
          nowTs,
          nowTs,
        ],
      );
    } else {
      await getDatabase().run(
        `INSERT OR IGNORE INTO pending_tasks (
           id, user_id, source, gmail_message_id, raw_content,
           suggested_title, suggested_description, suggested_priority,
           suggested_due_date, suggested_category,
           status, expires_at, created_at, updated_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          pendingId,
          ctx.userId,
          'gmail',
          email.id,
          rawContent,
          suggestion.title,
          suggestion.description,
          suggestion.priority,
          suggestion.due_date,
          suggestion.category,
          'awaiting_confirmation',
          expiresAt,
          nowTs,
          nowTs,
        ],
      );
    }

    if (hasIO()) {
      getIO().to(`user:${ctx.userId}`).emit('pending-task:created', {
        id: pendingId,
        source: 'gmail',
      });
    }

    createdTitles.push(suggestion.title);
    created++;
  }

  await markEmailsAsProcessed(ctx.userId, successfullyAnalyzedIds);

  return {
    success: true,
    data: { analyzed: emails.length, created, tasks: createdTitles },
  };
}

async function executeSearchWeb(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolExecutionResult> {
  const query = String(args.query || '').trim();
  if (!query) return { success: false, message: 'query é obrigatório' };

  try {
    const result = await searchWeb(query, { timezone: ctx.timezone });
    return {
      success: true,
      data: {
        query: result.query,
        summary: result.summary,
        sources: result.sources,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao pesquisar na web';
    console.error('search_web failed:', error);
    return { success: false, message };
  }
}

function parseOfferChoices(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 80)
    .slice(0, 5);
}

function executeOfferChoices(args: Record<string, unknown>): ToolExecutionResult {
  const question = typeof args.question === 'string' ? args.question.trim() : '';
  const choices = parseOfferChoices(args.choices);
  if (!question) return { success: false, message: 'question é obrigatório' };
  if (choices.length < 2) {
    return { success: false, message: 'Informe pelo menos 2 opções curtas' };
  }
  return { success: true, data: { question, choices } };
}

/** Legacy (flag off) closure of the onboarding journey, driven by the model. */
async function executeCompleteOnboardingJourney(
  ctx: AgentContext,
  profile: ChannelProfile,
): Promise<ToolExecutionResult> {
  if (profile.id !== 'web') {
    return { success: false, message: 'complete_onboarding_journey só está disponível no web' };
  }
  const taskRows = await fetchOnboardingJourneyTasks(ctx.userId);
  const tasks = taskRows.map((row) => ({
    id: row.id,
    title: row.title,
    due_label: formatDueDateLabel(normalizeTaskDueDate(row.due_date), normalizeTaskTime(row.time)),
  }));
  const titles = tasks.map((t) => (t.due_label ? `${t.title} (${t.due_label})` : t.title));
  const tasksLine = (
    titles.length === 0
      ? 'suas primeiras tarefas'
      : titles.length === 1
        ? titles[0]!
        : `${titles.slice(0, -1).join(', ')} e ${titles[titles.length - 1]}`
  ).slice(0, 120);
  const marked = await markOnboardingJourneyComplete(ctx.userId, new Date().toISOString());
  return { success: true, data: { alreadyCompleted: !marked, tasks, tasksLine } };
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: AgentContext,
  profile: ChannelProfile,
): Promise<ToolExecutionResult> {
  switch (toolName) {
    case 'create_task':
      return executeCreateTask(args, ctx, profile);
    case 'update_task':
      return executeUpdateTask(args, ctx, profile);
    case 'complete_task':
      return executeCompleteTask(args, ctx);
    case 'delete_task':
      return executeDeleteTask(args, ctx);
    case 'search_tasks':
      return executeSearchTasks(args, ctx);
    case 'update_memory':
      return executeUpdateMemory(args, ctx);
    case 'create_list':
      return executeCreateList(args, ctx);
    case 'update_list':
      return executeUpdateList(args, ctx);
    case 'delete_list':
      return executeDeleteList(args, ctx);
    case 'show_list':
      return executeShowList(args, ctx);
    case 'create_category':
      return executeCreateCategory(args, ctx);
    case 'update_category':
      return executeUpdateCategory(args, ctx);
    case 'delete_category':
      return executeDeleteCategory(args, ctx);
    case 'show_category':
      return executeShowCategory(args, ctx);
    case 'scan_gmail':
      return executeScanGmail(args, ctx);
    case 'search_web':
      return executeSearchWeb(args, ctx);
    case 'offer_choices':
      return executeOfferChoices(args);
    case 'complete_onboarding_journey':
      return executeCompleteOnboardingJourney(ctx, profile);
    default:
      return { success: false, message: `Tool desconhecida: ${toolName}` };
  }
}
