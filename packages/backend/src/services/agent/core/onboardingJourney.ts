/**
 * Onboarding journey (the post-wizard "first tasks" chat) — decided by the
 * backend, not by the model.
 *
 * The journey walks the FIRST tasks (the ones the wizard created, created_at
 * order, capped) through the tríade state machine (`nextQuestion.ts`). It is
 * a conversation the person can step out of at any time, so after each tríade
 * transition the step depends on whether the journey is ACTIVE this turn —
 * the person was answering one of ITS questions (or tapped "Continuar"):
 *
 *   - the task just touched still has a question → ask it (always);
 *   - active, another first task has a question → ask it, in one conversational
 *     sentence that names the task ("E sobre {{task}}, quando você pretende
 *     fazer?") — never a wizard-log line like "Agora X.";
 *   - NOT active (a free message, a task created in the chat) → the journey is
 *     suspended: a discreet nudge ("Você ainda tem 4 tarefas para organizar."
 *     + Continuar) instead of dragging the person back into the queue;
 *   - no first task has a question left → the journey is complete: the
 *     backend marks `onboarding_journey_completed_at` and writes the closing.
 *
 * Until this module existed the model had to remember (via prompt rules) when
 * to advance "a fila", when to call `complete_onboarding_journey`, and what
 * to say — which produced "quer ir para a próxima da fila?" moments the user
 * could not follow. Nothing here needs a tool call or a prompt rule.
 */

import { getDatabase, getPool, isPostgreSQL } from '../../../database';
import { listRemindersForTask } from '../../reminderService';
import { taskRef } from './confirmations';
import { decideNextQuestion, triadStateOf, type TriadPolicy } from './nextQuestion';
import type {
  AgentContext,
  AgentJourneyNudge,
  AgentPendingQuestion,
  ChannelProfile,
  TaskRow,
} from './types';

export const ONBOARDING_JOURNEY_TASK_CAP = 5;

/**
 * Tasks created this long after `onboarding_completed_at` still count as
 * first tasks (the wizard stamps the user row and inserts the tasks in the
 * same request; clocks and transactions are not instantaneous).
 */
const FIRST_TASKS_SLACK_MS = 120_000;

/** The resume action the nudge offers. */
export const JOURNEY_RESUME_LABEL = 'Continuar';

const hasTimestamp = (value: unknown): boolean => value != null && String(value).trim() !== '';

function toIsoCutoff(value: unknown): string | null {
  if (!hasTimestamp(value)) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + FIRST_TASKS_SLACK_MS).toISOString();
}

async function firstTasksCutoff(userId: string): Promise<string | null> {
  const row = isPostgreSQL()
    ? ((await getPool().query('SELECT onboarding_completed_at FROM users WHERE id = $1', [userId]))
        .rows[0] as { onboarding_completed_at?: unknown } | undefined)
    : await getDatabase().get<{ onboarding_completed_at?: unknown }>(
        'SELECT onboarding_completed_at FROM users WHERE id = ?',
        [userId],
      );
  return toIsoCutoff(row?.onboarding_completed_at);
}

/**
 * The first tasks: open tasks created by the wizard (up to the moment the
 * wizard finished), oldest first. Tasks the person creates later in the chat
 * are NOT part of the journey — they get their own tríade when created, but
 * finishing them never drags the person back into the queue.
 */
export async function fetchOnboardingJourneyTasks(userId: string): Promise<TaskRow[]> {
  const columns = 'id, user_id, title, due_date, time, completed, agent_triad_skips, created_at';
  const cutoff = await firstTasksCutoff(userId);
  if (isPostgreSQL()) {
    const result = cutoff
      ? await getPool().query(
          `SELECT ${columns}
           FROM tasks
           WHERE user_id = $1 AND (completed = FALSE OR completed IS NULL) AND created_at <= $2
           ORDER BY created_at ASC
           LIMIT $3`,
          [userId, cutoff, ONBOARDING_JOURNEY_TASK_CAP],
        )
      : await getPool().query(
          `SELECT ${columns}
           FROM tasks
           WHERE user_id = $1 AND (completed = FALSE OR completed IS NULL)
           ORDER BY created_at ASC
           LIMIT $2`,
          [userId, ONBOARDING_JOURNEY_TASK_CAP],
        );
    return result.rows as TaskRow[];
  }
  return cutoff
    ? getDatabase().all<TaskRow[]>(
        `SELECT ${columns}
         FROM tasks
         WHERE user_id = ? AND (completed = 0 OR completed IS NULL) AND created_at <= ?
         ORDER BY created_at ASC
         LIMIT ?`,
        [userId, cutoff, ONBOARDING_JOURNEY_TASK_CAP],
      )
    : getDatabase().all<TaskRow[]>(
        `SELECT ${columns}
         FROM tasks
         WHERE user_id = ? AND (completed = 0 OR completed IS NULL)
         ORDER BY created_at ASC
         LIMIT ?`,
        [userId, ONBOARDING_JOURNEY_TASK_CAP],
      );
}

/** True when `taskId` is one of the first tasks (a question about it is a journey question). */
export async function isOnboardingJourneyTask(userId: string, taskId: string): Promise<boolean> {
  const tasks = await fetchOnboardingJourneyTasks(userId);
  return tasks.some((t) => t.id === taskId);
}

export async function isOnboardingJourneyPending(userId: string): Promise<boolean> {
  const row = isPostgreSQL()
    ? ((await getPool().query('SELECT onboarding_journey_completed_at FROM users WHERE id = $1', [userId]))
        .rows[0] as { onboarding_journey_completed_at?: unknown } | undefined)
    : await getDatabase().get<{ onboarding_journey_completed_at?: unknown }>(
        'SELECT onboarding_journey_completed_at FROM users WHERE id = ?',
        [userId],
      );
  return Boolean(row) && !hasTimestamp(row?.onboarding_journey_completed_at);
}

/** Idempotent: only the first call writes the timestamp. Returns true when it did. */
export async function markOnboardingJourneyComplete(userId: string, completedAt: string): Promise<boolean> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      `UPDATE users
       SET onboarding_journey_completed_at = $1, updated_at = $2
       WHERE id = $3 AND onboarding_journey_completed_at IS NULL`,
      [completedAt, completedAt, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }
  const result = await getDatabase().run(
    `UPDATE users
     SET onboarding_journey_completed_at = ?, updated_at = ?
     WHERE id = ? AND onboarding_journey_completed_at IS NULL`,
    [completedAt, completedAt, userId],
  );
  return (result.changes ?? 0) > 0;
}

export type OnboardingJourneyStep =
  /** The task just touched still has a tríade question. */
  | { kind: 'continue'; question: AgentPendingQuestion }
  /** Move on to another first task — `question.intro` names it conversationally. */
  | { kind: 'advance'; question: AgentPendingQuestion }
  /** The journey is paused (the person went off-script) with tasks still to organize. */
  | { kind: 'suspended'; nudge: AgentJourneyNudge }
  /** Every first task is settled: close the journey. */
  | { kind: 'complete' }
  /** Nothing to do (journey not pending, or no tasks). */
  | { kind: 'none' };

export function taskMention(task: { id: string; title: string }, surface: ChannelProfile['outputFormat'] = 'markdown'): string {
  return taskRef({ type: 'task', id: task.id, title: task.title }, surface);
}

function lowercaseFirst(text: string): string {
  return text ? text.charAt(0).toLocaleLowerCase('pt-BR') + text.slice(1) : text;
}

/** The question as the tail of a sentence about a named task. */
function questionClause(question: AgentPendingQuestion): string {
  switch (question.field) {
    case 'due_date':
      return 'quando você pretende fazer?';
    case 'time':
      return 'qual horário você prefere?';
    case 'reminders':
      return 'quer que eu te lembre no WhatsApp?';
    default:
      return lowercaseFirst(question.text);
  }
}

/**
 * One conversational sentence naming the task and asking its question.
 *   advance → "E sobre {{task}}, quando você pretende fazer?"
 *   resume  → "Vamos lá. Sobre {{task}}, quando você pretende fazer?"
 */
export function journeyQuestionIntro(
  task: { id: string; title: string },
  question: AgentPendingQuestion,
  mode: 'advance' | 'resume',
  surface: ChannelProfile['outputFormat'] = 'markdown',
): string {
  const mention = taskMention(task, surface);
  const clause = questionClause(question);
  return mode === 'resume' ? `Vamos lá. Sobre ${mention}, ${clause}` : `E sobre ${mention}, ${clause}`;
}

export function journeyNudge(remaining: number): AgentJourneyNudge {
  const text =
    remaining === 1
      ? 'Você ainda tem 1 tarefa para organizar.'
      : `Você ainda tem ${remaining} tarefas para organizar.`;
  return { text, remaining, resumeLabel: JOURNEY_RESUME_LABEL };
}

/** The nudge as a single line for channels without a resume action. */
export function journeyNudgeText(nudge: AgentJourneyNudge): string {
  return `${nudge.text} Quer continuar?`;
}

export interface OnboardingStepOptions {
  /**
   * The person is engaged with the journey this turn — answering a system
   * question about a first task, or resuming via "Continuar". Off-script turns
   * (a free message, a task created in the chat) suspend it instead of
   * advancing.
   */
  active: boolean;
  /** Wording of the intro when advancing. */
  mode?: 'advance' | 'resume';
  surface?: ChannelProfile['outputFormat'];
}

/**
 * Decide what the journey does after a tríade transition on `currentTaskId`
 * (may be undefined when the transition was not about one task).
 */
export async function nextOnboardingStep(
  ctx: AgentContext,
  currentTaskId: string | undefined,
  policy: TriadPolicy,
  options: OnboardingStepOptions,
): Promise<OnboardingJourneyStep> {
  if (!ctx.onboardingJourneyPending) return { kind: 'none' };
  const tasks = await fetchOnboardingJourneyTasks(ctx.userId);
  if (tasks.length === 0) return { kind: 'none' };

  const questionFor = async (task: TaskRow): Promise<AgentPendingQuestion | null> => {
    const reminders = await listRemindersForTask(task.id, ctx.userId);
    return decideNextQuestion(triadStateOf(task, reminders.length), policy);
  };

  const current = tasks.find((t) => t.id === currentTaskId);
  if (current) {
    const question = await questionFor(current);
    if (question) return { kind: 'continue', question };
  }

  const unsettled: Array<{ task: TaskRow; question: AgentPendingQuestion }> = [];
  for (const task of tasks) {
    if (task.id === currentTaskId) continue;
    const question = await questionFor(task);
    if (question) unsettled.push({ task, question });
  }
  if (unsettled.length === 0) return { kind: 'complete' };
  if (!options.active) return { kind: 'suspended', nudge: journeyNudge(unsettled.length) };

  const next = unsettled[0];
  return {
    kind: 'advance',
    question: {
      ...next.question,
      intro: journeyQuestionIntro(next.task, next.question, options.mode ?? 'advance', options.surface),
    },
  };
}

// "Continuar" (the nudge's action) or a bare yes to it.
const RESUME_RE =
  /^(?:continuar|continua|vamos(?:\s+continuar)?|bora|sim|pode(?:\s+ser)?|ok(?:ay)?|claro|vamos\s+l[áa])[.!\s]*$/i;

/** True when the message is the person taking the nudge's "Continuar". */
export function isJourneyResumeReply(message: string | undefined | null): boolean {
  return Boolean(message) && RESUME_RE.test(message!.trim());
}

/** The closing message of the journey — fixed copy, in Jarvi's voice. */
export function onboardingClosingText(
  ctx: Pick<AgentContext, 'preferredName' | 'whatsappVerified'>,
): string {
  const name = ctx.preferredName?.trim();
  const opening = name
    ? `Suas primeiras tarefas estão organizadas, ${name}!`
    : 'Suas primeiras tarefas estão organizadas!';
  const panel =
    'No painel à esquerda você vê todas elas — clique em uma para ajustar prazo, lembrete e o resto.';
  const whatsapp = ctx.whatsappVerified
    ? 'Eu também estou no WhatsApp: me manda uma mensagem a qualquer hora para registrar uma tarefa nova ou lembrar de algo.'
    : 'Se quiser falar comigo pelo WhatsApp também, dá para conectar em Apps.';
  return `${opening} ${panel}\n\n${whatsapp}`;
}
