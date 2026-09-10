import type { ChatChoiceField, ChatMessageData } from '../hooks/useChatStream';

export const CHOICE_DEFAULT_PLACEHOLDER = 'Como posso te ajudar?';
export const CHOICE_OTHER_PLACEHOLDER = 'Ou digite outra data...';
export const CHOICE_OTHER_TIME_PLACEHOLDER = 'Ou digite outro horário...';
export const CHOICE_OTHER_REMINDER_PLACEHOLDER = 'Ou digite outro lembrete (ex.: 2 horas antes)...';
export const CHOOSE_DATE_LABEL = 'Escolher data';
export const CHOOSE_TIME_LABEL = 'Escolher horário';

export const CHOICE_PREVIEW_QUESTION = 'Quando você pretende fazer isso?';
export const CHOICE_PREVIEW_CHOICES = ['Hoje', 'Amanhã', 'Esta semana', 'Ainda não sei'] as const;
export const CHOICE_PREVIEW_TASK_TITLE = 'Agendar dermatologista';

const PICK_DATE_RE = /escolher(\s+uma)?\s+data/i;
const PICK_TIME_RE = /escolher(\s+um)?\s+hor[aá]rio/i;
const DONT_KNOW_RE = /ainda\s+n[aã]o\s+sei/i;
const NO_TIME_RE = /sem\s+hor[aá]rio/i;

export function isPickDateChoice(label: string): boolean {
  return PICK_DATE_RE.test(label.trim());
}

export function isPickTimeChoice(label: string): boolean {
  return PICK_TIME_RE.test(label.trim());
}

/** Composer placeholder while the artifact is open, matching the field asked. */
export function choiceOtherPlaceholder(field?: ChatChoiceField): string {
  if (field === 'time') return CHOICE_OTHER_TIME_PLACEHOLDER;
  if (field === 'reminders') return CHOICE_OTHER_REMINDER_PLACEHOLDER;
  return CHOICE_OTHER_PLACEHOLDER;
}

/**
 * Chips to render for a question. The picker chip ("Escolher data" /
 * "Escolher horário") is the web's, not the backend's: it goes right before
 * the opt-out chip ("Ainda não sei" / "Sem horário") when there is one. The
 * reminder question has no picker — its chips are the whole answer set.
 */
export function choiceChipsForPrompt(choices: string[], field?: ChatChoiceField): string[] {
  const chips = choices.map((choice) => choice.trim()).filter(Boolean);
  if (field === 'reminders') return chips;
  const isTime = field === 'time';
  const isPicker = isTime ? isPickTimeChoice : isPickDateChoice;
  if (chips.some(isPicker)) return chips;
  const optOutRe = isTime ? NO_TIME_RE : DONT_KNOW_RE;
  const pickerLabel = isTime ? CHOOSE_TIME_LABEL : CHOOSE_DATE_LABEL;
  const insertAt = chips.findIndex((choice) => optOutRe.test(choice));
  if (insertAt >= 0) {
    chips.splice(insertAt, 0, pickerLabel);
  } else {
    chips.push(pickerLabel);
  }
  return chips;
}

export const CHOICE_PREVIEW_TIME_QUESTION = 'Qual horário?';
export const CHOICE_PREVIEW_TIME_CHOICES = ['9h', '14h', '18h', 'Sem horário'] as const;

/** `?choicePreview=1` → prazo artifact; `?choicePreview=time` → horário artifact. */
export function isChoicePreviewRequested(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  const value = new URLSearchParams(window.location.search).get('choicePreview');
  return value === '1' || value === 'time';
}

export function buildChoicePreviewMessages(): ChatMessageData[] {
  const wantsTime =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('choicePreview') === 'time';
  if (wantsTime) {
    return [
      {
        id: 'choice-preview-user',
        role: 'user',
        content: 'Amanhã',
      },
      {
        // Mirrors production: the person answered the date question, the
        // backend confirmed the update and asked the time (`field: time`).
        id: 'choice-preview-assistant',
        role: 'assistant',
        content: 'Pronto, atualizei a tarefa.\n\nBoa, já está no radar.',
        toolCalls: [
          {
            toolName: 'update_task',
            toolArgs: { task_id: 'choice-preview-task', due_date: '2026-09-08' },
            result: {
              success: true,
              data: { id: 'choice-preview-task', title: CHOICE_PREVIEW_TASK_TITLE },
            },
          },
        ],
        choicePromptTitle: CHOICE_PREVIEW_TIME_QUESTION,
        choicePrompts: [...CHOICE_PREVIEW_TIME_CHOICES],
        choiceTaskId: 'choice-preview-task',
        choiceField: 'time',
      },
    ];
  }
  return [
    {
      id: 'choice-preview-user',
      role: 'user',
      content: 'agendar dermatologista',
    },
    {
      // Mirrors production: the backend confirms with a task reference and
      // asks the prazo question itself (`choices` SSE event → choicePrompts).
      id: 'choice-preview-assistant',
      role: 'assistant',
      content: `Pronto, teste! Criei {{task:choice-preview-task|${CHOICE_PREVIEW_TASK_TITLE}}}.\n\nDermatologista é daquelas coisas que a gente acaba empurrando, mas vou te ajudar a deixar isso andando.`,
      toolCalls: [
        {
          toolName: 'create_task',
          toolArgs: { title: CHOICE_PREVIEW_TASK_TITLE },
          result: {
            success: true,
            data: {
              id: 'choice-preview-task',
              title: CHOICE_PREVIEW_TASK_TITLE,
            },
          },
        },
      ],
      choicePromptTitle: CHOICE_PREVIEW_QUESTION,
      choicePrompts: [...CHOICE_PREVIEW_CHOICES],
      choiceTaskId: 'choice-preview-task',
    },
  ];
}
