/**
 * Onboarding interview content and helpers. Options, copy and the memory
 * seed match packages/web/src/pages/CriarConta so both signups feed the AI
 * the same profile.
 */
import type { OnboardingCompleteResponse, OnboardingCreatedTask } from '@/api/endpoints';
import type { ChatChoiceField, ChatMessageData, ToolCallData } from '@/features/chat/types';
import { MONTHS_SHORT_PT, parseDateKey } from '@/lib/dates';

export interface OnboardingOption {
  value: string;
  label: string;
}

export const TRACKING_METHOD_OPTIONS: OnboardingOption[] = [
  { value: 'mobile-notes', label: 'Anotações no celular' },
  { value: 'paper-notebook', label: 'Papel & caderno' },
  { value: 'self-whatsapp', label: 'WhatsApp comigo mesmo' },
  { value: 'agenda-calendar', label: 'Agenda & Calendário' },
  { value: 'spreadsheets', label: 'Planilhas' },
  { value: 'productivity-apps', label: 'Apps de produtividade (Notion, ClickUp, etc)' },
  { value: 'memory-only', label: 'Tento lembrar de cabeça' },
  { value: 'no-system', label: 'Não tenho um sistema para isso' },
  { value: 'other', label: 'Outros' },
];

export const PAIN_POINT_OPTIONS: OnboardingOption[] = [
  { value: 'forget-fast-capture', label: 'Esqueço tarefas se não anoto na hora' },
  { value: 'hard-prioritization', label: 'Tenho dificuldade em decidir o que é mais importante' },
  { value: 'overwhelmed-many-tasks', label: 'Me sinto sobrecarregado(a) com tudo que tenho pra fazer' },
  { value: 'procrastinate-important', label: 'Procrastino tarefas importantes' },
  { value: 'dont-know-start', label: 'Não sei por onde começar' },
  { value: 'other', label: 'Outros' },
];

export interface FirstTaskTopic {
  id: string;
  title: string;
  examples: string[];
}

export const FIRST_TASK_TOPICS: FirstTaskTopic[] = [
  {
    id: 'health',
    title: 'Saúde',
    examples: [
      'Agendar check-up anual',
      'Agendar consulta no dentista',
      'Agendar consulta no oftalmologista',
      'Pesquisar calendário de vacinas',
    ],
  },
  {
    id: 'money',
    title: 'Dinheiro',
    examples: [
      'Pagar fatura do cartão de crédito',
      'Guardar dinheiro para a reserva de emergência',
      'Revisar assinaturas de aplicativos',
      'Fechar os gastos do mês passado',
    ],
  },
  {
    id: 'home',
    title: 'Casa',
    examples: ['Agendar limpeza do ar-condicionado', 'Comprar gás', 'Pagar a internet', 'Trocar o filtro de água'],
  },
  {
    id: 'documents',
    title: 'Documentos',
    examples: ['Renovar CNH', 'Renovar passaporte', 'Pagar IPVA', 'Declarar Imposto de Renda'],
  },
  {
    id: 'people',
    title: 'Pessoas',
    examples: ['Ligar para um parente', 'Agendar um almoço', 'Lembrar um aniversário', 'Mandar uma mensagem'],
  },
];

export type InterviewStep = 'name' | 'tracking' | 'pain' | 'open' | 'first_tasks';
export const INTERVIEW_STEPS: InterviewStep[] = ['name', 'tracking', 'pain', 'open', 'first_tasks'];

export const INTERVIEW_PROMPTS: Record<InterviewStep, string> = {
  name: 'Como você prefere ser chamado?',
  tracking: 'Como você cria e lembra das suas tarefas?',
  pain: 'Você lida com algumas das opções abaixo?',
  open: 'Como seria a Jarvi ideal para você no dia a dia?',
  first_tasks: 'Vamos criar suas primeiras tarefas',
};

export interface OnboardingDraftTask {
  id: string;
  title: string;
  dueDate: string | null;
  time: string | null;
}

export interface OnboardingAnswers {
  name: string;
  trackingMethods: string[];
  trackingMethodsOther: string;
  painPoints: string[];
  painPointsOther: string;
  idealOutcomeText: string;
  tasks: OnboardingDraftTask[];
}

export function labelsFromSelection(options: OnboardingOption[], selected: string[], otherText: string): string[] {
  const labels = options.filter((o) => selected.includes(o.value) && o.value !== 'other').map((o) => o.label);
  if (selected.includes('other') && otherText.trim()) labels.push(otherText.trim());
  return labels;
}

export function formatList(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

/** Text the AI memory starts from (web `buildMemorySeed`). */
export function buildMemorySeed(answers: OnboardingAnswers): string {
  const lines: string[] = [];
  const name = answers.name.trim();
  if (name && name !== 'Você') lines.push(`Você se chama ${name}.`);
  const tracking = labelsFromSelection(TRACKING_METHOD_OPTIONS, answers.trackingMethods, answers.trackingMethodsOther);
  if (tracking.length) lines.push(`Hoje você registra tarefas usando: ${formatList(tracking)}.`);
  const pain = labelsFromSelection(PAIN_POINT_OPTIONS, answers.painPoints, answers.painPointsOther);
  if (pain.length) lines.push(`Os principais desafios atuais são: ${formatList(pain)}.`);
  if (answers.idealOutcomeText.trim()) lines.push(`A Jarvi ideal no dia a dia: ${answers.idealOutcomeText.trim()}`);
  return lines.length > 0 ? lines.join('\n') : 'Conte um pouco sobre sua rotina para a Jarvi te ajudar melhor.';
}

/** Validation for the current step; null when the person can continue. */
export function stepError(step: InterviewStep, answers: OnboardingAnswers): string | null {
  switch (step) {
    case 'name': {
      const name = answers.name.trim();
      return !name || name === 'Você' ? 'Diga como você prefere ser chamado.' : null;
    }
    case 'tracking':
      if (!answers.trackingMethods.length) return 'Selecione ao menos uma opção.';
      if (answers.trackingMethods.includes('other') && !answers.trackingMethodsOther.trim()) {
        return 'Descreva o que entra em "Outros".';
      }
      return null;
    case 'pain':
      if (!answers.painPoints.length) return 'Selecione ao menos um desafio.';
      if (answers.painPoints.includes('other') && !answers.painPointsOther.trim()) {
        return 'Descreva o que entra em "Outros".';
      }
      return null;
    case 'open':
      return null;
    case 'first_tasks':
      return answers.tasks.some((task) => task.title.trim()) ? null : 'Conte pelo menos uma coisa que você precisa fazer.';
  }
}

const READY_ACK = 'Tudo pronto, criei suas primeiras tarefas.';

const toChoiceField = (value: unknown): ChatChoiceField | undefined =>
  value === 'due_date' || value === 'time' || value === 'reminders' ? value : undefined;

/**
 * First chat message after onboarding: the welcome, a card for the task the
 * follow-up is about, and the follow-up question with its quick replies
 * (web `buildOnboardingChatMessages`). Null when the backend sent nothing.
 */
export function buildOnboardingChat(response: OnboardingCompleteResponse, firstName?: string): ChatMessageData[] | null {
  const followUp = response.followUp;
  const question = (followUp?.question || response.followUpMessage || '').trim();
  if (!question) return null;

  const created: OnboardingCreatedTask[] = response.createdTasks ?? [];
  const ack = followUp?.ack?.trim() || READY_ACK;
  const welcome = firstName ? `Bem-vindo, ${firstName}!` : 'Bem-vindo!';
  const opening = /bem-vindo/i.test(ack) ? ack : `${welcome}\n\n${ack}`;
  const choices = (followUp?.choices ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 5);
  const focusTitle = followUp?.taskTitle?.trim().toLowerCase();
  const focused = created.filter((task) =>
    followUp?.taskId ? task.id === followUp.taskId : !!focusTitle && task.title.trim().toLowerCase() === focusTitle,
  );
  const toolCalls: ToolCallData[] = (focused.length > 0 ? focused : created).slice(0, 1).map((task) => ({
    toolName: 'create_task',
    toolArgs: { title: task.title, due_date: task.dueDate, time: task.time },
    result: { success: true, data: { id: task.id, title: task.title, due_date: task.dueDate, time: task.time } },
  }));
  const hasChoices = choices.length > 0;

  return [
    {
      id: 'onboarding-first-tasks',
      role: 'assistant',
      content: opening,
      contentAfter: hasChoices ? undefined : question,
      toolCalls,
      choicePromptTitle: hasChoices ? question : undefined,
      choicePrompts: choices,
      choiceTaskId: hasChoices ? followUp?.taskId : undefined,
      choiceField: hasChoices ? toChoiceField(followUp?.field) : undefined,
    },
  ];
}

/** "Renovar CNH (7 Jan, 09:00)" lines, the free-text copy of the first tasks. */
export function serializeDraftTasks(tasks: OnboardingDraftTask[]): string {
  return tasks
    .map((task) => {
      const title = task.title.trim();
      if (!title) return '';
      const date = parseDateKey(task.dueDate);
      if (!date) return title;
      const label = `${date.getDate()} ${MONTHS_SHORT_PT[date.getMonth()]}`;
      return `${title} (${task.time ? `${label}, ${task.time}` : label})`;
    })
    .filter(Boolean)
    .join('\n');
}

export function createDraftTask(title = '', dueDate: string | null = null): OnboardingDraftTask {
  return { id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, dueDate, time: null };
}
