import type { ChatChoiceField, ChatMessageData, ToolCallData } from '../hooks/useChatStream';

export interface ChatChoiceArtifact {
  content: string;
  contentAfter: string;
  question?: string;
  choices: string[];
  /** Set only when the backend's structured question told us the field. */
  field?: ChatChoiceField;
}

const BULLET_RE = /^(?:[•\-\*]|\d+[.)]|[A-Ea-e][.)])\s+(.+)$/;
const FACT_LABEL_RE = /^(prazo|categoria|prioridade|hor[aá]rio|t[ií]tulo|resumo|atualiza[cç][aã]o)\s*:/i;
const MAX_CHOICES = 5;
const MIN_CHOICES = 2;
const MAX_CHOICE_LENGTH = 80;
const MAX_QUESTION_LENGTH = 200;

function stripInlineMarkdown(text: string): string {
  return text.replace(/\*\*/g, '').trim();
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n');
}

function isChecklist(line: string): boolean {
  return /^[-*]\s+\[[ xX]\]/.test(line);
}

function parseChoiceLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || isChecklist(trimmed)) return null;
  const match = trimmed.match(BULLET_RE);
  if (!match) return null;
  const choice = stripInlineMarkdown(match[1]);
  if (!choice || choice.length > MAX_CHOICE_LENGTH) return null;
  if (FACT_LABEL_RE.test(choice)) return null;
  return choice;
}

/**
 * Lifts a trailing "question + short exclusive options" block into a choice
 * artifact. Conservative: the line before the bullets must end with `?`.
 */
export function extractTrailingChoices(
  text: string,
): { rest: string; question: string; choices: string[] } | null {
  if (!text.trim()) return null;

  const lines = splitLines(text);
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  const choices: string[] = [];
  let index = lines.length - 1;
  while (index >= 0) {
    const trimmed = lines[index].trim();
    if (trimmed === '') break;
    const choice = parseChoiceLine(trimmed);
    if (!choice) break;
    choices.unshift(choice);
    index -= 1;
  }

  if (choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) return null;

  while (index >= 0 && lines[index].trim() === '') {
    index -= 1;
  }
  if (index < 0) return null;

  const question = stripInlineMarkdown(lines[index].trim());
  if (!/\?\s*$/.test(question) || question.length > MAX_QUESTION_LENGTH) return null;

  const rest = lines.slice(0, index).join('\n').trim();
  return { rest, question, choices };
}

function parseChoices(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => stripInlineMarkdown(item))
    .filter((item) => item.length > 0 && item.length <= MAX_CHOICE_LENGTH)
    .slice(0, MAX_CHOICES);
}

function choicesFromOfferTool(toolCalls: ToolCallData[] | undefined): {
  question?: string;
  choices: string[];
} | null {
  if (!toolCalls?.length) return null;
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const call = toolCalls[i];
    if (call.toolName !== 'offer_choices') continue;
    // Refused by the backend (a system question was already pending) → no artifact.
    if (call.result && !call.result.success) continue;
    const source = call.result?.success && call.result.data ? call.result.data : call.toolArgs;
    const choices = parseChoices(source?.choices);
    if (choices.length < MIN_CHOICES) continue;
    const question =
      typeof source?.question === 'string' ? stripInlineMarkdown(source.question) : '';
    return { question: question || undefined, choices };
  }
  return null;
}

function stripMatchingQuestion(text: string, question?: string): string {
  if (!question || !text.trim()) return text.trim();
  const lines = splitLines(text);
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  if (lines.length === 0) return '';
  const last = stripInlineMarkdown(lines[lines.length - 1].trim());
  if (last === stripInlineMarkdown(question)) {
    lines.pop();
    return lines.join('\n').trim();
  }
  return text.trim();
}

/**
 * Resolves the quick-reply artifact for an assistant message.
 * Source of truth, in order: structured `choicePrompts` on the message (the
 * backend's `choices` event or a seeded conversation), then a successful
 * `offer_choices` tool call, then — legacy fallback — a trailing question +
 * short bullet list in the chat text.
 */
export function resolveChatChoiceArtifact(message: ChatMessageData): ChatChoiceArtifact {
  const fromTool = choicesFromOfferTool(message.toolCalls);
  const seededChoices = parseChoices(message.choicePrompts);
  const seededQuestion = message.choicePromptTitle?.trim() || undefined;
  const seeded =
    seededChoices.length >= MIN_CHOICES
      ? { question: seededQuestion, choices: seededChoices }
      : null;

  const structured =
    seeded && seeded.choices.length >= MIN_CHOICES
      ? seeded
      : fromTool && fromTool.choices.length >= MIN_CHOICES
        ? fromTool
        : null;

  const fromAfter = extractTrailingChoices(message.contentAfter || '');
  const fromContent = extractTrailingChoices(message.content);

  if (structured) {
    let content = message.content;
    let contentAfter = message.contentAfter || '';
    if (fromContent) content = fromContent.rest;
    if (fromAfter) contentAfter = fromAfter.rest;
    content = stripMatchingQuestion(content, structured.question);
    contentAfter = stripMatchingQuestion(contentAfter, structured.question);
    return {
      content,
      contentAfter,
      question: structured.question || fromAfter?.question || fromContent?.question,
      choices: structured.choices,
      ...(structured === seeded && message.choiceField ? { field: message.choiceField } : {}),
    };
  }

  if (fromAfter) {
    return {
      content: message.content,
      contentAfter: fromAfter.rest,
      question: fromAfter.question,
      choices: fromAfter.choices,
    };
  }

  if (fromContent) {
    return {
      content: fromContent.rest,
      contentAfter: message.contentAfter || '',
      question: fromContent.question,
      choices: fromContent.choices,
    };
  }

  const leftover = parseChoices(message.choicePrompts);
  return {
    content: message.content,
    contentAfter: message.contentAfter || '',
    question: message.choicePromptTitle,
    choices: leftover,
    ...(message.choiceField ? { field: message.choiceField } : {}),
  };
}
