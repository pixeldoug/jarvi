import type { ChatMessageData, ToolCallData } from '../hooks/useChatStream';

export const ONBOARDING_CHAT_STORAGE_KEY = 'jarvi_onboarding_chat';
export const ONBOARDING_CHAT_CONSUMED_KEY = 'jarvi_onboarding_chat_consumed';

export interface OnboardingCreatedTask {
  id: string;
  title: string;
  dueDate: string | null;
  time: string | null;
}

export interface OnboardingFollowUpSeed {
  ack: string;
  question: string;
  choices: string[];
  taskTitle?: string;
}

export interface OnboardingChatSeed {
  userText: string;
  followUpMessage: string;
  followUp?: OnboardingFollowUpSeed;
  createdTasks: OnboardingCreatedTask[];
  firstName?: string;
}

export function storeOnboardingChatSeed(seed: OnboardingChatSeed): void {
  sessionStorage.removeItem(ONBOARDING_CHAT_CONSUMED_KEY);
  sessionStorage.setItem(ONBOARDING_CHAT_STORAGE_KEY, JSON.stringify(seed));
}

function isFollowUpSeed(value: unknown): value is OnboardingFollowUpSeed {
  if (!value || typeof value !== 'object') return false;
  const followUp = value as OnboardingFollowUpSeed;
  return (
    typeof followUp.ack === 'string' &&
    followUp.ack.trim().length > 0 &&
    typeof followUp.question === 'string' &&
    followUp.question.trim().length > 0
  );
}

function isValidSeed(value: unknown): value is OnboardingChatSeed {
  if (!value || typeof value !== 'object') return false;
  const seed = value as OnboardingChatSeed;
  const hasFollowUpText =
    typeof seed.followUpMessage === 'string' && seed.followUpMessage.trim().length > 0;
  return hasFollowUpText || isFollowUpSeed(seed.followUp);
}

export function consumeOnboardingChatSeed(locationState?: unknown): OnboardingChatSeed | null {
  if (sessionStorage.getItem(ONBOARDING_CHAT_CONSUMED_KEY) === '1') return null;

  const raw = sessionStorage.getItem(ONBOARDING_CHAT_STORAGE_KEY);
  if (raw) {
    sessionStorage.removeItem(ONBOARDING_CHAT_STORAGE_KEY);
    try {
      const parsed = JSON.parse(raw) as OnboardingChatSeed;
      if (isValidSeed(parsed)) {
        sessionStorage.setItem(ONBOARDING_CHAT_CONSUMED_KEY, '1');
        return parsed;
      }
    } catch {
      // Ignore malformed storage and fall through to navigation state.
    }
  }

  const fromNav = (locationState as { onboardingChat?: OnboardingChatSeed } | null)?.onboardingChat;
  if (isValidSeed(fromNav)) {
    sessionStorage.setItem(ONBOARDING_CHAT_CONSUMED_KEY, '1');
    return fromNav;
  }
  return null;
}

const READY_ACK = 'Tudo pronto, criei suas primeiras tarefas.';

export function onboardingGreeting(firstName?: string): string {
  const name = firstName?.trim();
  const welcome = name ? `Bem-vindo, ${name}!` : 'Bem-vindo!';
  return `${welcome}\n\n${READY_ACK}`;
}

function composeOpeningAck(seed: OnboardingChatSeed, followUp: OnboardingFollowUpSeed): string {
  const ack = followUp.ack.trim();
  if (/bem-vindo/i.test(ack)) return ack;
  const name = seed.firstName?.trim();
  const welcome = name ? `Bem-vindo, ${name}!` : 'Bem-vindo!';
  return ack ? `${welcome}\n\n${ack}` : welcome;
}

function resolveFollowUp(seed: OnboardingChatSeed): OnboardingFollowUpSeed {
  if (isFollowUpSeed(seed.followUp)) {
    return {
      ack: seed.followUp.ack.trim(),
      question: seed.followUp.question.trim(),
      choices: (seed.followUp.choices ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 5),
      taskTitle: seed.followUp.taskTitle?.trim() || undefined,
    };
  }

  return {
    ack: READY_ACK,
    question: seed.followUpMessage.trim(),
    choices: [],
    taskTitle: undefined,
  };
}

export function buildOnboardingChatMessages(seed: OnboardingChatSeed): ChatMessageData[] {
  const followUp = resolveFollowUp(seed);
  const focusedTitle = followUp.taskTitle?.trim().toLowerCase();
  const focused = focusedTitle
    ? seed.createdTasks.filter((task) => task.title.trim().toLowerCase() === focusedTitle)
    : [];
  const tasksForArtifact = (focused.length > 0 ? focused : seed.createdTasks).slice(0, 1);
  const toolCalls: ToolCallData[] = tasksForArtifact.map((task) => ({
    toolName: 'create_task',
    toolArgs: {
      title: task.title,
      due_date: task.dueDate,
      time: task.time,
    },
    result: {
      success: true,
      data: {
        id: task.id,
        title: task.title,
        due_date: task.dueDate,
        time: task.time,
      },
    },
  }));

  // With choices the question becomes the choice prompt title, so it must not
  // also be repeated as trailing text.
  const hasChoices = followUp.choices.length > 0;

  return [
    {
      id: 'onboarding-first-tasks',
      role: 'assistant',
      content: composeOpeningAck(seed, followUp),
      contentAfter: hasChoices ? undefined : followUp.question,
      toolCalls,
      choicePromptTitle: hasChoices ? followUp.question : undefined,
      choicePrompts: followUp.choices,
    },
  ];
}
