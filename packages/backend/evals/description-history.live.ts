/**
 * Live check — a task description evolves in its own chat without losing
 * what it already says, with the real agent model.
 *
 * One task (a context, two dated updates, pending steps and a ~1 MB image
 * attached) and three turns in its chat, through the same `streamChat` the web
 * calls:
 *   1. an update in the user's words → every older fact is still in the
 *      description, the news is there, and the chat does not fail after saving
 *      (the image used to reach the model as text: "400 Input tokens exceed");
 *   2. a second update → still nothing lost;
 *   3. "apaga a linha do orçamento" → that line, and only that one, is gone.
 *
 * The wording varies from run to run, so it asserts what must hold whatever
 * the model writes and prints each stored description to eyeball. It also
 * reports how many lines the backend had to put back under "## Histórico":
 * 0 means the model kept everything by itself.
 *
 * Run (needs a valid OPENAI_API_KEY in packages/backend/.env; ~6 model calls):
 *   npm run eval:description-history:live     (from packages/backend)
 *
 * PostHog is switched off for this run.
 */

import 'dotenv/config';

import { deflateSync } from 'zlib';
import { makeTask, seedTasksForEval, setupEvalDatabase } from './helpers';
import type { ChatMessage } from '../src/services/agent/core/types';

process.env.POSTHOG_API_KEY = '';
process.env.AGENT_RELIABLE_EXECUTION = process.env.AGENT_RELIABLE_EXECUTION || 'on';

let failures = 0;
function check(condition: unknown, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${message}`);
}

/** A valid PNG of random pixels (does not compress: ~3 bytes per pixel). */
function noisePng(size: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const rows = Buffer.alloc(size * (size * 3 + 1));
  for (let i = 0; i < rows.length; i++) rows[i] = i % (size * 3 + 1) === 0 ? 0 : Math.floor(Math.random() * 256);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BEFORE_MD = [
  '## Contexto',
  'Sua máquina LG lava e seca parou no meio do ciclo e mostra o código de erro OE no display.',
  'Ela foi comprada em 03/2024 e a garantia de fábrica já acabou.',
  '',
  '## Atualizações',
  '- Em 12/10/2026, você tentou limpar o filtro de drenagem e o erro continuou.',
  '- Em 05/11/2026, você pediu um orçamento por telefone: R$ 480 só a visita.',
  '',
  '## Próximos passos',
  '- [ ] Ligar para a assistência técnica da LG.',
  '- [ ] Separar a nota fiscal.',
].join('\n');

/** What must never leave the description unless the user asks. */
const FACTS = ['erro OE', '03/2024', '12/10/2026', 'filtro de drenagem', '05/11/2026', '480'];

async function main(): Promise<void> {
  await setupEvalDatabase();
  const { streamChat } = await import('../src/services/agent');
  const { markdownToTiptapDoc } = await import('../src/utils/markdownToTiptapDoc');
  const { tiptapDocToMarkdown } = await import('../src/utils/tiptapDoc');
  const { getDatabase } = await import('../src/database');

  const image = `data:image/png;base64,${noisePng(600).toString('base64')}`;
  const task = makeTask({
    title: 'Ver conserto máquina LG lava e seca',
    category: 'Casa',
    description: JSON.stringify({
      ...markdownToTiptapDoc(BEFORE_MD),
      _attachments: [{ name: 'image', ext: '.png', mimeType: 'image/png', previewData: image }],
    }),
  });
  await seedTasksForEval([task]);
  console.log(`Imagem anexada à tarefa: ${Math.round(image.length / 1024)} KB em base64\n`);

  const stored = async (): Promise<{ markdown: string; attachments: number }> => {
    const row = await getDatabase().get<{ description: string | null }>('SELECT description FROM tasks WHERE id = ?', [task.id]);
    const attachments = (JSON.parse(row?.description ?? '{}')._attachments ?? []).length;
    return { markdown: tiptapDocToMarkdown(row?.description), attachments };
  };

  const history: ChatMessage[] = [];
  const turn = async (label: string, userText: string) => {
    console.log(`── ${label}\n> ${userText}`);
    history.push({ role: 'user', content: userText });
    let reply = '';
    const errors: string[] = [];
    const notes: string[] = [];
    await streamChat('eval-user', 'Doug', history, 'task', task.id, (event) => {
      if (event.type === 'text') reply += event.content;
      if (event.type === 'error') errors.push(event.message);
      if (event.type === 'tool_result' && Array.isArray(event.data?.notes)) notes.push(...(event.data.notes as string[]));
    });
    history.push({ role: 'assistant', content: reply.trim() });
    const { markdown, attachments } = await stored();
    console.log(`< ${reply.trim() || '(sem texto)'}\n\n${markdown}\n`);
    const putBack = notes.find((note) => note.includes('mantidas em'));
    console.log(putBack ? `  (o backend devolveu linhas: ${putBack})` : '  (o modelo manteve tudo sozinho)');
    check(errors.length === 0, `sem erro no chat${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    check(attachments === 1, 'a imagem continua anexada');
    return markdown;
  };

  let md = await turn(
    'Turno 1: atualização com as palavras do usuário',
    'EU entrei em contato hoje com a LG assitencia tecnica e eles me dissearm q em 2 dias uteis uma autoraizada vai entrar em contato cmg pra uma visita',
  );
  for (const fact of FACTS) check(md.includes(fact), `continua na descrição: ${fact}`);
  check(/2 dias úteis/i.test(md), 'a novidade entrou (2 dias úteis)');

  md = await turn('Turno 2: a tarefa evolui de novo', 'a autorizada me ligou agora, a visita ficou pra terça dia 24/11 às 14h. o técnico se chama Robson');
  for (const fact of FACTS) check(md.includes(fact), `continua na descrição: ${fact}`);
  check(/2 dias úteis/i.test(md), 'a atualização do turno 1 continua lá');
  check(md.includes('Robson') && md.includes('24/11'), 'a novidade entrou (Robson, 24/11)');

  md = await turn('Turno 3: o usuário pede para apagar', 'apaga a linha do orçamento por telefone de R$ 480, isso não vale mais');
  check(!md.includes('480'), 'a linha do orçamento saiu');
  for (const fact of FACTS.filter((f) => f !== '480' && f !== '05/11/2026')) check(md.includes(fact), `continua na descrição: ${fact}`);
  check(md.includes('Robson'), 'o que entrou nos turnos anteriores continua');

  console.log(failures === 0 ? '\nTudo certo.' : `\n${failures} verificação(ões) falharam.`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
