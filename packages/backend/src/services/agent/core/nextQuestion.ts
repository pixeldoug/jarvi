/**
 * Backend-owned "next question" policy.
 *
 * The task tríade (o quê / quando / como lembrar) is product policy derived
 * from PERSISTED state — not something the model has to remember to ask via
 * `offer_choices`. This module decides the question and its quick replies;
 * `runAgent` emits it (structured on the web, text on WhatsApp) and the
 * sentence gate drops any re-ask by the model.
 *
 * The tríade is a small STATE MACHINE over the task row (`decideNextQuestion`):
 *
 *   due_date missing  → "Quando você pretende fazer isso?"   (or the person skipped: stop)
 *   time missing      → "Qual horário?"                      (or skipped: go on)
 *   reminders = 0     → "Quer que eu te lembre?"             (only if we can deliver one)
 *   otherwise         → nothing to ask
 *
 * Explicit skips ("Ainda não sei", "Sem horário", "Sem lembrete") are persisted
 * on the task (`agent_triad_skips`) so a declined field is never asked again.
 * Two special due_date reasons come from the date guard, not from the state:
 *   - the user named a period without a day       → "Qual dia dessa semana?" + concrete days
 *   - a past day the model proposed was held      → the prazo question again
 *
 * The machine only runs at tríade TRANSITIONS — task creation, an answer to a
 * system question, the onboarding queue — never on arbitrary later edits, so
 * moving an old task's date does not reopen the horário question.
 */

import { addDaysToIsoDate, normalizeTaskDueDate, normalizeTaskTime, parseTriadSkips } from './tasks';
import { getDateTimeForTimezone } from './time';
import {
  detectDateExpressions,
  periodNeedingDay,
  questionForPeriod,
  type DateExpression,
} from './dateExpressions';
import type { AgentOperation, AgentPendingQuestion, AgentTriadField, TaskRow } from './types';

export const DUE_DATE_QUESTION = 'Quando você pretende fazer isso?';
export const DUE_DATE_CHOICES = ['Hoje', 'Amanhã', 'Esta semana', 'Ainda não sei'];
export const TIME_QUESTION = 'Qual horário?';
/** The web adds its own "Escolher horário" chip (time picker), so the list stays short. */
export const TIME_CHOICES = ['9h', '14h', '18h', 'Sem horário'];
export const REMINDER_QUESTION = 'Quer que eu te lembre no WhatsApp?';
/** Task has a time: offsets are relative to it. */
export const REMINDER_CHOICES_WITH_TIME = ['No horário', '1 hora antes', '1 dia antes', 'Sem lembrete'];
/** Day-only task: a relative reminder would fire at midnight, so these are 9h absolutes. */
export const REMINDER_CHOICES_DAY_ONLY = ['No dia (9h)', 'Na véspera (9h)', 'Sem lembrete'];

/** The quick reply that means "don't ask me this again for this task". */
export const SKIP_LABELS: Record<AgentTriadField, string> = {
  due_date: 'Ainda não sei',
  time: 'Sem horário',
  reminders: 'Sem lembrete',
};

const SHORT_WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

function dayChip(isoDate: string): string {
  const day = Number(isoDate.slice(8, 10));
  return `${SHORT_WEEKDAYS[weekdayOf(isoDate)]}, ${day}`;
}

function lastDayOfMonth(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  return `${isoDate.slice(0, 8)}${String(last).padStart(2, '0')}`;
}

/**
 * 2–4 concrete days inside the period the user named, as chips ("Ter, 25").
 * The web adds its own "Escolher data" chip, so the list stays short.
 */
export function concreteDayChoices(expression: DateExpression, todayIso: string): string[] {
  const tomorrow = addDaysToIsoDate(todayIso, 1);
  const out: string[] = [];
  const push = (iso: string) => {
    if (iso > todayIso && !out.includes(iso)) out.push(iso);
  };

  switch (expression.kind) {
    case 'period_this_week': {
      // Remaining days up to Saturday (Sunday is the week's last day here).
      const daysToSaturday = (6 - weekdayOf(todayIso) + 7) % 7;
      for (let i = 1; i <= daysToSaturday && out.length < 4; i++) push(addDaysToIsoDate(todayIso, i));
      if (out.length === 0) push(tomorrow);
      break;
    }
    case 'period_next_week': {
      const daysToMonday = ((1 - weekdayOf(todayIso) + 7) % 7) || 7;
      const monday = addDaysToIsoDate(todayIso, daysToMonday);
      push(monday);
      push(addDaysToIsoDate(monday, 2));
      push(addDaysToIsoDate(monday, 4));
      break;
    }
    case 'period_this_month': {
      const last = lastDayOfMonth(todayIso);
      for (const offset of [2, 7, 14]) {
        const iso = addDaysToIsoDate(todayIso, offset);
        if (iso <= last) push(iso);
      }
      push(last);
      break;
    }
    default:
      push(tomorrow);
      push(addDaysToIsoDate(todayIso, 2));
      push(addDaysToIsoDate(todayIso, 3));
  }
  return out.slice(0, 4).map(dayChip);
}

/** Task the question is about, when known. */
export interface TaskRef {
  id?: string;
  title?: string;
}

function withTask(question: AgentPendingQuestion, task?: TaskRef): AgentPendingQuestion {
  return {
    ...question,
    ...(task?.id ? { taskId: task.id } : {}),
    ...(task?.title ? { taskTitle: task.title } : {}),
  };
}

export function periodQuestion(
  expression: DateExpression,
  timezone: string,
  task?: TaskRef | string,
): AgentPendingQuestion {
  const { isoDate: today } = getDateTimeForTimezone(timezone);
  return withTask(
    {
      field: 'due_date',
      reason: 'period_needs_day',
      expression: expression.text,
      text: questionForPeriod(expression),
      choices: concreteDayChoices(expression, today),
    },
    typeof task === 'string' ? { id: task } : task,
  );
}

export function dueDateQuestion(
  reason: 'missing_due_date' | 'past_date_held',
  task?: TaskRef | string,
): AgentPendingQuestion {
  return withTask(
    { field: 'due_date', reason, text: DUE_DATE_QUESTION, choices: [...DUE_DATE_CHOICES] },
    typeof task === 'string' ? { id: task } : task,
  );
}

/**
 * Tríade, passo 2 (QUANDO), second half: the person just told us the day, so
 * the natural next question is the time — asked by the system, with quick
 * replies, instead of the model offering "posso ajudar com horário…".
 */
export function timeQuestion(task?: TaskRef | string): AgentPendingQuestion {
  return withTask(
    { field: 'time', reason: 'missing_time', text: TIME_QUESTION, choices: [...TIME_CHOICES] },
    typeof task === 'string' ? { id: task } : task,
  );
}

/** Tríade, passo 3 (COMO LEMBRAR). The chips depend on whether the task has a time. */
export function reminderQuestion(hasTime: boolean, task?: TaskRef): AgentPendingQuestion {
  return withTask(
    {
      field: 'reminders',
      reason: 'missing_reminder',
      text: REMINDER_QUESTION,
      choices: hasTime ? [...REMINDER_CHOICES_WITH_TIME] : [...REMINDER_CHOICES_DAY_ONLY],
    },
    task,
  );
}

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

export interface TriadState {
  taskId?: string;
  taskTitle?: string;
  dueDate: string | null;
  time: string | null;
  remindersCount: number;
  /** Fields the user explicitly declined (see `agent_triad_skips`). */
  skips: string[];
}

export interface TriadPolicy {
  /** Whether a reminder can actually reach the person (verified WhatsApp). */
  canRemind: boolean;
  /**
   * The user's message already names a time the executor did not persist;
   * never guess it and never ask for it in the same turn (the model may still
   * save it). Nothing further is asked either — the tríade is not settled.
   */
  timeNamedButUnsaved?: boolean;
}

export function triadStateOf(task: TaskRow, remindersCount: number): TriadState {
  return {
    taskId: task.id,
    taskTitle: task.title,
    dueDate: normalizeTaskDueDate(task.due_date),
    time: normalizeTaskTime(task.time),
    remindersCount,
    skips: parseTriadSkips(task.agent_triad_skips),
  };
}

/**
 * Pure: task state → the ONE question to ask next, or null when the tríade is
 * settled (every field filled or explicitly skipped, or nothing applies).
 */
export function decideNextQuestion(state: TriadState, policy: TriadPolicy): AgentPendingQuestion | null {
  const task: TaskRef = { id: state.taskId, title: state.taskTitle };
  if (!state.dueDate) {
    // Without a day, neither the time nor a reminder makes sense yet.
    return state.skips.includes('due_date') ? null : dueDateQuestion('missing_due_date', task);
  }
  if (!state.time) {
    if (policy.timeNamedButUnsaved) return null;
    if (!state.skips.includes('time')) return timeQuestion(task);
  }
  if (policy.canRemind && state.remindersCount === 0 && !state.skips.includes('reminders')) {
    return reminderQuestion(state.time !== null, task);
  }
  return null;
}

/** True when nothing is left to ask for this task (given the same policy). */
export function isTriadSettled(state: TriadState, policy: TriadPolicy): boolean {
  return decideNextQuestion(state, policy) === null;
}

// A reply that is essentially just the period ("essa semana", "acho que
// semana que vem") — the user answering the prazo question. Longer messages
// use "essa semana" narratively far more often, so they never trigger this.
const BARE_PERIOD_MAX_WORDS = 6;

/**
 * When the user's whole message is a period without a day, the prazo question
 * continues with concrete days — even if the model made no tool call (the
 * prompt forbids `update_task` for periods, so there is no executor hook).
 */
export function bareperiodReply(
  message: string | undefined | null,
  timezone: string,
): DateExpression | null {
  if (!message) return null;
  const words = message.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > BARE_PERIOD_MAX_WORDS) return null;
  return periodNeedingDay(detectDateExpressions(message, timezone));
}

/** Unique questions in a batch, last one per (field, taskId) wins. */
export function collectQuestions(operations: AgentOperation[]): AgentPendingQuestion[] {
  const byKey = new Map<string, AgentPendingQuestion>();
  for (const op of operations) {
    const q = op.pendingQuestion;
    if (!q) continue;
    byKey.set(`${q.field}:${q.taskId ?? ''}`, q);
  }
  return Array.from(byKey.values());
}
