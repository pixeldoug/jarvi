/**
 * Deterministic eval — Chats: conversation history recorded by /api/ai/chat.
 *
 * Drives the chat history service against an in-memory SQLite (no model):
 * a turn creates the conversation on its first message and continues it
 * afterwards, the reply keeps the stream events the web replays (status /
 * done dropped, text and reasoning merged, the text after a restart as its
 * content), prior snapshots are stored only for a new conversation, and
 * another user's conversation is never continued, read or deleted. The AI
 * title (scripted model) replaces the first-message title of a new
 * conversation only, never a title changed meanwhile, and falls back to the
 * first message when the model fails or has no subject.
 *
 * Run:
 *   npm run eval:chat-history     (from packages/backend)
 *
 * Exits 1 on any failing assertion so CI can gate on it.
 */

import 'dotenv/config';

import { setupEvalDatabase } from './helpers';

// ---------------------------------------------------------------------------
// Tiny assertion harness (same shape as notes-next-steps.deterministic.ts)
// ---------------------------------------------------------------------------

let currentCase = '';
let failures = 0;
let passed = 0;

function check(condition: unknown, message: string, detail?: unknown): void {
  if (condition) {
    passed++;
    return;
  }
  failures++;
  console.error(`  ✗ [${currentCase}] ${message}`);
  if (detail !== undefined) console.error('    →', typeof detail === 'string' ? detail : JSON.stringify(detail));
}

async function testCase(name: string, fn: () => Promise<void>): Promise<void> {
  currentCase = name;
  const before = failures;
  try {
    await fn();
  } catch (err) {
    failures++;
    console.error(`  ✗ [${name}] threw:`, err);
  }
  console.log(`${failures === before ? '✓' : '✗'} ${name}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const USER = 'eval-user';
const OTHER_USER = 'eval-other-user';

async function main(): Promise<void> {
  await setupEvalDatabase();

  const { getDatabase } = await import('../src/database');
  const chats = await import('../src/services/chatHistoryService');
  const db = getDatabase();

  const userTurn = (content: string) => [{ role: 'user' as const, content }];

  await testCase('first message creates the conversation and stores the reply events', async () => {
    const recorder = await chats.beginChatTurn({
      userId: USER,
      mode: 'general',
      messages: userTurn('  Planejar   meu dia\n de amanhã '),
      attachments: [{ name: 'agenda.pdf', mimeType: 'application/pdf' }],
    });
    check(recorder.title === 'Planejar meu dia de amanhã', 'title is the first message on one line', recorder.title);

    recorder.record({ type: 'status', message: 'Preparando contexto…' });
    recorder.record({ type: 'reasoning', content: 'Vou ' });
    recorder.record({ type: 'reasoning', content: 'olhar as tarefas.' });
    recorder.record({ type: 'tool_call', toolName: 'search_tasks', toolArgs: { query: 'amanhã' } });
    recorder.record({ type: 'tool_result', toolName: 'search_tasks', success: true, data: { count: 2 } });
    recorder.record({ type: 'text', content: 'Você tem ' });
    recorder.record({ type: 'text', content: '2 tarefas.' });
    recorder.record({ type: 'choices', question: 'Para quando?', choices: ['Hoje', 'Amanhã'], field: 'due_date', reason: 'missing_due_date' });
    recorder.record({ type: 'done' });
    await recorder.finish();

    const detail = await chats.getConversation(recorder.conversationId, USER);
    check(detail !== null, 'the conversation is readable by its owner');
    if (!detail) return;
    check(detail.mode === 'general', 'general mode', detail.mode);
    check(detail.messages.length === 2, 'user message + reply', detail.messages.length);

    const [user, reply] = detail.messages;
    check(user.role === 'user' && user.content === '  Planejar   meu dia\n de amanhã ', 'user message keeps its text', user);
    check(
      JSON.stringify(user.data) === JSON.stringify({ attachments: [{ name: 'agenda.pdf', mimeType: 'application/pdf' }] }),
      'user message keeps the attachment names only',
      user.data,
    );
    check(reply.role === 'assistant' && reply.content === 'Você tem 2 tarefas.', 'reply content is the merged text', reply.content);
    const types = (reply.data?.events ?? []).map((event) => event.type);
    check(
      JSON.stringify(types) === JSON.stringify(['reasoning', 'tool_call', 'tool_result', 'text', 'choices']),
      'events in order, status / done dropped, deltas merged',
      types,
    );
    const reasoning = reply.data?.events?.[0];
    check(reasoning?.type === 'reasoning' && reasoning.content === 'Vou olhar as tarefas.', 'reasoning merged', reasoning);
  });

  await testCase('next turn continues the conversation and updates its context', async () => {
    const first = await chats.beginChatTurn({ userId: USER, mode: 'general', messages: userTurn('Primeira') });
    first.record({ type: 'text', content: 'Ok.' });
    await first.finish();

    const second = await chats.beginChatTurn({
      userId: USER,
      conversationId: first.conversationId,
      mode: 'task',
      taskId: 'task-1',
      messages: [...userTurn('Primeira'), { role: 'assistant', content: 'Ok.' }, ...userTurn('Segunda')],
    });
    check(second.conversationId === first.conversationId, 'same conversation');
    check(second.title === 'Primeira', 'title stays the first message', second.title);
    second.record({ type: 'text', content: 'Feito.' });
    await second.finish();

    const rows = await db.all<{ seq: number; role: string; content: string }[]>(
      'SELECT seq, role, content FROM chat_messages WHERE conversation_id = ? ORDER BY seq',
      [first.conversationId],
    );
    check(
      JSON.stringify(rows.map((r) => [r.seq, r.role, r.content])) ===
        JSON.stringify([[1, 'user', 'Primeira'], [2, 'assistant', 'Ok.'], [3, 'user', 'Segunda'], [4, 'assistant', 'Feito.']]),
      'messages in order, the history is not stored twice',
      rows,
    );
    const row = await db.get<{ mode: string; task_id: string | null }>(
      'SELECT mode, task_id FROM chat_conversations WHERE id = ?',
      [first.conversationId],
    );
    check(row?.mode === 'task' && row.task_id === 'task-1', 'context of the latest turn', row);
  });

  await testCase('a restarted reply keeps the text after the restart; errors fill an empty reply', async () => {
    const restarted = await chats.beginChatTurn({ userId: USER, mode: 'general', messages: userTurn('Oi') });
    restarted.record({ type: 'text', content: 'Rascunho' });
    restarted.record({ type: 'separator' });
    restarted.record({ type: 'text', content: 'Resposta final' });
    await restarted.finish();
    const one = await chats.getConversation(restarted.conversationId, USER);
    check(one?.messages[1]?.content === 'Resposta final', 'content after the separator', one?.messages[1]?.content);

    const failed = await chats.beginChatTurn({ userId: USER, mode: 'general', messages: userTurn('Oi de novo') });
    failed.record({ type: 'error', message: 'Erro ao processar resposta da IA' });
    failed.record({ type: 'done' });
    await failed.finish();
    const two = await chats.getConversation(failed.conversationId, USER);
    check(two?.messages[1]?.content === 'Erro ao processar resposta da IA', 'error as content', two?.messages[1]?.content);

    const silent = await chats.beginChatTurn({ userId: USER, mode: 'general', messages: userTurn('Nada') });
    silent.record({ type: 'status', message: 'Preparando…' });
    silent.record({ type: 'done' });
    await silent.finish();
    const three = await chats.getConversation(silent.conversationId, USER);
    check(three?.messages.length === 1, 'no reply stored without events', three?.messages.length);
  });

  await testCase('prior snapshots are stored for a new conversation only', async () => {
    const seed = {
      role: 'assistant',
      content: 'Criei 2 tarefas pra você.',
      contentAfter: 'Quando você quer fazer a primeira?',
      choicePrompts: ['Hoje', 'Amanhã'],
    };
    const huge = { role: 'assistant', content: 'grande', blob: 'x'.repeat(40 * 1024) };
    const recorder = await chats.beginChatTurn({
      userId: USER,
      mode: 'general',
      messages: [{ role: 'assistant', content: 'flattened' }, ...userTurn('Amanhã')],
      priorMessages: [seed, huge, { role: 'system', content: 'ignored' }, 'junk'],
    });
    await recorder.finish();
    const detail = await chats.getConversation(recorder.conversationId, USER);
    const roles = detail?.messages.map((m) => [m.role, m.content]);
    check(
      JSON.stringify(roles) === JSON.stringify([['assistant', 'Criei 2 tarefas pra você.'], ['assistant', 'grande'], ['user', 'Amanhã']]),
      'snapshots first (invalid ones skipped), then the user message',
      roles,
    );
    check(JSON.stringify(detail?.messages[0].data) === JSON.stringify({ message: seed }), 'snapshot kept as data.message', detail?.messages[0].data);
    check(detail?.messages[1].data === null, 'an oversized snapshot keeps its text only', detail?.messages[1].data);

    const next = await chats.beginChatTurn({
      userId: USER,
      conversationId: recorder.conversationId,
      mode: 'general',
      messages: userTurn('De novo'),
      priorMessages: [seed],
    });
    await next.finish();
    const after = await chats.getConversation(recorder.conversationId, USER);
    check(after?.messages.length === 4, 'snapshots ignored when continuing', after?.messages.length);
  });

  await testCase("another user's conversation is never continued, read or deleted", async () => {
    const theirs = await chats.beginChatTurn({ userId: OTHER_USER, mode: 'general', messages: userTurn('Segredo') });
    await theirs.finish();

    const mine = await chats.beginChatTurn({
      userId: USER,
      conversationId: theirs.conversationId,
      mode: 'general',
      messages: userTurn('Tentativa'),
    });
    check(mine.conversationId !== theirs.conversationId, 'a foreign id starts a new conversation');
    check((await chats.getConversation(theirs.conversationId, USER)) === null, 'not readable');
    check((await chats.deleteConversation(theirs.conversationId, USER)) === false, 'not deletable');
    const theirMessages = await db.all('SELECT id FROM chat_messages WHERE conversation_id = ?', [theirs.conversationId]);
    check(theirMessages.length === 1, 'their messages untouched', theirMessages.length);
    const listed = await chats.listConversations(USER);
    check(!listed.some((c) => c.id === theirs.conversationId), 'not listed');
  });

  await testCase('list is newest first; delete removes the messages', async () => {
    const older = await chats.beginChatTurn({ userId: USER, mode: 'general', messages: userTurn('Mais antiga') });
    await older.finish();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await chats.beginChatTurn({ userId: USER, mode: 'general', messages: userTurn('Mais nova') });
    newer.record({ type: 'text', content: 'Oi' });
    await newer.finish();

    const listed = await chats.listConversations(USER);
    check(listed[0]?.id === newer.conversationId, 'newest first', listed.slice(0, 2));
    check(
      listed.every((c, i) => i === 0 || Date.parse(listed[i - 1].updated_at) >= Date.parse(c.updated_at)),
      'ordered by last message',
    );

    check((await chats.deleteConversation(older.conversationId, USER)) === true, 'owner deletes');
    check((await chats.getConversation(older.conversationId, USER)) === null, 'gone');
    const left = await db.all('SELECT id FROM chat_messages WHERE conversation_id = ?', [older.conversationId]);
    check(left.length === 0, 'messages removed', left.length);
  });

  await testCase('a missing task / note turns the conversation into a general chat', async () => {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO tasks (id, user_id, title, completed, priority, created_at, updated_at)
       VALUES (?, ?, ?, 0, 'medium', ?, ?)`,
      ['eval-task', USER, 'Pagar IPVA', now, now],
    );
    const live = await chats.beginChatTurn({ userId: USER, mode: 'task', taskId: 'eval-task', messages: userTurn('Detalhar') });
    await live.finish();
    const kept = await chats.getConversation(live.conversationId, USER);
    check(kept?.mode === 'task' && kept.task_id === 'eval-task', 'existing task kept', kept && [kept.mode, kept.task_id]);

    const gone = await chats.beginChatTurn({ userId: USER, mode: 'note', noteId: 'missing-note', messages: userTurn('Resumo?') });
    await gone.finish();
    const general = await chats.getConversation(gone.conversationId, USER);
    check(
      general?.mode === 'general' && general.note_id === null && general.task_id === null,
      'missing note → general',
      general && [general.mode, general.note_id],
    );
  });

  await testCase('titles', async () => {
    const long = 'a'.repeat(300);
    const title = chats.chatTitleFrom(long);
    check(title.length === chats.CHAT_TITLE_MAX_CHARS && title.endsWith('…'), 'long title cut with an ellipsis', title.length);

    const onlyFile = await chats.beginChatTurn({
      userId: USER,
      mode: 'general',
      messages: userTurn(''),
      attachments: [{ name: 'recibo.png', mimeType: 'image/png' }],
    });
    check(onlyFile.title === 'recibo.png', 'no text: the first file name', onlyFile.title);

    const names = chats.toAttachmentNames([{ name: 'a.pdf', mimeType: 'application/pdf', data: 'AAAA' }, { name: 3 }, null]);
    check(JSON.stringify(names) === JSON.stringify([{ name: 'a.pdf', mimeType: 'application/pdf' }]), 'attachment names never keep the data', names);
  });

  type TitleMessages = { system: string; user: string };

  await testCase('a new conversation gets the AI title over its first message', async () => {
    let prompt: TitleMessages = { system: '', user: '' };
    const recorder = await chats.beginChatTurn({
      userId: USER,
      mode: 'general',
      messages: userTurn('me lembra de pagar o {{task:t-1|IPVA}} semana que vem'),
    });
    check(recorder.isNew, 'the first turn starts the conversation');
    const title = await recorder.improveTitle(undefined, async (messages) => {
      prompt = messages;
      return { title: '  “Pagar IPVA semana que vem.” 🚗 ' };
    });
    check(title === 'Pagar IPVA semana que vem', 'quotes, emoji and final period removed', title);
    const row = await db.get<{ title: string }>('SELECT title FROM chat_conversations WHERE id = ?', [recorder.conversationId]);
    check(row?.title === 'Pagar IPVA semana que vem', 'stored', row);
    check(prompt.user.includes('pagar o IPVA semana que vem') && !prompt.user.includes('{{task:'), 'task refs read as their titles', prompt.user);
    check(prompt.system.includes('{"title": ""}'), 'the system prompt allows no title', prompt.system.slice(0, 80));
  });

  await testCase('no subject, a failure or a continued conversation keep the first message', async () => {
    const greeting = await chats.beginChatTurn({ userId: USER, mode: 'general', messages: userTurn('Oi') });
    check((await greeting.improveTitle(undefined, async () => ({ title: '' }))) === null, 'empty title → kept');
    const junk = await chats.beginChatTurn({ userId: USER, mode: 'general', messages: userTurn('Teste') });
    check((await junk.improveTitle(undefined, async () => ({ text: 'sem título' }))) === null, 'no `title` field → kept');

    const failing = await chats.beginChatTurn({ userId: USER, mode: 'general', messages: userTurn('Planejar a semana') });
    const failed = await failing.improveTitle(undefined, async () => {
      throw new Error('model down');
    });
    check(failed === null, 'a failing model → kept, no throw');
    const kept = await db.get<{ title: string }>('SELECT title FROM chat_conversations WHERE id = ?', [failing.conversationId]);
    check(kept?.title === 'Planejar a semana', 'first message still the title', kept);

    let called = false;
    const continued = await chats.beginChatTurn({
      userId: USER,
      conversationId: failing.conversationId,
      mode: 'general',
      messages: userTurn('E amanhã?'),
    });
    check(!continued.isNew, 'a continued conversation is not new');
    const none = await continued.improveTitle(undefined, async () => {
      called = true;
      return { title: 'Outro título' };
    });
    check(none === null && !called, 'no model call when continuing');

    const empty = await chats.beginChatTurn({ userId: USER, mode: 'general', messages: userTurn('   ') });
    let calledForEmpty = false;
    await empty.improveTitle(undefined, async () => {
      calledForEmpty = true;
      return { title: 'Nada' };
    });
    check(!calledForEmpty, 'nothing to name (no text, no file) → no model call');
  });

  await testCase('the note is context, and a title changed meanwhile wins', async () => {
    const now = new Date().toISOString();
    await db.run(
      'INSERT INTO notes (id, user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['eval-note', USER, 'Reunião com a Ana', '', now, now],
    );
    let prompt = '';
    const recorder = await chats.beginChatTurn({
      userId: USER,
      mode: 'note',
      noteId: 'eval-note',
      messages: userTurn('Quais foram as decisões?'),
      priorMessages: [{ role: 'assistant', content: 'Posso resumir esta nota.' }],
    });
    const title = await recorder.improveTitle(undefined, async (messages) => {
      prompt = messages.user;
      await db.run('UPDATE chat_conversations SET title = ? WHERE id = ?', ['Renomeada', recorder.conversationId]);
      return { title: 'Decisões da reunião com a Ana' };
    });
    check(prompt.includes('a nota "Reunião com a Ana"'), 'note title in the prompt', prompt);
    check(prompt.includes('Jarvi: Posso resumir esta nota.'), 'earlier messages in the prompt', prompt);
    check(title === null, 'not applied over a title changed meanwhile', title);
    const row = await db.get<{ title: string }>('SELECT title FROM chat_conversations WHERE id = ?', [recorder.conversationId]);
    check(row?.title === 'Renomeada', 'the other title kept', row);

    const elsewhere = await chats.beginChatTurn({
      userId: OTHER_USER,
      mode: 'note',
      noteId: 'eval-note',
      messages: userTurn('Resumo?'),
    });
    let otherPrompt = '';
    await elsewhere.improveTitle(undefined, async (messages) => {
      otherPrompt = messages.user;
      return { title: 'Resumo' };
    });
    check(!otherPrompt.includes('Reunião com a Ana'), "another user's note never reaches the prompt", otherPrompt);
  });

  console.log(`\n${passed} checks passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
