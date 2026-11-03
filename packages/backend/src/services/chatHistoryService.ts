/**
 * Chats — the history of the user's conversations with the agent on the web:
 * the chat panel on Tarefas / Notas and the Chats page. Read through
 * `/api/chats`; recorded one turn at a time by `/api/ai/chat` (aiController).
 *
 * - `chat_conversations`: one row per conversation. `title` starts as its
 *   first user message; meanwhile `improveTitle` asks a small model for a
 *   short one, kept only while the title is still that first message.
 *   `mode` + `task_id` / `note_id` are the context of its latest turn, which
 *   the Chats page continues it with.
 * - `chat_messages`: the messages in order (`seq`). `content` is the plain
 *   text; `data` (JSON) is what the web rebuilds the message from: a user
 *   message's attachment names (never the files), a reply's stream events
 *   (`events`: the SSE events the web received, minus status / done, text
 *   merged), or the client's snapshot of a message it showed before the
 *   conversation was recorded (`message`, e.g. the onboarding follow-up).
 *
 * WhatsApp keeps its own short-lived history (Redis) and is not recorded here.
 * SQLite does not enforce the FK: deleteConversation and account deletion
 * remove the messages by hand.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import type { ChatMessage, SSEEvent } from './agent';
import { TASK_REF_REGEX } from './agent/core/confirmations';
import { getTaskById } from './agent/core/tasks';
import { getNoteAccess, sanitizeSuggestedTitle } from './noteService';
import { createChatTitleCompletion, type AiTelemetryOptions } from './openaiService';

// ---------------------------------------------------------------------------
// API types (mirrored by packages/web/src/lib/chatsApi.ts)
// ---------------------------------------------------------------------------

export type ChatConversationMode = 'general' | 'task' | 'note';

export interface ChatConversationListItem {
  id: string;
  /** '' when the first message had no text (the web shows "Nova conversa") */
  title: string;
  mode: ChatConversationMode;
  task_id: string | null;
  note_id: string | null;
  created_at: string;
  /** Last message */
  updated_at: string;
}

/** A stream event worth keeping: all but the transient `status` / `done`. */
export type RecordedChatEvent = Exclude<SSEEvent, { type: 'status' } | { type: 'done' }>;

export interface ChatAttachmentName {
  name: string;
  mimeType: string;
}

export interface ChatStoredMessageData {
  attachments?: ChatAttachmentName[];
  events?: RecordedChatEvent[];
  message?: Record<string, unknown>;
}

export interface ChatStoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** null: plain text */
  data: ChatStoredMessageData | null;
  created_at: string;
}

export interface ChatConversationDetail extends ChatConversationListItem {
  messages: ChatStoredMessage[];
}

export const CHAT_ID_MAX_LENGTH = 64;
export const CHAT_TITLE_MAX_CHARS = 120;
const CHAT_LIST_LIMIT = 200;
/** Messages a new conversation keeps from before it was recorded */
const PRIOR_MESSAGES_MAX_ITEMS = 20;
const PRIOR_MESSAGE_MAX_BYTES = 32 * 1024;
/** Past this, a reply keeps its text only (`content`), not its events */
const REPLY_DATA_MAX_BYTES = 256 * 1024;
const ATTACHMENT_NAME_MAX_CHARS = 200;
/** What the title model reads of the first message / of each earlier one */
const TITLE_INPUT_MAX_CHARS = 1000;
const TITLE_PRIOR_MAX_CHARS = 500;
const TITLE_PRIOR_MAX_ITEMS = 3;

// ---------------------------------------------------------------------------
// SQL helpers — `$N` placeholders, in order, on both drivers
// ---------------------------------------------------------------------------

function sql(text: string): string {
  if (isPostgreSQL()) return text;
  return text.replace(/\$\d+/g, '?');
}

async function many<T>(text: string, params: unknown[]): Promise<T[]> {
  if (isPostgreSQL()) {
    const result = await getPool().query(text, params);
    return result.rows as T[];
  }
  const rows = await getDatabase().all<T[]>(sql(text), params);
  return rows ?? [];
}

async function one<T>(text: string, params: unknown[]): Promise<T | null> {
  const rows = await many<T>(text, params);
  return rows[0] ?? null;
}

async function exec(text: string, params: unknown[]): Promise<number> {
  if (isPostgreSQL()) {
    const result = await getPool().query(text, params);
    return result.rowCount ?? 0;
  }
  const result = await getDatabase().run(sql(text), params);
  return result.changes ?? 0;
}

/**
 * PG returns `Date` objects for these `TIMESTAMP` (no zone) columns, which hold
 * the UTC wall clock of our ISO writes; node-pg parses them as local time, so
 * read the wall clock back as UTC (same as noteService). SQLite returns the
 * ISO strings we wrote.
 */
function toIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(
      Date.UTC(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        value.getHours(),
        value.getMinutes(),
        value.getSeconds(),
        value.getMilliseconds(),
      ),
    ).toISOString();
  }
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface ConversationRow {
  id: string;
  title: string | null;
  mode: string | null;
  task_id: string | null;
  note_id: string | null;
  created_at: unknown;
  updated_at: unknown;
}

interface MessageRow {
  id: string;
  role: string;
  content: string | null;
  data: string | null;
  created_at: unknown;
}

const CONVERSATION_COLUMNS = 'id, title, mode, task_id, note_id, created_at, updated_at';

const toMode = (value: unknown): ChatConversationMode =>
  value === 'task' || value === 'note' ? value : 'general';

function toListItem(row: ConversationRow): ChatConversationListItem {
  return {
    id: row.id,
    title: row.title ?? '',
    mode: toMode(row.mode),
    task_id: row.task_id || null,
    note_id: row.note_id || null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function parseData(raw: string | null): ChatStoredMessageData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ChatStoredMessageData) : null;
  } catch {
    return null;
  }
}

function toStoredMessage(row: MessageRow): ChatStoredMessage {
  return {
    id: row.id,
    role: row.role === 'user' ? 'user' : 'assistant',
    content: row.content ?? '',
    data: parseData(row.data),
    created_at: toIso(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Reads / delete
// ---------------------------------------------------------------------------

/** The user's conversations, last message first. */
export async function listConversations(userId: string): Promise<ChatConversationListItem[]> {
  const rows = await many<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS}
       FROM chat_conversations
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT ${CHAT_LIST_LIMIT}`,
    [userId],
  );
  return rows.map(toListItem);
}

/**
 * The conversation with its messages, or null when it is not the user's. A
 * task / note that no longer exists (or is no longer shared) turns it into a
 * general chat, so continuing it never fails on the missing context.
 */
export async function getConversation(id: string, userId: string): Promise<ChatConversationDetail | null> {
  const row = await one<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS} FROM chat_conversations WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if (!row) return null;

  const item = toListItem(row);
  const [messages, hasContext] = await Promise.all([
    many<MessageRow>(
      `SELECT id, role, content, data, created_at
         FROM chat_messages
        WHERE conversation_id = $1
        ORDER BY seq ASC, created_at ASC`,
      [id],
    ),
    hasLiveContext(item, userId),
  ]);

  return {
    ...item,
    ...(hasContext ? {} : { mode: 'general' as const, task_id: null, note_id: null }),
    messages: messages.map(toStoredMessage),
  };
}

async function hasLiveContext(item: ChatConversationListItem, userId: string): Promise<boolean> {
  if (item.mode === 'task') return !!item.task_id && !!(await getTaskById(item.task_id, userId));
  if (item.mode === 'note') return !!item.note_id && !!(await getNoteAccess(item.note_id, userId));
  return true;
}

/** Removes the conversation and its messages. false: not the user's. */
export async function deleteConversation(id: string, userId: string): Promise<boolean> {
  const owned = await one<{ id: string }>(
    'SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  if (!owned) return false;
  await exec('DELETE FROM chat_messages WHERE conversation_id = $1', [id]);
  await exec('DELETE FROM chat_conversations WHERE id = $1', [id]);
  return true;
}

// ---------------------------------------------------------------------------
// Recording (one turn of /api/ai/chat)
// ---------------------------------------------------------------------------

/** One line of the first user message ('' when it has no text). */
export function chatTitleFrom(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > CHAT_TITLE_MAX_CHARS
    ? `${line.slice(0, CHAT_TITLE_MAX_CHARS - 1).trimEnd()}…`
    : line;
}

/** File names sent with a message (untrusted request input). */
export function toAttachmentNames(raw: unknown): ChatAttachmentName[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const { name, mimeType } = item as Record<string, unknown>;
    if (typeof name !== 'string' || typeof mimeType !== 'string') return [];
    return [{ name: name.slice(0, ATTACHMENT_NAME_MAX_CHARS), mimeType: mimeType.slice(0, ATTACHMENT_NAME_MAX_CHARS) }];
  });
}

interface PriorMessage {
  role: 'user' | 'assistant';
  content: string;
  data: ChatStoredMessageData | null;
}

/**
 * The client's snapshots of the messages it showed before the conversation
 * was recorded (e.g. the onboarding follow-up). Untrusted: only the role and
 * text are read here; a snapshot over the size cap keeps its text only.
 */
function toPriorMessages(raw: unknown): PriorMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-PRIOR_MESSAGES_MAX_ITEMS).flatMap((item): PriorMessage[] => {
    if (!item || typeof item !== 'object') return [];
    const message = item as Record<string, unknown>;
    if (message.role !== 'user' && message.role !== 'assistant') return [];
    const content = typeof message.content === 'string' ? message.content : '';
    const fits = Buffer.byteLength(JSON.stringify(message), 'utf8') <= PRIOR_MESSAGE_MAX_BYTES;
    return [{ role: message.role, content: fits ? content : content.slice(0, PRIOR_MESSAGE_MAX_BYTES), data: fits ? { message } : null }];
  });
}

/** What the web shows as the reply's text: the text after the last restart, else the errors. */
function replyText(events: RecordedChatEvent[]): string {
  let text = '';
  const errors: string[] = [];
  for (const event of events) {
    if (event.type === 'separator') text = '';
    else if (event.type === 'text') text += event.content;
    else if (event.type === 'error') errors.push(event.message);
  }
  return text.trim() ? text : errors.join('\n\n');
}

/** Serialized reply events, without reasoning when too large, or null when still too large. */
function replyData(events: RecordedChatEvent[]): string | null {
  const full = JSON.stringify({ events });
  if (Buffer.byteLength(full, 'utf8') <= REPLY_DATA_MAX_BYTES) return full;
  const lean = JSON.stringify({ events: events.filter((event) => event.type !== 'reasoning') });
  return Buffer.byteLength(lean, 'utf8') <= REPLY_DATA_MAX_BYTES ? lean : null;
}

const CHAT_TITLE_SYSTEM_PROMPT = `Você dá o título de uma conversa do usuário com a Jarvi, uma assistente de produtividade (tarefas, notas, agenda). O título aparece na lista de conversas: precisa dizer do que se trata num relance.

Responda só com JSON: {"title": "..."}

Regras:
- De 2 a 6 palavras, no idioma da primeira mensagem do usuário. Ex.: "Comprar pão amanhã", "Planejamento do dia", "Decisões da reunião com a Ana".
- Diga o assunto, não a conversa: nada de "Conversa sobre", "Pergunta sobre", "Título:".
- Use os nomes e termos que aparecem na conversa; não invente datas, nomes nem detalhes.
- Se a conversa for sobre uma nota ou tarefa (contexto), use-a para deixar o título específico, encurtando nomes longos (ex.: nota "Reunião de planejamento do trimestre com o time" → "Prioridades do trimestre").
- Sem aspas, emoji ou ponto final.
- Se não houver assunto (só um cumprimento, "ok", "teste"), responda {"title": ""}.`;

interface TitleContext {
  kind: 'task' | 'note';
  title: string;
}

/** The task / note a conversation is about, to make its title specific. */
async function titleContext(
  mode: ChatConversationMode,
  taskId: string | null,
  noteId: string | null,
  userId: string,
): Promise<TitleContext | null> {
  if (mode === 'task' && taskId) {
    const task = await getTaskById(taskId, userId);
    return task?.title?.trim() ? { kind: 'task', title: task.title } : null;
  }
  if (mode === 'note' && noteId && (await getNoteAccess(noteId, userId))) {
    const note = await one<{ title: string | null }>('SELECT title FROM notes WHERE id = $1', [noteId]);
    return note?.title?.trim() ? { kind: 'note', title: note.title } : null;
  }
  return null;
}

/** The start of the conversation as the title model reads it ('' when there is nothing to name). */
function titleInput(input: {
  userText: string;
  attachments: ChatAttachmentName[];
  priors: PriorMessage[];
  context: TitleContext | null;
}): string {
  const clean = (text: string, max: number): string =>
    text
      .replace(TASK_REF_REGEX, (_match, _id: string, refTitle: string) => refTitle)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  const userText = clean(input.userText, TITLE_INPUT_MAX_CHARS);
  const files = input.attachments.map((attachment) => attachment.name).join(', ');
  if (!userText && !files) return '';

  const blocks: string[] = [];
  if (input.context) {
    const what = input.context.kind === 'note' ? 'a nota' : 'a tarefa';
    blocks.push(`Contexto: a conversa é sobre ${what} "${clean(input.context.title, 200)}".`);
  }
  const priors = input.priors
    .slice(-TITLE_PRIOR_MAX_ITEMS)
    .map((prior) => [prior.role === 'user' ? 'Usuário' : 'Jarvi', clean(prior.content, TITLE_PRIOR_MAX_CHARS)])
    .filter(([, text]) => text)
    .map(([who, text]) => `${who}: ${text}`);
  if (priors.length > 0) blocks.push(`Mensagens anteriores:\n${priors.join('\n')}`);
  blocks.push(`Primeira mensagem do usuário: ${userText || '(só arquivos)'}`);
  if (files) blocks.push(`Arquivos enviados: ${files}`);
  return blocks.join('\n\n');
}

async function nextSeq(conversationId: string): Promise<number> {
  const row = await one<{ seq: unknown }>(
    'SELECT MAX(seq) AS seq FROM chat_messages WHERE conversation_id = $1',
    [conversationId],
  );
  const current = Number(row?.seq);
  return Number.isFinite(current) ? current + 1 : 1;
}

async function insertMessage(
  conversationId: string,
  userId: string,
  message: { role: 'user' | 'assistant'; content: string; data: string | null },
  createdAt: string,
): Promise<void> {
  await exec(
    `INSERT INTO chat_messages (id, conversation_id, user_id, seq, role, content, data, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      uuidv4(),
      conversationId,
      userId,
      await nextSeq(conversationId),
      message.role,
      message.content,
      message.data,
      createdAt,
    ],
  );
}

export interface ChatTurnInput {
  userId: string;
  /** From the client: continued only when it is one of the user's conversations */
  conversationId?: unknown;
  mode: ChatConversationMode;
  taskId?: string;
  noteId?: string;
  /** The request's history; its last user message is this turn's */
  messages: ChatMessage[];
  /** Snapshots of what the client showed before the conversation existed (new ones only) */
  priorMessages?: unknown;
  /** Files sent with this turn's message */
  attachments?: ChatAttachmentName[];
}

export interface ChatTurnRecorder {
  conversationId: string;
  title: string;
  /** This turn started the conversation */
  isNew: boolean;
  /** Feed it every event sent to the web. */
  record(event: SSEEvent): void;
  /** Stores the reply. Never throws. */
  finish(): Promise<void>;
  /**
   * New conversation only: asks the model for a short title and stores it
   * over the first-message one, unless the title changed meanwhile. The new
   * title, or null when it kept the first message. Never throws.
   */
  improveTitle(
    telemetry?: AiTelemetryOptions,
    complete?: typeof createChatTitleCompletion,
  ): Promise<string | null>;
}

/**
 * Stores the turn's user message (creating the conversation on its first
 * message) and returns the recorder for the reply.
 */
export async function beginChatTurn(input: ChatTurnInput): Promise<ChatTurnRecorder> {
  const { userId, mode } = input;
  const lastUser = [...input.messages].reverse().find((m) => m?.role === 'user');
  const userText = typeof lastUser?.content === 'string' ? lastUser.content : '';
  const attachments = input.attachments ?? [];
  const taskId = mode === 'task' ? input.taskId ?? null : null;
  const noteId = mode === 'note' ? input.noteId ?? null : null;
  const now = new Date().toISOString();

  const requestedId =
    typeof input.conversationId === 'string' && input.conversationId.length <= CHAT_ID_MAX_LENGTH
      ? input.conversationId
      : null;
  const existing = requestedId
    ? await one<{ id: string; title: string | null }>(
        'SELECT id, title FROM chat_conversations WHERE id = $1 AND user_id = $2',
        [requestedId, userId],
      )
    : null;

  const conversationId = existing?.id ?? uuidv4();
  const priors = existing ? [] : toPriorMessages(input.priorMessages);
  let title = existing?.title ?? '';
  if (!title) title = chatTitleFrom(userText) || chatTitleFrom(attachments[0]?.name ?? '');

  if (existing) {
    await exec(
      `UPDATE chat_conversations
          SET title = $1, mode = $2, task_id = $3, note_id = $4, updated_at = $5
        WHERE id = $6`,
      [title, mode, taskId, noteId, now, conversationId],
    );
  } else {
    await exec(
      `INSERT INTO chat_conversations (id, user_id, title, mode, task_id, note_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [conversationId, userId, title, mode, taskId, noteId, now, now],
    );
    for (const prior of priors) {
      await insertMessage(
        conversationId,
        userId,
        { role: prior.role, content: prior.content, data: prior.data ? JSON.stringify(prior.data) : null },
        now,
      );
    }
  }

  await insertMessage(
    conversationId,
    userId,
    { role: 'user', content: userText, data: attachments.length > 0 ? JSON.stringify({ attachments }) : null },
    now,
  );

  const events: RecordedChatEvent[] = [];

  return {
    conversationId,
    title,
    isNew: !existing,
    record(event) {
      if (event.type === 'status' || event.type === 'done') return;
      const last = events[events.length - 1];
      if (event.type === 'text' && last?.type === 'text') {
        events[events.length - 1] = { type: 'text', content: last.content + event.content };
      } else if (event.type === 'reasoning' && last?.type === 'reasoning') {
        events[events.length - 1] = { type: 'reasoning', content: last.content + event.content };
      } else {
        events.push(event);
      }
    },
    async finish() {
      if (events.length === 0) return;
      try {
        const finishedAt = new Date().toISOString();
        await insertMessage(
          conversationId,
          userId,
          { role: 'assistant', content: replyText(events), data: replyData(events) },
          finishedAt,
        );
        await exec('UPDATE chat_conversations SET updated_at = $1 WHERE id = $2', [finishedAt, conversationId]);
      } catch (err) {
        console.error('[chats] failed to store the reply:', err);
      }
    },
    async improveTitle(telemetry, complete = createChatTitleCompletion) {
      if (existing) return null;
      try {
        const context = await titleContext(mode, taskId, noteId, userId);
        const prompt = titleInput({ userText, attachments, priors, context });
        if (!prompt) return null;
        const suggested = sanitizeSuggestedTitle(
          (await complete({ system: CHAT_TITLE_SYSTEM_PROMPT, user: prompt }, telemetry)).title,
        );
        if (!suggested || suggested === title) return null;
        // Only over the first-message title: not over one changed meanwhile.
        const changed = await exec(
          'UPDATE chat_conversations SET title = $1 WHERE id = $2 AND user_id = $3 AND title = $4',
          [suggested, conversationId, userId, title],
        );
        return changed > 0 ? suggested : null;
      } catch (err) {
        console.error('[chats] failed to title the conversation:', err);
        return null;
      }
    },
  };
}
