/**
 * Onboarding interview content and helpers. Options, copy and the memory
 * seed match packages/web/src/pages/CriarConta so both signups feed the AI
 * the same profile.
 */
import type { OnboardingCompleteResponse, OnboardingCreatedTask } from '@/api/endpoints';
import type { ChatChoiceField, ChatMessageData, ToolCallData } from '@/features/chat/types';
import { formatDate, formatList, formatTime, i18n } from '@/i18n';

/**
 * A multi-select answer. `value` is what the backend stores (never
 * translated); `labelKey` is resolved with `t()` at render time.
 */
export interface OnboardingOption {
  value: string;
  labelKey: OnboardingOptionKey;
}

export const TRACKING_METHOD_OPTIONS = [
  { value: 'mobile-notes', labelKey: 'options.tracking.mobileNotes' },
  { value: 'paper-notebook', labelKey: 'options.tracking.paperNotebook' },
  { value: 'self-whatsapp', labelKey: 'options.tracking.selfWhatsapp' },
  { value: 'agenda-calendar', labelKey: 'options.tracking.agendaCalendar' },
  { value: 'spreadsheets', labelKey: 'options.tracking.spreadsheets' },
  { value: 'productivity-apps', labelKey: 'options.tracking.productivityApps' },
  { value: 'memory-only', labelKey: 'options.tracking.memoryOnly' },
  { value: 'no-system', labelKey: 'options.tracking.noSystem' },
  { value: 'other', labelKey: 'options.tracking.other' },
] as const;

export const PAIN_POINT_OPTIONS = [
  { value: 'forget-fast-capture', labelKey: 'options.pain.forgetFastCapture' },
  { value: 'hard-prioritization', labelKey: 'options.pain.hardPrioritization' },
  { value: 'overwhelmed-many-tasks', labelKey: 'options.pain.overwhelmedManyTasks' },
  { value: 'procrastinate-important', labelKey: 'options.pain.procrastinateImportant' },
  { value: 'dont-know-start', labelKey: 'options.pain.dontKnowStart' },
  { value: 'other', labelKey: 'options.pain.other' },
] as const;

export type OnboardingOptionKey =
  | (typeof TRACKING_METHOD_OPTIONS)[number]['labelKey']
  | (typeof PAIN_POINT_OPTIONS)[number]['labelKey'];

export interface FirstTaskTopic {
  id: string;
  titleKey: FirstTaskTopicKey;
  /** Each example is added as a task title in the current language. */
  examples: readonly FirstTaskTopicKey[];
}

export const FIRST_TASK_TOPICS = [
  {
    id: 'health',
    titleKey: 'ideas.topics.health.title',
    examples: [
      'ideas.topics.health.examples.checkup',
      'ideas.topics.health.examples.dentist',
      'ideas.topics.health.examples.eyeDoctor',
      'ideas.topics.health.examples.vaccines',
    ],
  },
  {
    id: 'money',
    titleKey: 'ideas.topics.money.title',
    examples: [
      'ideas.topics.money.examples.creditCard',
      'ideas.topics.money.examples.emergencyFund',
      'ideas.topics.money.examples.subscriptions',
      'ideas.topics.money.examples.monthlySpending',
    ],
  },
  {
    id: 'home',
    titleKey: 'ideas.topics.home.title',
    examples: [
      'ideas.topics.home.examples.airConditioner',
      'ideas.topics.home.examples.household',
      'ideas.topics.home.examples.internet',
      'ideas.topics.home.examples.waterFilter',
    ],
  },
  {
    id: 'documents',
    titleKey: 'ideas.topics.documents.title',
    examples: [
      'ideas.topics.documents.examples.driversLicense',
      'ideas.topics.documents.examples.passport',
      'ideas.topics.documents.examples.vehicle',
      'ideas.topics.documents.examples.taxes',
    ],
  },
  {
    id: 'people',
    titleKey: 'ideas.topics.people.title',
    examples: [
      'ideas.topics.people.examples.callRelative',
      'ideas.topics.people.examples.lunch',
      'ideas.topics.people.examples.birthday',
      'ideas.topics.people.examples.message',
    ],
  },
] as const;

type TopicDef = (typeof FIRST_TASK_TOPICS)[number];
export type FirstTaskTopicKey = TopicDef['titleKey'] | TopicDef['examples'][number];

export type InterviewStep = 'name' | 'tracking' | 'pain' | 'open' | 'first_tasks';
export const INTERVIEW_STEPS: InterviewStep[] = ['name', 'tracking', 'pain', 'open', 'first_tasks'];

/** Heading of each step (`onboarding` keys; resolve with `t()` at render). */
export const INTERVIEW_PROMPT_KEYS = {
  name: 'interview.prompts.name',
  tracking: 'interview.prompts.tracking',
  pain: 'interview.prompts.pain',
  open: 'interview.prompts.open',
  first_tasks: 'interview.prompts.firstTasks',
} as const satisfies Record<InterviewStep, string>;

/**
 * Name the backend gives WhatsApp sign-ups. A stored sentinel, compared as
 * is; never translated (docs/decisions/0005-i18n.md).
 */
export const PLACEHOLDER_NAME = 'Você';

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

/** Labels of the picked options (current language), plus the "other" text. */
export function labelsFromSelection(options: readonly OnboardingOption[], selected: string[], otherText: string): string[] {
  const labels = options
    .filter((o) => selected.includes(o.value) && o.value !== 'other')
    .map((o) => i18n.t(`onboarding:${o.labelKey}`));
  if (selected.includes('other') && otherText.trim()) labels.push(otherText.trim());
  return labels;
}

/**
 * Text the AI memory starts from (web `buildMemorySeed`), in the current
 * language. Call it when submitting, never at module load.
 */
export function buildMemorySeed(answers: OnboardingAnswers): string {
  const lines: string[] = [];
  const name = answers.name.trim();
  if (name && name !== PLACEHOLDER_NAME) lines.push(i18n.t('onboarding:memory.name', { name }));
  const tracking = labelsFromSelection(TRACKING_METHOD_OPTIONS, answers.trackingMethods, answers.trackingMethodsOther);
  if (tracking.length) lines.push(i18n.t('onboarding:memory.tracking', { list: formatList(tracking) }));
  const pain = labelsFromSelection(PAIN_POINT_OPTIONS, answers.painPoints, answers.painPointsOther);
  if (pain.length) lines.push(i18n.t('onboarding:memory.pain', { list: formatList(pain) }));
  const ideal = answers.idealOutcomeText.trim();
  if (ideal) lines.push(i18n.t('onboarding:memory.idealOutcome', { text: ideal }));
  return lines.length > 0 ? lines.join('\n') : i18n.t('onboarding:memory.empty');
}

/** Validation for the current step (current language); null when the person can continue. */
export function stepError(step: InterviewStep, answers: OnboardingAnswers): string | null {
  switch (step) {
    case 'name': {
      const name = answers.name.trim();
      return !name || name === PLACEHOLDER_NAME ? i18n.t('onboarding:validation.name') : null;
    }
    case 'tracking':
      if (!answers.trackingMethods.length) return i18n.t('onboarding:validation.selectOption');
      if (answers.trackingMethods.includes('other') && !answers.trackingMethodsOther.trim()) {
        return i18n.t('onboarding:validation.describeOther');
      }
      return null;
    case 'pain':
      if (!answers.painPoints.length) return i18n.t('onboarding:validation.selectChallenge');
      if (answers.painPoints.includes('other') && !answers.painPointsOther.trim()) {
        return i18n.t('onboarding:validation.describeOther');
      }
      return null;
    case 'open':
      return null;
    case 'first_tasks':
      return answers.tasks.some((task) => task.title.trim()) ? null : i18n.t('onboarding:validation.firstTask');
  }
}

/** True when the backend ack already greets the user (either language), so the app does not greet twice. */
const BACKEND_GREETING = /bem-vind|\bwelcome\b/i;

const toChoiceField = (value: unknown): ChatChoiceField | undefined =>
  value === 'due_date' || value === 'time' || value === 'reminders' ? value : undefined;

/**
 * First chat message after onboarding: the welcome, a card for the task the
 * follow-up is about, and the follow-up question with its quick replies
 * (web `buildOnboardingChatMessages`). Null when the backend sent nothing.
 * The question, ack and choices come from the backend (in the user's
 * language on the new one, Portuguese on the old one).
 */
export function buildOnboardingChat(response: OnboardingCompleteResponse, firstName?: string): ChatMessageData[] | null {
  const followUp = response.followUp;
  const question = (followUp?.question || response.followUpMessage || '').trim();
  if (!question) return null;

  const created: OnboardingCreatedTask[] = response.createdTasks ?? [];
  const ack = followUp?.ack?.trim() || i18n.t('onboarding:chatSeed.readyAck');
  const welcome = firstName
    ? i18n.t('onboarding:chatSeed.welcomeName', { name: firstName })
    : i18n.t('onboarding:chatSeed.welcome');
  const opening = BACKEND_GREETING.test(ack) ? ack : `${welcome}\n\n${ack}`;
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

/**
 * The free-text copy of the first tasks, one per line, with dates in the
 * current language: pt "Renovar CNH (7 Jan, 09:00)", en "Renew my passport
 * (Jan 7, 9:00 AM)". Sent to the backend as `firstTasksText`.
 */
export function serializeDraftTasks(tasks: OnboardingDraftTask[]): string {
  return tasks
    .map((task) => {
      const title = task.title.trim();
      if (!title) return '';
      const date = task.dueDate ? formatDate(task.dueDate, 'dayMonth') : '';
      if (!date) return title;
      const time = task.time ? formatTime(task.time, 'clock') : '';
      return `${title} (${time ? i18n.t('common:time.dateWithTime', { date, time }) : date})`;
    })
    .filter(Boolean)
    .join('\n');
}

export function createDraftTask(title = '', dueDate: string | null = null): OnboardingDraftTask {
  return { id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, dueDate, time: null };
}
