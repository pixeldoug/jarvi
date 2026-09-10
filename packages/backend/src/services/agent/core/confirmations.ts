/**
 * Backend-owned confirmations.
 *
 * With `profile.reliableExecution`, the text that tells the user what was
 * created / edited / completed / deleted is generated HERE, from the
 * operations record — never by the model. The model's own text is passed
 * through a sentence gate that drops confirmation claims (they are either
 * redundant or, worse, false) and keeps everything else: questions, advice,
 * briefings.
 *
 * Both channels use the same rules; only the surface formatting differs
 * (WhatsApp has no task card, so it echoes title + date; web has the card, so
 * a successful create says nothing and edits stay short). Multi-task batches
 * always distinguish successes from failures.
 *
 * Tools that are not writes from the user's point of view (search_web,
 * offer_choices, complete_onboarding_journey, show_*) never produce a
 * confirmation and never count as "a write happened" for the claim gate.
 */

import { CREATION_CLAIM_REGEX, UPDATE_CLAIM_REGEX } from './guardrails';
import { formatDueDateLabel } from './time';
import type { AgentOperation, AgentOperationEntity, ChannelProfile } from './types';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const PRIORITY_LABELS: Record<string, string> = {
  high: 'alta',
  medium: 'média',
  low: 'baixa',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'título',
  description: 'descrição',
  due_date: 'prazo',
  time: 'horário',
  priority: 'prioridade',
  category: 'categoria',
  recurrence_type: 'recorrência',
  recurrence_config: 'recorrência',
  recurrence_until: 'recorrência',
  reminders: 'lembretes',
  task_id: 'tarefa',
  list_id: 'lista',
  category_id: 'categoria',
  name: 'nome',
};

export function fieldLabel(path: string): string {
  const root = path.split(/[.[]/)[0];
  return FIELD_LABELS[root] ?? root;
}

const WRITE_TASK_TOOLS = new Set(['create_task', 'update_task', 'complete_task', 'delete_task']);
const WRITE_LIST_TOOLS = new Set(['create_list', 'update_list', 'delete_list']);
const WRITE_CATEGORY_TOOLS = new Set(['create_category', 'update_category', 'delete_category']);

export function isWriteTool(tool: string): boolean {
  return (
    WRITE_TASK_TOOLS.has(tool) ||
    WRITE_LIST_TOOLS.has(tool) ||
    WRITE_CATEGORY_TOOLS.has(tool) ||
    tool === 'update_memory'
  );
}

/** Tools whose outcome the user must be told about (memory stays silent by design). */
function isUserVisibleWrite(op: AgentOperation): boolean {
  return op.kind === 'write' && op.tool !== 'update_memory';
}

// ---------------------------------------------------------------------------
// Title / change formatting per surface
// ---------------------------------------------------------------------------

type Surface = 'plain' | 'markdown';

function quote(title: string | undefined, surface: Surface): string {
  const t = (title ?? '').trim();
  if (!t) return 'a tarefa';
  return surface === 'plain' ? `*${t}*` : `"${t}"`;
}

/**
 * Structured reference to a task inside backend text. The web renders it as
 * the inline task mention (clickable, opens the task); anything else falls
 * back to the quoted title. Format: `{{task:<id>|<title>}}`.
 */
export const TASK_REF_REGEX = /\{\{task:([^|}]*)\|([^}]*)\}\}/g;

export function taskRef(entity: AgentOperationEntity | undefined, surface: Surface): string {
  const title = (entity?.title ?? '').trim();
  if (surface !== 'markdown' || !entity?.id || !title) return quote(title, surface);
  return `{{task:${entity.id}|${title.replace(/[|}]/g, ' ')}}}`;
}

// ---------------------------------------------------------------------------
// Task references written by the MODEL
// ---------------------------------------------------------------------------

/**
 * Tasks the model is allowed to reference this turn: everything in the prompt
 * (active list, focused task) plus whatever a tool returned (search_tasks,
 * create/update results). Anything else is a hallucinated id and must not
 * become a clickable mention.
 */
export type KnownTasks = Map<string, string>;

/**
 * Resolve `{{task:id|title}}` tokens the model wrote. A known id keeps the
 * token (with the persisted title, so display never drifts from the task);
 * an unknown id — or a plain surface — falls back to the bare title. Tokens
 * without a title are dropped rather than shown raw.
 */
export function resolveTaskRefs(text: string, known: KnownTasks, surface: Surface): string {
  return text.replace(TASK_REF_REGEX, (_m, rawId: string, rawTitle: string) => {
    const id = rawId.trim();
    const title = rawTitle.trim();
    const persisted = id ? known.get(id) : undefined;
    if (surface === 'markdown' && persisted) {
      return `{{task:${id}|${persisted.replace(/[|}]/g, ' ')}}}`;
    }
    if (surface === 'markdown' && !persisted) {
      console.warn('[TaskRef] unknown id from model, downgraded to text id=%s title=%s', id, title);
    }
    return title || persisted || '';
  });
}

/**
 * Streaming variant of `resolveTaskRefs`: holds back text from `{{` until the
 * token closes (or turns out not to be one), so the client never renders a
 * half-written token. Everything else streams through untouched.
 */
export class TaskRefGuard {
  private buffer = '';

  constructor(
    private readonly known: KnownTasks,
    private readonly surface: Surface,
    private readonly emit: (chunk: string) => void,
  ) {}

  push(delta: string): void {
    if (!delta) return;
    this.buffer += delta;
    this.drain(false);
  }

  flush(): void {
    this.drain(true);
  }

  private drain(final: boolean): void {
    let out = '';
    while (this.buffer.length > 0) {
      const open = this.buffer.indexOf('{{');
      if (open === -1) {
        // A lone trailing "{" may be the start of "{{" — keep it back.
        const hold = !final && this.buffer.endsWith('{') ? 1 : 0;
        out += this.buffer.slice(0, this.buffer.length - hold);
        this.buffer = this.buffer.slice(this.buffer.length - hold);
        break;
      }
      out += this.buffer.slice(0, open);
      this.buffer = this.buffer.slice(open);

      const close = this.buffer.indexOf('}}');
      if (close !== -1) {
        const token = this.buffer.slice(0, close + 2);
        this.buffer = this.buffer.slice(close + 2);
        out += resolveTaskRefs(token, this.known, this.surface);
        continue;
      }

      // Unterminated. Still plausibly a token? Keep holding; otherwise (too
      // long, newline, or end of stream) it was never a ref — let it through.
      const looksLikeRef = /^\{\{(?:t(?:a(?:s(?:k(?::[^\n}]*)?)?)?)?)?$/.test(this.buffer);
      if (!final && looksLikeRef && this.buffer.length < 240) break;
      out += this.buffer.slice(0, 2);
      this.buffer = this.buffer.slice(2);
    }
    if (out) this.emit(out);
  }
}

// The sentence gate splits on "|" (WhatsApp fragments). The pipe inside a task
// ref is structure, not a separator — mask it while segmenting.
const REF_PIPE_MASK = '\uE000';
const REF_LOOKS_OPEN_REGEX = /\{\{[^}]*$/;

function maskRefPipes(text: string): string {
  return text.replace(TASK_REF_REGEX, (m) => m.replace('|', REF_PIPE_MASK));
}

function unmaskRefPipes(text: string): string {
  return text.split(REF_PIPE_MASK).join('|');
}

function greeting(preferredName: string | undefined): string {
  const name = (preferredName ?? '').trim();
  return name ? `Pronto, ${name}!` : 'Pronto!';
}

function describeChanges(op: AgentOperation): string[] {
  const changes = op.persisted ?? {};
  const parts: string[] = [];
  const has = (k: string) => Object.prototype.hasOwnProperty.call(changes, k);

  if (has('due_date') || has('time')) {
    const due = has('due_date') ? (changes.due_date as string | null) : undefined;
    const time = has('time') ? (changes.time as string | null) : undefined;
    if (due === null && time === null) parts.push('prazo e horário removidos');
    else if (due === null) parts.push('prazo removido');
    else if (due !== undefined) {
      const label =
        (changes.due_label as string | undefined) ?? formatDueDateLabel(due, time ?? null);
      parts.push(label ? `prazo ${label}` : 'prazo');
    } else if (time === null) parts.push('horário removido');
    else if (time !== undefined) parts.push(`horário ${time}`);
  }
  if (has('priority')) {
    const p = changes.priority as string | null;
    parts.push(p ? `prioridade ${PRIORITY_LABELS[p] ?? p}` : 'prioridade removida');
  }
  if (has('category')) {
    const c = changes.category as string | null;
    parts.push(c ? `categoria ${c}` : 'categoria removida');
  }
  if (has('title')) parts.push('título');
  if (has('description')) parts.push(changes.description === null ? 'descrição removida' : 'descrição');
  if (has('recurrence_type')) {
    parts.push(changes.recurrence_type === 'none' ? 'recorrência removida' : 'recorrência');
  } else if (has('recurrence_config') || has('recurrence_until')) {
    parts.push('recorrência');
  }
  if (has('reminders')) {
    const n = Number(
      changes.reminders_count ?? (Array.isArray(changes.reminders) ? changes.reminders.length : 0),
    );
    if (n === 0) parts.push('lembretes removidos');
    else parts.push(n === 1 ? 'lembrete' : `${n} lembretes`);
  }
  return parts;
}

function failureSentence(op: AgentOperation, surface: Surface): string {
  const verb: Record<string, string> = {
    create_task: 'criar a tarefa',
    update_task: `atualizar ${quote(op.entity?.title, surface)}`,
    complete_task: `concluir ${quote(op.entity?.title, surface)}`,
    delete_task: `excluir ${quote(op.entity?.title, surface)}`,
    create_list: 'criar a lista',
    update_list: 'atualizar a lista',
    delete_list: 'excluir a lista',
    create_category: 'criar a categoria',
    update_category: 'atualizar a categoria',
    delete_category: 'excluir a categoria',
  };
  const what = verb[op.tool] ?? 'fazer isso';
  const code = op.error?.code;

  if (code === 'not_found') {
    if (op.tool.endsWith('_task')) {
      const action: Record<string, string> = {
        update_task: 'atualizar',
        complete_task: 'concluir',
        delete_task: 'excluir',
      };
      return `Não encontrei a tarefa para ${action[op.tool] ?? 'alterar'}.`;
    }
    if (op.tool.endsWith('_list')) return 'Não encontrei essa lista.';
    if (op.tool.endsWith('_category')) return 'Não encontrei essa categoria.';
    return 'Não encontrei esse item.';
  }
  if (code === 'invalid_arguments') {
    const fields = (op.notes ?? [])
      .filter((n) => n.startsWith('invalid:'))
      .map((n) => fieldLabel(n.slice('invalid:'.length)));
    const unique = Array.from(new Set(fields));
    return unique.length
      ? `Não consegui ${what}: dados inválidos em ${unique.join(', ')}.`
      : `Não consegui ${what}: dados inválidos.`;
  }
  const detail = op.error?.message?.trim();
  return detail ? `Não consegui ${what}: ${detail.replace(/\.$/, '')}.` : `Não consegui ${what}.`;
}

// ---------------------------------------------------------------------------
// Confirmation builder
// ---------------------------------------------------------------------------

/**
 * Build the confirmation for a batch of operations (normally one run-loop
 * iteration). Returns null when there is nothing the user must be told.
 */
export interface ConfirmationOptions {
  /** First name for the web greeting ("Pronto, Doug!"). */
  preferredName?: string;
}

export function buildConfirmation(
  operations: AgentOperation[],
  profile: Pick<ChannelProfile, 'outputFormat'>,
  options: ConfirmationOptions = {},
): string | null {
  const surface: Surface = profile.outputFormat;
  const ops = operations.filter(isUserVisibleWrite);
  if (ops.length === 0) return null;

  const ok = (tool: string) => ops.filter((o) => o.tool === tool && o.success);
  const created = ok('create_task').filter((o) => !o.duplicate);
  const duplicates = ok('create_task').filter((o) => o.duplicate);
  const updated = ok('update_task').filter((o) => !o.unchanged);
  const unchanged = ok('update_task').filter((o) => o.unchanged);
  const completed = ok('complete_task');
  const deleted = ok('delete_task');
  const failures = ops.filter((o) => !o.success);

  const lines: string[] = [];

  // ── Tasks: creation ────────────────────────────────────────────────────
  // WhatsApp has no task UI, so the backend echoes title + date. The web
  // renders the task as an inline mention (`{{task:id|title}}` → clickable
  // chip) and the fields live in the task itself, so the line is just
  // "Pronto, Doug! Criei <mention>." — the model keeps the human part.
  if (surface === 'plain') {
    if (created.length === 1) {
      const op = created[0];
      lines.push(`Salvo! Tarefa ${quote(op.entity?.title, surface)} criada! 🗓️`);
      const dueLabel = op.persisted?.due_label as string | null | undefined;
      if (dueLabel) lines.push(dueLabel);
    } else if (created.length > 1) {
      lines.push(`Salvo! ${created.length} tarefas criadas! 🗓️`);
      for (const op of created) {
        const dueLabel = op.persisted?.due_label as string | null | undefined;
        lines.push(`${quote(op.entity?.title, surface)}${dueLabel ? ` | ${dueLabel}` : ''}`);
      }
    }
  } else if (created.length === 1) {
    lines.push(`${greeting(options.preferredName)} Criei ${taskRef(created[0].entity, surface)}.`);
  } else if (created.length > 1) {
    lines.push(
      `${greeting(options.preferredName)} Criei ${created.length} tarefas: ${created
        .map((op) => taskRef(op.entity, surface))
        .join(', ')}.`,
    );
  }
  for (const op of duplicates) {
    lines.push(
      surface === 'plain'
        ? `${quote(op.entity?.title, surface)} já está na sua lista.`
        : 'Essa tarefa já existe na sua lista.',
    );
  }

  // ── Tasks: updates ─────────────────────────────────────────────────────
  if (updated.length === 1) {
    const op = updated[0];
    const changes = describeChanges(op);
    if (surface === 'plain') {
      lines.push(
        changes.length
          ? `Atualizei ${quote(op.entity?.title, surface)}: ${changes.join(', ')}.`
          : `Atualizei ${quote(op.entity?.title, surface)}.`,
      );
    } else if (changes.length === 1 && /lembrete/.test(changes[0])) {
      // A reminder is not visible on the task card the way a prazo is — say it.
      lines.push(
        changes[0] === 'lembretes removidos'
          ? 'Pronto, lembretes removidos.'
          : changes[0] === 'lembrete'
            ? 'Pronto, lembrete salvo.'
            : 'Pronto, lembretes salvos.',
      );
    } else {
      lines.push('Pronto, atualizei a tarefa.');
    }
  } else if (updated.length > 1) {
    if (surface === 'plain') {
      lines.push(`Atualizei ${updated.length} tarefas:`);
      for (const op of updated) {
        const changes = describeChanges(op);
        lines.push(
          `${quote(op.entity?.title, surface)}${changes.length ? `: ${changes.join(', ')}` : ''}`,
        );
      }
    } else {
      // The web UI collapses multiple update cards into a count with no
      // titles — naming them here is the only way the user knows which ones.
      lines.push(
        `Pronto! Atualizei ${updated.length} tarefas: ${updated
          .map((op) => quote(op.entity?.title, surface))
          .join(', ')}.`,
      );
    }
  }
  for (const op of unchanged) {
    lines.push(
      surface === 'plain'
        ? `Nada foi alterado em ${quote(op.entity?.title, surface)}.`
        : 'Nada foi alterado na tarefa.',
    );
  }

  // ── Tasks: completion / deletion ───────────────────────────────────────
  if (completed.length > 0) {
    if (surface === 'plain') {
      for (const op of completed) lines.push(`${(op.entity?.title ?? 'Tarefa').trim()} concluída.`);
    } else {
      lines.push(
        completed.length === 1
          ? 'Pronto! Tarefa concluída.'
          : `Pronto! ${completed.length} tarefas concluídas.`,
      );
    }
  }
  if (deleted.length > 0) {
    if (surface === 'plain') {
      for (const op of deleted) lines.push(`${(op.entity?.title ?? 'Tarefa').trim()} excluída.`);
    } else {
      lines.push(
        deleted.length === 1 ? 'Tarefa excluída.' : `${deleted.length} tarefas excluídas.`,
      );
    }
  }

  // ── Lists & categories (web) ───────────────────────────────────────────
  for (const op of ops.filter((o) => o.success && WRITE_LIST_TOOLS.has(o.tool))) {
    const name = op.entity?.title ? `"${op.entity.title}"` : '';
    if (op.tool === 'create_list') lines.push(`Lista ${name} criada.`.replace('  ', ' '));
    else if (op.tool === 'update_list') lines.push(`Lista ${name} atualizada.`.replace('  ', ' '));
    else lines.push('Lista excluída.');
  }
  for (const op of ops.filter((o) => o.success && WRITE_CATEGORY_TOOLS.has(o.tool))) {
    const name = op.entity?.title ? `"${op.entity.title}"` : '';
    if (op.tool === 'create_category') lines.push(`Categoria ${name} criada.`.replace('  ', ' '));
    else if (op.tool === 'update_category') lines.push(`Categoria ${name} atualizada.`.replace('  ', ' '));
    else lines.push('Categoria excluída.');
  }

  // ── Failures — always last, always explicit ────────────────────────────
  for (const op of failures) lines.push(failureSentence(op, surface));

  return lines.length ? lines.join('\n') : null;
}

// ---------------------------------------------------------------------------
// Model-text gate: drop confirmation claims, keep everything else
// ---------------------------------------------------------------------------

// JS `\b` is ASCII-only: `\bconcluí\b` never matches because "í" is not a
// word character. Word boundaries here are Unicode-aware lookarounds instead.
const NOT_LETTER_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_LETTER_AFTER = '(?![\\p{L}\\p{N}])';
function words(alternatives: string, flags = 'iu'): RegExp {
  return new RegExp(`${NOT_LETTER_BEFORE}(?:${alternatives})${NOT_LETTER_AFTER}`, flags);
}

const COMPLETION_CLAIM_REGEX = words(
  'conclu[íi]|finalizei|exclu[íi]|deletei|removi|apaguei|reagendei|reprogramei',
);

// The legacy guardrail regexes use ASCII `\b`; re-declared here with Unicode
// boundaries so "criei"/"atualizei" followed by punctuation or accents match.
const CREATION_CLAIM_WORDS = words(
  '(?<!mensagem )(?<!msg )(?<!texto )(?<!recado )(?<!frase )(?:sugerida|sugeri|criada|criei|anotei|agendei|registrei)',
);
const UPDATE_CLAIM_WORDS = words(
  'atualizei|alterei|ajustei|corrigi|mudei|deixei|ficou com|ficou para|ficou pra|defini|marquei|coloquei|salvei|adicionei|tirei|limpei|zerei|desmarquei|adiei|antecipei|movi|troquei|editei|renomeei|priorizei',
);

// "a tarefa foi criada", "prazo definido", "lembrete configurado", ...
const STATE_CLAIM_REGEX = new RegExp(
  `${NOT_LETTER_BEFORE}(?:tarefa|tarefas|prazo|data|hor[áa]rio|prioridade|categoria|lembrete|lembretes|recorr[êe]ncia|descri[çc][ãa]o|t[íi]tulo|lista|isso|tudo)${NOT_LETTER_AFTER}[^.!?\\n]{0,50}${NOT_LETTER_BEFORE}(?:criad[ao]s?|atualizad[ao]s?|conclu[íi]d[ao]s?|exclu[íi]d[ao]s?|deletad[ao]s?|removid[ao]s?|salv[ao]s?|registrad[ao]s?|agendad[ao]s?|marcad[ao]s?|reagendad[ao]s?|alterad[ao]s?|ajustad[ao]s?|definid[ao]s?|configurad[ao]s?|adicionad[ao]s?|anotad[ao]s?|pront[ao]s?)${NOT_LETTER_AFTER}`,
  'iu',
);

// Passive/state restatements of a write with ANY subject: "a conta de luz foi
// concluída", "o dentista já está sem data", "isso ficou salvo".
const PASSIVE_CLAIM_REGEX = new RegExp(
  `${NOT_LETTER_BEFORE}(?:foi|foram|est[áa]|est[ãa]o|ficou|ficaram|j[áa]\\s+(?:foi|est[áa]|ficou))\\s+(?:criad|conclu[íi]d|finalizad|exclu[íi]d|deletad|removid|apagad|atualizad|salv|registrad|agendad|marcad|reagendad|alterad|ajustad|definid|configurad|adicionad|anotad)[ao]s?${NOT_LETTER_AFTER}`,
  'iu',
);

const ACK_ONLY_REGEX =
  /^\W*(feito|pronto|prontinho|salvo|beleza|perfeito|combinado|ok|okay|certo|anotado|registrado)\W*$/iu;

const ACK_PREFIX_REGEX =
  /^\W*(feito|pronto|prontinho|salvo|beleza|perfeito|combinado|ok|okay|certo)\s*[!.,…:]/iu;

// A sentence that negates a write ("não criei", "ainda não atualizei", "não
// foi encontrado", "nada foi alterado") is honesty, not a claim — kept. The
// negation must sit right before the claim verb: "deixei isso organizado pra
// não se perder" is a claim with an unrelated "não" in it.
const CLAIM_VERB_ALTERNATIVES =
  'conclu[íi]|finalizei|exclu[íi]|deletei|removi|apaguei|reagendei|reprogramei|criei|anotei|agendei|registrei|atualizei|alterei|ajustei|corrigi|mudei|deixei|defini|marquei|coloquei|salvei|adicionei|tirei|limpei|zerei|desmarquei|adiei|antecipei|movi|troquei|editei|renomeei|priorizei|consegui|foi|foram|est[áa]|est[ãa]o|ficou|ficaram|(?:criad|conclu[íi]d|finalizad|exclu[íi]d|deletad|removid|apagad|atualizad|salv|registrad|agendad|marcad|reagendad|alterad|ajustad|definid|configurad|adicionad|anotad|encontrad)[ao]s?';
const NEGATED_CLAIM_REGEX = new RegExp(
  `${NOT_LETTER_BEFORE}(?:n[ãa]o|nem|nunca|nenhum[a]?|nada|ainda)\\s+(?:\\S+\\s+){0,2}?(?:${CLAIM_VERB_ALTERNATIVES})${NOT_LETTER_AFTER}`,
  'iu',
);

const CALENDAR_EMOJI_REGEX = /🗓️|🗓/u;

// A bare schedule line ("Segunda-feira, 14/09 às 14h00", "Amanhã às 9h") is
// the model echoing (or inventing) the due label the backend already printed.
// Dropped only when a write happened — as an answer to "quando é X?" it stays.
const DATE_LINE_REGEX =
  /^\W*(?:(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:-feira)?|hoje|amanh[ãa]|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:[,\s]+(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|de\s+\p{L}+))?(?:[,\s]+(?:[àa]s\s+)?\d{1,2}(?:h|:)\d{0,2})?\W*$/iu;

export interface ClaimGateContext {
  /** Whether any user-visible write ran in this turn so far. */
  hasWrites: () => boolean;
  /** Whether the backend emitted continuity questions in this turn. */
  hasPendingQuestions: () => boolean;
  /** Persisted strings (due labels, titles) whose echo by the model is redundant. */
  persistedEchoes: () => string[];
}

/** Gate context over a (growing) operations record — shared by stream and retry paths. */
export function gateContextFor(operations: AgentOperation[]): ClaimGateContext {
  return {
    hasWrites: () => operations.some(isUserVisibleWrite),
    hasPendingQuestions: () => operations.some((op) => Boolean(op.pendingQuestion)),
    persistedEchoes: () =>
      operations.flatMap((op) => {
        if (!isUserVisibleWrite(op) || !op.success) return [];
        const out: string[] = [];
        const label = op.persisted?.due_label;
        if (typeof label === 'string' && label.length > 0) out.push(label);
        const title = op.entity?.title?.trim();
        if (title && title.length >= 4) out.push(title);
        return out;
      }),
  };
}

// Time/date tokens and glue words that, together with an echoed value, make a
// fragment say nothing new ("alinhamento com o conselho fiscal às 14:00").
const ECHO_NOISE_REGEX =
  /\d{1,2}(?::\d{2}|h\d{0,2})|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?<![\p{L}\p{N}])(?:às|as|em|no|na|nos|nas|de|do|da|dos|das|o|a|os|as|para|pra|pro|com|e|ou|já|só|tarefa|prazo|hor[áa]rio|marcad[ao]|agendad[ao]|fica|ficou|está|esta)(?![\p{L}\p{N}])/giu;

/** True when the sentence is essentially the echoed value plus time/glue words. */
function isBareEcho(sentence: string, echo: string): boolean {
  const lower = sentence.toLowerCase();
  const idx = lower.indexOf(echo.toLowerCase());
  if (idx === -1) return false;
  const residual = (lower.slice(0, idx) + ' ' + lower.slice(idx + echo.length))
    .replace(ECHO_NOISE_REGEX, ' ')
    .replace(/[^\p{L}]/gu, '');
  return residual.length < 8;
}

export function isClaimSentence(sentence: string, ctx: ClaimGateContext): boolean {
  const s = sentence.trim();
  if (!s) return false;
  if (CALENDAR_EMOJI_REGEX.test(s)) return true;
  if (NEGATED_CLAIM_REGEX.test(s)) return false;

  if (ACK_ONLY_REGEX.test(s)) return true;
  if (
    CREATION_CLAIM_REGEX.test(s) ||
    UPDATE_CLAIM_REGEX.test(s) ||
    CREATION_CLAIM_WORDS.test(s) ||
    UPDATE_CLAIM_WORDS.test(s) ||
    COMPLETION_CLAIM_REGEX.test(s) ||
    STATE_CLAIM_REGEX.test(s) ||
    PASSIVE_CLAIM_REGEX.test(s)
  ) {
    return true;
  }
  if (ACK_PREFIX_REGEX.test(s)) return true;

  if (ctx.hasWrites()) {
    if (DATE_LINE_REGEX.test(s)) return true;
    // An echo of what was persisted (title, due label) is only dropped when
    // the fragment says nothing else — "Quer que eu te lembre do Dentista na
    // véspera?" mentions the title and stays.
    for (const echo of ctx.persistedEchoes()) {
      if (echo && isBareEcho(s, echo)) return true;
    }
  }
  return false;
}

// Imperative asks without a question mark ("me diz qual dia", "qual dia exato
// pra eu ajustar") — the model re-asking what the backend already asked.
const IMPERATIVE_ASK_REGEX = new RegExp(
  `${NOT_LETTER_BEFORE}(?:me\\s+(?:diz|diga|fala|conta|informa|passa|manda|mande|envia|avisa)|qual\\s+(?:o\\s+)?dia|que\\s+dia|quando\\s+(?:seria|fica|é)|falt(?:a|ou)\\s+(?:só\\s+|apenas\\s+)?(?:definir\\s+|combinar\\s+|saber\\s+)?(?:o\\s+)?dia|dia\\s+(?:exato|certo|certinho|espec[íi]fico))${NOT_LETTER_AFTER}`,
  'iu',
);

/** The model must not ask when the backend already decided the next question. */
export function isQuestionSentence(sentence: string): boolean {
  const s = sentence.trim();
  return /\?\W*$/.test(s) || IMPERATIVE_ASK_REGEX.test(s);
}

function shouldDrop(sentence: string, ctx: ClaimGateContext): boolean {
  // Judge the words the user reads, not the ref's id/markup.
  const plain = sentence.replace(TASK_REF_REGEX, (_m, _id: string, title: string) => title);
  if (isClaimSentence(plain, ctx)) return true;
  if (ctx.hasPendingQuestions() && isQuestionSentence(plain)) return true;
  return false;
}

/**
 * Split into [content, separator, content, separator, ...] so the original
 * whitespace/newlines can be reassembled around the sentences we keep. The
 * WhatsApp format joins fragments with " | ", so a pipe is a boundary too —
 * otherwise one claim would drag a whole line down (or a negation would
 * shield a whole line of claims).
 */
function segment(text: string): string[] {
  return text.split(/(\n+|(?<=[.!?…])\s+|\s*\|\s*)/);
}

export interface FilterResult {
  text: string;
  dropped: number;
}

export function filterModelText(text: string, ctx: ClaimGateContext): FilterResult {
  if (!text.trim()) return { text: '', dropped: 0 };
  const parts = segment(maskRefPipes(text));
  let out = '';
  let dropped = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? '';
    const sep = parts[i + 1] ?? '';
    if (!sentence.trim()) {
      out += sentence + sep;
      continue;
    }
    if (shouldDrop(unmaskRefPipes(sentence), ctx)) {
      dropped++;
      continue;
    }
    out += sentence + sep;
  }
  return { text: tidy(unmaskRefPipes(out)), dropped };
}

export function tidy(text: string): string {
  return (
    text
      // Pipes orphaned by a dropped neighbour fragment.
      .replace(/(?:\s*\|\s*){2,}/g, ' | ')
      .replace(/^[ \t]*\|[ \t]*/gm, '')
      .replace(/[ \t]*\|[ \t]*$/gm, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Streaming variant of `filterModelText`: buffers deltas until a sentence
 * boundary, then emits or drops whole sentences. `flush()` at the end of an
 * iteration processes the trailing partial sentence.
 */
export class SentenceGate {
  private buffer = '';
  public dropped = 0;

  constructor(
    private readonly ctx: ClaimGateContext,
    private readonly emit: (chunk: string) => void,
  ) {}

  push(delta: string): void {
    this.buffer += delta;
    // A task ref still being written ("{{task:abc|Pag") must not be cut at
    // its pipe: only look for boundaries before the open "{{".
    const masked = maskRefPipes(this.buffer);
    const openAt = masked.search(REF_LOOKS_OPEN_REGEX);
    const searchable = openAt === -1 ? masked : masked.slice(0, openAt);
    // Find the last completed sentence boundary in the buffer.
    const re = /(?:[.!?…]+\s+|\n+|\s*\|\s*)/g;
    let lastEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(searchable)) !== null) lastEnd = m.index + m[0].length;
    if (lastEnd === -1) return;
    const head = masked.slice(0, lastEnd);
    this.buffer = unmaskRefPipes(masked.slice(lastEnd));
    this.process(head);
  }

  flush(): void {
    if (!this.buffer) return;
    const tail = maskRefPipes(this.buffer);
    this.buffer = '';
    this.process(tail);
  }

  /** `chunk` arrives with ref pipes masked; the output is unmasked. */
  private process(chunk: string): void {
    const parts = segment(chunk);
    let out = '';
    for (let i = 0; i < parts.length; i += 2) {
      const sentence = parts[i] ?? '';
      const sep = parts[i + 1] ?? '';
      if (!sentence.trim()) {
        out += sentence + sep;
        continue;
      }
      if (shouldDrop(unmaskRefPipes(sentence), this.ctx)) {
        this.dropped++;
        continue;
      }
      out += sentence + sep;
    }
    if (out) this.emit(unmaskRefPipes(out));
  }
}

/** Honest fallback when the model only claimed things that did not happen. */
export const NOTHING_CHANGED_FALLBACK = 'Ainda não alterei nada. Quer que eu faça isso agora?';
