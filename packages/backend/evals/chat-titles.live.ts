/**
 * Live check — Chats: conversation titles from the real title model.
 *
 * Starts a handful of conversations (general, about a note, after an
 * onboarding-like follow-up, in English, a bare greeting) and asks the
 * configured CHAT_TITLE_MODEL for each title. The wording varies from run to
 * run, so it asserts what must hold whatever the model writes and prints the
 * titles to eyeball:
 * - a conversation with a subject ends with a title of 2–7 words (the AI
 *   one, or its first message when the model finds nothing better);
 * - a bare greeting keeps its first message;
 * - the note's name reaches a title about the note.
 *
 * Run (needs a valid OPENAI_API_KEY in packages/backend/.env; eight small model calls):
 *   npm run eval:chat-titles:live     (from packages/backend)
 *
 * PostHog is switched off for this run. A failing call shows up as the
 * service's own "[chats] failed to title the conversation" log.
 */

import 'dotenv/config';

import { setupEvalDatabase } from './helpers';

const USER = 'eval-user';

let failures = 0;
function check(condition: unknown, message: string): void {
  if (condition) return;
  failures += 1;
  console.error(`  ✗ ${message}`);
}

interface Opening {
  label: string;
  text: string;
  mode?: 'general' | 'note';
  priorMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** null: no subject, the first message must stay the title */
  expect: 'title' | null;
}

const OPENINGS: Opening[] = [
  { label: 'task', text: 'Cria uma tarefa pra eu comprar pão amanhã às 9h', expect: 'title' },
  { label: 'chip', text: 'Estou atrasado?', expect: 'title' },
  { label: 'chip', text: 'Planejar meu dia', expect: 'title' },
  {
    label: 'long',
    text: 'me ajuda a organizar a mudança de apartamento no fim do mês, tenho que contratar frete, cancelar a internet e avisar o condomínio',
    expect: 'title',
  },
  { label: 'english', text: 'Remind me to call mom on Sunday', expect: 'title' },
  { label: 'note', text: 'Quais foram as decisões?', mode: 'note', expect: 'title' },
  {
    label: 'onboarding',
    text: 'Amanhã',
    priorMessages: [
      {
        role: 'assistant',
        content: 'Pronto! Criei 3 tarefas: Pagar IPVA, Marcar dentista e Renovar CNH. Quando você quer pagar o IPVA?',
      },
    ],
    expect: 'title',
  },
  { label: 'greeting', text: 'Oi', expect: null },
];

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set: nothing was run.');
    process.exit(1);
  }
  // No $ai_generation events from a test run (read when the services load).
  process.env.POSTHOG_API_KEY = '';

  await setupEvalDatabase();
  const { getDatabase } = await import('../src/database');
  const chats = await import('../src/services/chatHistoryService');
  const { getChatTitleModel } = await import('../src/services/agent/core/models');
  const db = getDatabase();

  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO notes (id, user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['eval-note', USER, 'Reunião de lançamento com a Ana', '', now, now],
  );

  console.log(`Title model: ${getChatTitleModel()}\n`);
  for (const opening of OPENINGS) {
    const recorder = await chats.beginChatTurn({
      userId: USER,
      mode: opening.mode ?? 'general',
      noteId: opening.mode === 'note' ? 'eval-note' : undefined,
      messages: [{ role: 'user', content: opening.text }],
      priorMessages: opening.priorMessages,
    });
    const suggested = await recorder.improveTitle();
    const title = suggested ?? recorder.title;
    console.log(`[${opening.label}] ${opening.text}\n    → ${suggested ? title : `(kept) ${title}`}`);

    if (opening.expect === null) {
      check(suggested === null, `[${opening.label}] a greeting keeps its first message (got "${suggested}")`);
      continue;
    }
    const words = title.split(/\s+/).filter(Boolean).length;
    check(words >= 2 && words <= 7, `[${opening.label}] 2–7 words (got ${words}: "${title}")`);
    if (opening.mode === 'note') {
      check(/ana|lançamento/i.test(title), `[${opening.label}] the note's name makes it specific (got "${title}")`);
    }
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Live check failed:', err instanceof Error ? err.message : 'unknown error');
  process.exit(1);
});
