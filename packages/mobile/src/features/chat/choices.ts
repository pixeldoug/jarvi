/**
 * Quick-reply resolution for assistant messages. Port of
 * packages/web/src/lib/chatChoicePrompts.ts; keep the two in step.
 *
 * Source of truth, in order: structured `choicePrompts` (backend `choices`
 * event or a seeded conversation), a successful `offer_choices` tool call,
 * then a trailing "question + short bullet list" in the text.
 */
import type { ChatChoiceField, ChatMessageData, PendingQuestionRef, ToolCallData } from './types';

export interface ChatChoiceArtifact {
  content: string;
  contentAfter: string;
  question?: string;
  choices: string[];
  field?: ChatChoiceField;
}

const BULLET_RE = /^(?:[•\-*]|\d+[.)]|[A-Ea-e][.)])\s+(.+)$/;
/**
 * Fact bullets ("Prazo: amanhã" / "Due date: tomorrow") are not choices. The
 * agent writes in the user's language, so both languages (same as the web).
 */
const FACT_LABEL_RE =
  /^(prazo|categoria|prioridade|hor[aá]rio|t[ií]tulo|resumo|atualiza[cç][aã]o|due(?: date)?|deadline|category|priority|time|title|summary|update)\s*:/i;
const MAX_CHOICES = 5;
const MIN_CHOICES = 2;
const MAX_CHOICE_LENGTH = 80;
const MAX_QUESTION_LENGTH = 200;

const stripInlineMarkdown = (text: string) => text.replace(/\*\*/g, '').trim();
const splitLines = (text: string) => text.replace(/\r\n/g, '\n').split('\n');

function parseChoiceLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || /^[-*]\s+\[[ xX]\]/.test(trimmed)) return null;
  const match = BULLET_RE.exec(trimmed);
  if (!match) return null;
  const choice = stripInlineMarkdown(match[1]!);
  if (!choice || choice.length > MAX_CHOICE_LENGTH || FACT_LABEL_RE.test(choice)) return null;
  return choice;
}

/** Lifts a trailing question (ending in `?`) followed by 2–5 short bullets. */
export function extractTrailingChoices(text: string): { rest: string; question: string; choices: string[] } | null {
  if (!text.trim()) return null;
  const lines = splitLines(text);
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();

  const choices: string[] = [];
  let index = lines.length - 1;
  while (index >= 0) {
    const trimmed = lines[index]!.trim();
    if (trimmed === '') break;
    const choice = parseChoiceLine(trimmed);
    if (!choice) break;
    choices.unshift(choice);
    index -= 1;
  }
  if (choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) return null;

  while (index >= 0 && lines[index]!.trim() === '') index -= 1;
  if (index < 0) return null;

  const question = stripInlineMarkdown(lines[index]!.trim());
  if (!/\?\s*$/.test(question) || question.length > MAX_QUESTION_LENGTH) return null;

  return { rest: lines.slice(0, index).join('\n').trim(), question, choices };
}

function parseChoices(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(stripInlineMarkdown)
    .filter((item) => item.length > 0 && item.length <= MAX_CHOICE_LENGTH)
    .slice(0, MAX_CHOICES);
}

function choicesFromOfferTool(toolCalls: ToolCallData[] | undefined): { question?: string; choices: string[] } | null {
  for (let i = (toolCalls?.length ?? 0) - 1; i >= 0; i--) {
    const call = toolCalls![i]!;
    if (call.toolName !== 'offer_choices') continue;
    // Refused by the backend (a system question was already pending).
    if (call.result && !call.result.success) continue;
    const source = call.result?.success && call.result.data ? call.result.data : call.toolArgs;
    const choices = parseChoices(source?.choices);
    if (choices.length < MIN_CHOICES) continue;
    const question = typeof source?.question === 'string' ? stripInlineMarkdown(source.question) : '';
    return { question: question || undefined, choices };
  }
  return null;
}

function stripMatchingQuestion(text: string, question?: string): string {
  if (!question || !text.trim()) return text.trim();
  const lines = splitLines(text);
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
  if (lines.length === 0) return '';
  if (stripInlineMarkdown(lines[lines.length - 1]!.trim()) === stripInlineMarkdown(question)) {
    lines.pop();
  }
  return lines.join('\n').trim();
}

export function resolveChoiceArtifact(message: ChatMessageData): ChatChoiceArtifact {
  const seededChoices = parseChoices(message.choicePrompts);
  const seeded =
    seededChoices.length >= MIN_CHOICES
      ? { question: message.choicePromptTitle?.trim() || undefined, choices: seededChoices }
      : null;
  const structured = seeded ?? choicesFromOfferTool(message.toolCalls);

  const fromAfter = extractTrailingChoices(message.contentAfter ?? '');
  const fromContent = extractTrailingChoices(message.content);

  if (structured) {
    const content = stripMatchingQuestion(fromContent ? fromContent.rest : message.content, structured.question);
    const contentAfter = stripMatchingQuestion(
      fromAfter ? fromAfter.rest : (message.contentAfter ?? ''),
      structured.question,
    );
    return {
      content,
      contentAfter,
      question: structured.question ?? fromAfter?.question ?? fromContent?.question,
      choices: structured.choices,
      ...(structured === seeded && message.choiceField ? { field: message.choiceField } : {}),
    };
  }

  if (fromAfter) {
    return { content: message.content, contentAfter: fromAfter.rest, question: fromAfter.question, choices: fromAfter.choices };
  }
  if (fromContent) {
    return {
      content: fromContent.rest,
      contentAfter: message.contentAfter ?? '',
      question: fromContent.question,
      choices: fromContent.choices,
    };
  }
  return {
    content: message.content,
    contentAfter: message.contentAfter ?? '',
    question: message.choicePromptTitle,
    choices: seededChoices,
    ...(message.choiceField ? { field: message.choiceField } : {}),
  };
}

/** The system question still open at the end of the conversation, if any. */
export function pendingQuestionOf(messages: ChatMessageData[]): PendingQuestionRef | undefined {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return undefined;
  if (last.choiceTaskId && last.choiceField && last.choicePrompts?.length) {
    return { taskId: last.choiceTaskId, field: last.choiceField };
  }
  if (last.journeyNudge) return { field: 'journey' };
  return undefined;
}
