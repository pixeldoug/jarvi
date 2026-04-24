import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { hasIO, getIO } from '../utils/ioManager';
import { sanitizeTimeString } from '../utils/taskTime';

// Duck-typed interface covering the Redis methods we actually use,
// compatible with both ioredis `Redis` and `Cluster` instances.
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: 'EX', time: number): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------

let openaiClient: OpenAI | null = null;

const getOpenAIClient = (): OpenAI => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
};

// Primary model for the WhatsApp agent (conversational + tool calling)
const AGENT_MODEL = 'gpt-5.4-mini';
// Cheaper model used only for post-response memory extraction
const MEMORY_MODEL = 'gpt-4o-mini';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string;
  title: string;
  description?: string | null;
  completed: boolean;
  priority?: string | null;
  category?: string | null;
  due_date?: string | null;
  time?: string | null;
  created_at: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// Redis conversation history
// ---------------------------------------------------------------------------

const historyKey = (userId: string) => `whatsapp:agent:history:${userId}`;
const historyDateKey = (userId: string) => `whatsapp:agent:history:date:${userId}`;
const HISTORY_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_HISTORY_MESSAGES = 20; // 10 turns

// Load history for today only — clears automatically if the calendar date has
// changed so that stale date references from yesterday never pollute today's
// conversation context.
async function loadHistory(
  redis: RedisLike,
  userId: string,
  todayIso: string,
): Promise<ConversationMessage[]> {
  try {
    const [raw, storedDate] = await Promise.all([
      redis.get(historyKey(userId)),
      redis.get(historyDateKey(userId)),
    ]);

    // Clear if no date tag exists (pre-fix history) OR date has changed
    if (!storedDate || storedDate !== todayIso) {
      await redis.set(historyKey(userId), JSON.stringify([]), 'EX', HISTORY_TTL_SECONDS);
      await redis.set(historyDateKey(userId), todayIso, 'EX', HISTORY_TTL_SECONDS);
      return [];
    }

    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (m): m is ConversationMessage =>
            (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

async function appendHistory(
  redis: RedisLike,
  userId: string,
  userMsg: string,
  assistantMsg: string,
  todayIso: string,
): Promise<void> {
  try {
    const history = await loadHistory(redis, userId, todayIso);
    history.push({ role: 'user', content: userMsg });
    history.push({ role: 'assistant', content: assistantMsg });
    const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
    await Promise.all([
      redis.set(historyKey(userId), JSON.stringify(trimmed), 'EX', HISTORY_TTL_SECONDS),
      redis.set(historyDateKey(userId), todayIso, 'EX', HISTORY_TTL_SECONDS),
    ]);
  } catch {
    // ignore — history is best-effort
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function getUserMemoryAndTimezone(
  userId: string,
): Promise<{ memory: string; timezone: string; preferredName: string }> {
  try {
    if (isPostgreSQL()) {
      const [memRes, tzRes] = await Promise.all([
        getPool().query(
          'SELECT memory_text, consent_ai_memory FROM user_memory_profiles WHERE user_id = $1',
          [userId],
        ),
        getPool().query('SELECT timezone, preferred_name, name FROM users WHERE id = $1', [userId]),
      ]);
      const memRow = memRes.rows[0];
      const memory =
        memRow && memRow.consent_ai_memory !== false ? (memRow.memory_text || '') : '';
      const userRow = tzRes.rows[0];
      const preferredName = userRow?.preferred_name || userRow?.name?.split(' ')[0] || '';
      return { memory, timezone: userRow?.timezone || 'America/Sao_Paulo', preferredName };
    }
    const db = getDatabase();
    const [memRow, tzRow] = await Promise.all([
      db.get<{ memory_text: string; consent_ai_memory: number }>(
        'SELECT memory_text, consent_ai_memory FROM user_memory_profiles WHERE user_id = ?',
        [userId],
      ),
      db.get<{ timezone?: string; preferred_name?: string; name?: string }>(
        'SELECT timezone, preferred_name, name FROM users WHERE id = ?',
        [userId],
      ),
    ]);
    const memory = memRow && memRow.consent_ai_memory ? (memRow.memory_text || '') : '';
    const preferredName = tzRow?.preferred_name || tzRow?.name?.split(' ')[0] || '';
    return { memory, timezone: tzRow?.timezone || 'America/Sao_Paulo', preferredName };
  } catch {
    return { memory: '', timezone: 'America/Sao_Paulo', preferredName: '' };
  }
}

async function getUserTasks(userId: string): Promise<TaskRow[]> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      `SELECT id, title, description, completed, priority, category, due_date, time, created_at
       FROM tasks WHERE user_id = $1 AND completed = FALSE
       ORDER BY
         CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
         due_date ASC,
         CASE WHEN time IS NULL THEN 1 ELSE 0 END,
         time ASC,
         created_at ASC
       LIMIT 50`,
      [userId],
    );
    return result.rows as TaskRow[];
  }
  return getDatabase().all<TaskRow[]>(
    `SELECT id, title, description, completed, priority, category, due_date, time, created_at
     FROM tasks WHERE user_id = ? AND completed = 0
     ORDER BY
       CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
       due_date ASC,
       CASE WHEN time IS NULL THEN 1 ELSE 0 END,
       time ASC,
       created_at ASC
     LIMIT 50`,
    [userId],
  );
}

async function getTaskById(taskId: string, userId: string): Promise<TaskRow | null> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      `SELECT id, title, description, completed, priority, category, due_date, time, created_at
       FROM tasks WHERE id = $1 AND user_id = $2`,
      [taskId, userId],
    );
    return (result.rows[0] as TaskRow) || null;
  }
  const row = await getDatabase().get<TaskRow>(
    `SELECT id, title, description, completed, priority, category, due_date, time, created_at
     FROM tasks WHERE id = ? AND user_id = ?`,
    [taskId, userId],
  );
  return row || null;
}

// ---------------------------------------------------------------------------
// Tool definitions (OpenAI format)
// ---------------------------------------------------------------------------

const WHATSAPP_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Cria uma nova tarefa para o usuário diretamente na lista de tarefas.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título da tarefa (conciso e descritivo)' },
          description: { type: 'string', description: 'Descrição ou detalhes adicionais' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Prioridade' },
          due_date: { type: 'string', description: 'Data de vencimento no formato YYYY-MM-DD' },
          time: { type: 'string', description: 'Horário no formato HH:MM' },
          category: { type: 'string', description: 'Categoria da tarefa' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Atualiza campos de uma tarefa existente.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'ID da tarefa a atualizar' },
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
          time: { type: 'string', description: 'HH:MM' },
          category: { type: 'string' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Marca uma tarefa como concluída.',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Exclui permanentemente uma tarefa.',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_memory',
      description:
        'Atualiza o perfil de memória do usuário. O campo summary deve conter TODO o conhecimento acumulado — mescle sempre com a memória anterior, nunca descarte.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description:
              'Perfil completo e acumulado do usuário: relacionamentos, preferências, hábitos, contexto pessoal e profissional. Em terceira pessoa, em português.',
          },
        },
        required: ['summary'],
      },
    },
  },
];

// Tool names that create/mutate tasks; used by the anti-hallucination guardrail
// to decide when a response claiming action without any tool call is invalid.
const CREATION_TOOL_NAMES = new Set(['create_task']);

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

interface ExecuteToolContext {
  userId: string;
  originalWhatsappContent?: string;
  whatsappPhone?: string;
  whatsappMessageSid?: string;
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ExecuteToolContext,
): Promise<string> {
  const now = new Date().toISOString();
  const { userId, originalWhatsappContent, whatsappPhone, whatsappMessageSid } = ctx;

  switch (name) {
    case 'create_task': {
      // WhatsApp-created tasks go through the same approval flow as Gmail:
      // they're written to `pending_tasks` (not `tasks`) with status
      // 'awaiting_confirmation'. The user approves/rejects via the
      // "Integrações" section in the web UI.
      const title = String(args.title || '').trim();
      const description = args.description ? String(args.description) : null;
      const priority = args.priority ? String(args.priority) : null;
      const dueDate = args.due_date ? String(args.due_date) : null;
      const time = sanitizeTimeString(args.time);
      const category = args.category ? String(args.category) : null;

      const whatsappContent = originalWhatsappContent || null;

      // Idempotency guard — if an identical-titled pending task was suggested
      // within the last 2 minutes for this user, return that one instead of
      // inserting a duplicate. Catches both model double-calls and ambiguous
      // follow-ups like "pode ser", "ok", "sim" that re-trigger create_task.
      const DEDUP_WINDOW_SECONDS = 120;
      const cutoff = new Date(Date.now() - DEDUP_WINDOW_SECONDS * 1000).toISOString();
      const existingDuplicate = isPostgreSQL()
        ? (
            await getPool().query<{ id: string }>(
              `SELECT id FROM pending_tasks
               WHERE user_id = $1
                 AND status = 'awaiting_confirmation'
                 AND LOWER(suggested_title) = LOWER($2)
                 AND created_at >= $3
               ORDER BY created_at DESC LIMIT 1`,
              [userId, title, cutoff],
            )
          ).rows[0]
        : await getDatabase().get<{ id: string }>(
            `SELECT id FROM pending_tasks
             WHERE user_id = ?
               AND status = 'awaiting_confirmation'
               AND LOWER(suggested_title) = LOWER(?)
               AND created_at >= ?
             ORDER BY created_at DESC LIMIT 1`,
            [userId, title, cutoff],
          );

      if (existingDuplicate?.id) {
        console.warn(
          '[WhatsApp Agent] Dedup guard — skipping duplicate pending create_task title="%s" userId=%s existingId=%s',
          title,
          userId,
          existingDuplicate.id,
        );
        return JSON.stringify({
          success: true,
          id: existingDuplicate.id,
          title,
          pending: true,
          duplicate: true,
        });
      }

      const pendingId = uuidv4();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      if (isPostgreSQL()) {
        await getPool().query(
          `INSERT INTO pending_tasks (
             id, user_id, source, raw_content, original_whatsapp_content,
             suggested_title, suggested_description, suggested_priority,
             suggested_due_date, suggested_time, suggested_category,
             status, whatsapp_phone, whatsapp_message_sid, expires_at,
             created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            pendingId,
            userId,
            'whatsapp',
            whatsappContent,
            whatsappContent,
            title,
            description,
            priority,
            dueDate,
            time,
            category,
            'awaiting_confirmation',
            whatsappPhone ?? null,
            whatsappMessageSid ?? null,
            expiresAt,
            now,
            now,
          ],
        );
      } else {
        await getDatabase().run(
          `INSERT INTO pending_tasks (
             id, user_id, source, raw_content, original_whatsapp_content,
             suggested_title, suggested_description, suggested_priority,
             suggested_due_date, suggested_time, suggested_category,
             status, whatsapp_phone, whatsapp_message_sid, expires_at,
             created_at, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pendingId,
            userId,
            'whatsapp',
            whatsappContent,
            whatsappContent,
            title,
            description,
            priority,
            dueDate,
            time,
            category,
            'awaiting_confirmation',
            whatsappPhone ?? null,
            whatsappMessageSid ?? null,
            expiresAt,
            now,
            now,
          ],
        );
      }

      if (hasIO()) {
        getIO().to(`user:${userId}`).emit('pending-task:created', {
          id: pendingId,
          source: 'whatsapp',
        });
      }

      return JSON.stringify({ success: true, id: pendingId, title, pending: true });
    }

    case 'update_task': {
      const taskId = String(args.task_id || '');
      const task = await getTaskById(taskId, userId);
      if (!task) return JSON.stringify({ success: false, message: 'Tarefa não encontrada' });

      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;
      const ph = () => (isPostgreSQL() ? `$${paramIdx++}` : '?');

      for (const key of ['title', 'description', 'priority', 'due_date', 'time', 'category'] as const) {
        if (args[key] !== undefined) {
          fields.push(`${key} = ${ph()}`);
          // Normaliza `time` para tratar "null"/"NULL"/"undefined" (strings enviadas
          // por alguns modelos) como SQL NULL em vez de literais de texto.
          values.push(key === 'time' ? sanitizeTimeString(args[key]) : args[key]);
        }
      }
      if (!fields.length) return JSON.stringify({ success: true, id: taskId });

      fields.push(`updated_at = ${ph()}`);
      values.push(now);
      values.push(taskId);
      values.push(userId);

      const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ${ph()} AND user_id = ${ph()}`;
      if (isPostgreSQL()) await getPool().query(sql, values);
      else await getDatabase().run(sql, values);

      return JSON.stringify({ success: true, id: taskId });
    }

    case 'complete_task': {
      const taskId = String(args.task_id || '');
      if (isPostgreSQL()) {
        await getPool().query(
          'UPDATE tasks SET completed = TRUE, updated_at = $1 WHERE id = $2 AND user_id = $3',
          [now, taskId, userId],
        );
      } else {
        await getDatabase().run(
          'UPDATE tasks SET completed = 1, updated_at = ? WHERE id = ? AND user_id = ?',
          [now, taskId, userId],
        );
      }
      return JSON.stringify({ success: true, id: taskId, completed: true });
    }

    case 'delete_task': {
      const taskId = String(args.task_id || '');
      if (isPostgreSQL()) {
        await getPool().query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
      } else {
        await getDatabase().run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
      }
      return JSON.stringify({ success: true, id: taskId, deleted: true });
    }

    case 'update_memory': {
      const summary = String(args.summary || '').trim();
      if (!summary) return JSON.stringify({ success: false, message: 'summary vazio' });
      const newId = uuidv4();
      if (isPostgreSQL()) {
        await getPool().query(
          `INSERT INTO user_memory_profiles (id, user_id, memory_text, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE SET memory_text = $3, updated_at = $4`,
          [newId, userId, summary, now],
        );
      } else {
        const db = getDatabase();
        const existing = await db.get<{ id: string }>(
          'SELECT id FROM user_memory_profiles WHERE user_id = ?',
          [userId],
        );
        if (existing) {
          await db.run(
            'UPDATE user_memory_profiles SET memory_text = ?, updated_at = ? WHERE user_id = ?',
            [summary, now, userId],
          );
        } else {
          await db.run(
            'INSERT INTO user_memory_profiles (id, user_id, memory_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [newId, userId, summary, now, now],
          );
        }
      }
      return JSON.stringify({ success: true });
    }

    default:
      return JSON.stringify({ success: false, message: `Tool desconhecida: ${name}` });
  }
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function getDateTimeForTimezone(timezone: string): { formatted: string; isoDate: string; weekday: string } {
  const now = new Date();
  const tz = (() => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
      return timezone;
    } catch {
      return 'America/Sao_Paulo';
    }
  })();

  const formatted = now.toLocaleString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  });

  // Build ISO date (YYYY-MM-DD) for the user's timezone to avoid off-by-one day errors
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const isoDate = `${year}-${month}-${day}`;

  // Extract weekday directly from the formatted string (first segment before comma)
  const weekday = formatted.split(',')[0].trim();

  return { formatted, isoDate, weekday };
}

function getCurrentHour(timezone: string): number {
  try {
    const hourStr = new Date().toLocaleString('pt-BR', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    });
    return parseInt(hourStr, 10);
  } catch {
    return new Date().getHours();
  }
}

function getDynamicGreeting(timezone: string): string {
  const hour = getCurrentHour(timezone);
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

// Build an explicit day-of-week → date lookup for the next 7 days so the model
// never needs to do calendar arithmetic (which small models get wrong consistently).
function buildWeekCalendar(todayIso: string): string {
  const PT_WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const PT_LABELS: Record<number, string> = { 0: 'Hoje', 1: 'Amanhã', 2: 'Depois de amanhã' };

  // Parse todayIso as a local date (no timezone shift) using UTC noon
  const [y, m, d] = todayIso.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(base.getTime() + i * 86400000);
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const weekday = PT_WEEKDAYS[date.getUTCDay()];
    const label = PT_LABELS[i] ?? weekday;
    return `${label} (${weekday}): ${dd}/${mm}`;
  }).join('\n');
}

function buildSystemPrompt(tasks: TaskRow[], memory: string, timezone: string, preferredName: string): string {
  const activeTasks = tasks.filter((t) => !t.completed);
  const completedCount = tasks.length - activeTasks.length;
  const { formatted: dateFormatted, isoDate: todayIso, weekday: todayWeekday } = getDateTimeForTimezone(timezone);
  const weekCalendar = buildWeekCalendar(todayIso);

  const taskList =
    activeTasks.length > 0
      ? activeTasks
          .slice(0, 30)
          .map((t) => {
            const parts: string[] = [`📌 "${t.title}"`];
            if (t.due_date) parts.push(`vence ${t.due_date}`);
            if (t.time) parts.push(`às ${t.time}`);
            if (t.priority) parts.push(t.priority);
            parts.push(`id:${t.id}`);
            return parts.join(' | ');
          })
          .join('\n')
      : '(nenhuma tarefa ativa)';

  const greeting = getDynamicGreeting(timezone);

  const todayDDMM = todayIso.split('-').reverse().slice(0, 2).join('/');

  const lines: (string | null)[] = [
    `=== CONTEXTO TEMPORAL — LEIA ANTES DE TUDO ===`,
    `DATA DE HOJE: ${todayIso} | Dia: ${todayWeekday} | Exibir como: ${todayDDMM}`,
    `HORA ATUAL: ${dateFormatted.split(',').slice(-1)[0]?.trim() ?? ''} (${timezone})`,
    ``,
    `CALENDÁRIO DOS PRÓXIMOS 7 DIAS (use ESTE calendário para todas as datas — nunca calcule):`,
    weekCalendar,
    ``,
    `⛔ NUNCA calcule datas manualmente. NUNCA use datas do histórico de conversa. Use SOMENTE o calendário acima.`,
    `==============================================`,
    ``,
    `Você é o Jarvi, assistente pessoal de produtividade no WhatsApp, em português brasileiro.`,
    `Personalidade: direto, empático, prático. Não é um bot que só cria tarefas — você conversa, orienta, responde perguntas e organiza a vida do usuário.`,
    ``,
    `Tarefas do usuário — ${activeTasks.length} ativas, ${completedCount} concluídas:`,
    taskList,
    ``,
    memory ? `Memória do usuário:\n${memory}` : null,
    ``,
    `FORMATAÇÃO OBRIGATÓRIA PARA WHATSAPP:`,
    `- Nunca use markdown: sem **, ##, ---, backticks ou itálico`,
    `- Use emojis no lugar de marcadores: ✅ concluída, 📌 ativa, ⏰ com prazo, ➕ criada`,
    `- Máximo 5 linhas por resposta — seja direto e conciso`,
    `- Separe informações com | ou quebras de linha, nunca com bullets de texto`,
    ``,
    `REGRAS DE COMPORTAMENTO:`,
    ``,
    `⚠️ IMPORTANTE — COMO A CRIAÇÃO FUNCIONA:`,
    `Tarefas criadas pelo WhatsApp vão primeiro para a seção "Integrações" no app, onde o usuário aprova antes de virarem tarefas ativas. Ou seja: quando você chama create_task, o que você está gerando é uma SUGESTÃO pendente de aprovação, não uma tarefa ativa.`,
    ``,
    `⚠️ REGRA CRÍTICA — CRIAÇÃO DE SUGESTÕES:`,
    `Quando o usuário expressar intenção de fazer algo ("preciso", "quero", "tenho que", "agenda", "marca", "compra", "faz", "lembrar"):`,
    `1. Chame create_task IMEDIATAMENTE — sem pedir confirmação, sem fazer perguntas antes`,
    `2. Só após a ferramenta retornar sucesso, escreva a confirmação abaixo`,
    `3. NUNCA escreva "sugerida" ou "criada" sem ter chamado create_task antes`,
    `4. Se o usuário fizer uma pergunta sobre como registrar (ex: "agendar pra essa semana ou deixar em aberto?"), registre com os dados disponíveis AGORA e ofereça ajustar depois — não espere a resposta`,
    ``,
    `- Ao concluir tarefa (de tarefas ATIVAS da lista acima), responda em 1 linha: "✅ [título] concluída!"`,
    `- Ao criar tarefa, use EXATAMENTE este formato (sem markdown, sem **):`,
    ``,
    `📋 [título exato] — criada.`,
    ``,
    `Já criei a tarefa no app.`,
    ``,
    `[Inclua a seção "Sugestão de ajuste:" APENAS se a tarefa foi registrada sem data OU sem prioridade. Liste só os campos faltantes:]`,
    `Sugestão de ajuste:`,
    `• [data sugerida — ex: "Hoje", "Amanhã", "Esta semana" — com base no contexto]`,
    `• [prioridade sugerida — ex: "Prioridade média" ou "Prioridade alta"]`,
    ``,
    `Quer ajustar algo antes?`,
    ``,
    `Regras da criação:`,
    `- Escreva a frase de validação literalmente como está acima — não parafraseie nem substitua palavras`,
    `- Se a tarefa já foi registrada COM data e prioridade, omita a seção "Sugestão de ajuste:" inteira`,
    `- Nunca repita o título na frase de validação`,
    `- Nunca use **, ##, --- ou qualquer markdown`,
    `- Ao listar tarefas ATIVAS, use o formato com emojis acima, sem IDs visíveis para o usuário`,
    `- A lista acima mostra APENAS tarefas ativas (já aprovadas). Sugestões pendentes não aparecem — se o usuário perguntar "cadê a tarefa que acabei de criar?", explique que ela está na aba Integrações aguardando aprovação`,
    `- MEMÓRIA: Se a mensagem contiver informação pessoal nova (nomes, relacionamentos, localização, preferências, hábitos, datas importantes), chame update_memory mesclando com o que já existia — nunca descarte informações antigas`,
    `- Data/hora atual: ${dateFormatted} (${timezone})`,
    ``,
    `⛔ ESCOPO DE FUNCIONALIDADES:`,
    `Você só sabe criar sugestões, editar, concluir e excluir tarefas INDIVIDUAIS. NÃO ofereça dividir em subtarefas, criar listas/projetos, lembretes recorrentes ou qualquer coisa fora das suas tools. Se o usuário pedir algo fora do escopo (ex: "divide isso em partes", "cria uma lista X"), responda que por enquanto trabalha só com tarefas individuais e sugira registrar como uma só.`,
    ``,
    `⛔ ANTI-DUPLICATA:`,
    `Antes de chamar create_task, olhe a lista de tarefas ATIVAS acima E o histórico da conversa. Se você já sugeriu uma tarefa com título idêntico ou muito semelhante nesta mesma conversa, NÃO chame create_task de novo — apenas lembre o usuário que a sugestão já está aguardando aprovação.`,
    ``,
    `⛔ ACKNOWLEDGMENTS AMBÍGUOS ("pode ser", "ok", "sim", "tá bom", "beleza"):`,
    `Quando a mensagem do usuário for apenas uma confirmação genérica a algo que VOCÊ ofereceu antes, releia sua última resposta. Se você não ofereceu nada concreto dentro do escopo (criar/editar/concluir/excluir tarefa), apenas confirme brevemente — NUNCA chame create_task, update_task ou qualquer tool apenas porque o usuário concordou vagamente. "pode ser" sozinho não é pedido de nova sugestão.`,
    ``,
    `BRIEFING DIÁRIO — use este formato EXATO quando o usuário perguntar sobre o dia ("como está meu dia", "o que tenho hoje", "o que tenho amanhã", "resumo do dia", "meu dia", "minhas tarefas de hoje/amanhã", saudações como "oi", "olá", "bom dia", "boa tarde", "boa noite" sem outra intenção clara):`,
    ``,
    `${greeting}${preferredName ? `, ${preferredName}` : ''}! Hoje é ${todayWeekday} ${todayIso.split('-').reverse().slice(0, 2).join('/')}.`,
    ``,
    `🔥 Prioridades`,
    `— [tarefa high priority 1]`,
    `— [tarefa high priority 2]`,
    ``,
    `Outras tarefas`,
    `• [demais tarefas do período]`,
    `• ...`,
    ``,
    `Quer que eu te mostre o jeito mais fácil de começar?`,
    ``,
    `Regras do briefing:`,
    `- Use a saudação correta para o horário atual: "${greeting}"`,
    `- Use o primeiro nome do usuário (da memória, se disponível)`,
    `- "Prioridades" = tarefas com priority=high do período relevante (hoje, amanhã, ou próximas se não houver)`,
    `- "Outras tarefas" = demais tarefas do mesmo período`,
    `- Se não houver tarefas high, omita a seção "🔥 Prioridades" e liste tudo em "Outras tarefas"`,
    `- Se o usuário só mandou uma saudação sem data específica, foque no dia atual ou no próximo período com tarefas`,
    `- Nunca mostre IDs para o usuário`,
  ];

  const prompt = lines.filter((l): l is string => l !== null).join('\n');

  return prompt;
}

// ---------------------------------------------------------------------------
// Post-response memory extraction
// ---------------------------------------------------------------------------

async function extractMemoryPostResponse(
  userId: string,
  userMessage: string,
  currentMemory: string,
): Promise<void> {
  if (!userMessage.trim()) return;

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: MEMORY_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          `Analise a mensagem abaixo e extraia QUALQUER informação pessoal nova sobre o usuário.`,
          ``,
          `MEMÓRIA ATUAL:`,
          currentMemory || '(vazia)',
          ``,
          `MENSAGEM DO USUÁRIO:`,
          userMessage,
          ``,
          `Se houver informação nova (nomes de pessoas/animais, relacionamentos, localização, preferências, hábitos, datas importantes, contexto profissional/pessoal), retorne a memória COMPLETA atualizada — mesclando o que já existia com o que é novo. Escreva em terceira pessoa, em português brasileiro, de forma concisa.`,
          `Se NÃO houver nenhuma informação pessoal nova, retorne exatamente: NO_UPDATE`,
        ].join('\n'),
      },
    ],
    max_tokens: 800,
  });

  const result = response.choices[0]?.message?.content?.trim();
  if (result && result !== 'NO_UPDATE') {
    const now = new Date().toISOString();
    if (isPostgreSQL()) {
      await getPool().query(
        `INSERT INTO user_memory_profiles (id, user_id, memory_text, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET memory_text = $3, updated_at = $4`,
        [uuidv4(), userId, result, now],
      );
    } else {
      const db = getDatabase();
      const existing = await db.get('SELECT id FROM user_memory_profiles WHERE user_id = ?', [userId]);
      if (existing) {
        await db.run(
          'UPDATE user_memory_profiles SET memory_text = ?, updated_at = ? WHERE user_id = ?',
          [result, now, userId],
        );
      } else {
        await db.run(
          'INSERT INTO user_memory_profiles (id, user_id, memory_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          [uuidv4(), userId, result, now, now],
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main agent runner
// ---------------------------------------------------------------------------

// Heuristic to detect when the assistant text claims a task was created or
// suggested. Used by the anti-hallucination guardrail: if the model "confirms"
// creation without ever calling create_task, we force a retry with
// tool_choice: 'required'.
const CREATION_CLAIM_REGEX =
  /(^|\s)(➕|📋|sugerida\b|sugeri\b|criada\b|criei\b|anotei\b|agendei\b|registrei\b)/i;

interface AgentRunOptions {
  forceToolChoice?: boolean;
}

interface AgentRunResult {
  responseText: string;
  toolCallNames: string[];
}

async function runAgentLoop(
  userId: string,
  systemPrompt: string,
  initialMessages: ChatCompletionMessageParam[],
  toolContext: ExecuteToolContext,
  options: AgentRunOptions = {},
): Promise<AgentRunResult> {
  const openai = getOpenAIClient();
  const MAX_ITERATIONS = 5;

  let responseText = '';
  let currentMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...initialMessages,
  ];
  const toolCallNames: string[] = [];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await openai.chat.completions.create({
      model: AGENT_MODEL,
      messages: currentMessages,
      tools: WHATSAPP_TOOLS,
      // On the first iteration, honor the guardrail's request to force a tool call.
      // After the first iteration, let the model decide (so it can speak the final text).
      tool_choice: options.forceToolChoice && iteration === 0 ? 'required' : 'auto',
      max_completion_tokens: 1024,
    });

    const choice = response.choices[0];
    const message = choice?.message;
    const allToolCalls = message?.tool_calls ?? [];
    // Narrow the union — we only use function tool calls, not custom ones.
    const functionToolCalls = allToolCalls.filter(
      (tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function',
    );

    console.log('[WhatsApp Agent] iteration=%d finish_reason=%s tools=%s userId=%s',
      iteration,
      choice?.finish_reason,
      functionToolCalls
        .map((tc) => `${tc.function.name}(${tc.function.arguments})`)
        .join(', ') || 'none',
      userId,
    );

    const textContent = message?.content?.trim();
    if (textContent) responseText = textContent;

    if (!functionToolCalls.length) break;

    // Push the assistant message (with tool_calls) onto the conversation.
    currentMessages = [
      ...currentMessages,
      {
        role: 'assistant',
        content: message?.content ?? null,
        tool_calls: functionToolCalls,
      },
    ];

    // Execute each tool call and append the results as 'tool' messages.
    const toolResultMessages: ChatCompletionToolMessageParam[] = await Promise.all(
      functionToolCalls.map(async (tc) => {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          parsedArgs = {};
        }

        const result = await executeTool(tc.function.name, parsedArgs, toolContext);
        console.log('[WhatsApp Agent] tool=%s result=%s', tc.function.name, result);
        toolCallNames.push(tc.function.name);

        return {
          role: 'tool' as const,
          tool_call_id: tc.id,
          content: result,
        };
      }),
    );

    currentMessages = [...currentMessages, ...toolResultMessages];
  }

  return { responseText, toolCallNames };
}

export interface RunWhatsappAgentOptions {
  whatsappPhone?: string;
  whatsappMessageSid?: string;
}

export const runWhatsappAgent = async (
  userId: string,
  userMessage: string,
  redis: RedisLike,
  options: RunWhatsappAgentOptions = {},
): Promise<string> => {
  const [{ memory, timezone, preferredName }, tasks] = await Promise.all([
    getUserMemoryAndTimezone(userId),
    getUserTasks(userId),
  ]);

  const systemPrompt = buildSystemPrompt(tasks, memory, timezone, preferredName);

  // Compute today's date once and share across history load + message injection
  const { isoDate: todayIso, weekday: todayWeekday } = getDateTimeForTimezone(timezone);
  const todayDDMM = todayIso.split('-').reverse().slice(0, 2).join('/');

  // Load history AFTER computing todayIso so we can auto-clear stale days
  const history = await loadHistory(redis, userId, todayIso);

  // Inject a date-correction anchor at the end of history so the model always
  // sees the authoritative current date as the most recent context.
  const dateCorrectionPair: ChatCompletionMessageParam[] =
    history.length > 0
      ? [
          { role: 'user', content: `[SISTEMA] Qual é a data de hoje?` },
          { role: 'assistant', content: `Hoje é ${todayWeekday}, ${todayDDMM}.` },
        ]
      : [];

  const initialMessages: ChatCompletionMessageParam[] = [
    ...history.map(
      (m) => ({ role: m.role, content: m.content } as ChatCompletionMessageParam),
    ),
    ...dateCorrectionPair,
    { role: 'user', content: userMessage },
  ];

  const toolContext: ExecuteToolContext = {
    userId,
    originalWhatsappContent: userMessage,
    whatsappPhone: options.whatsappPhone,
    whatsappMessageSid: options.whatsappMessageSid,
  };

  let { responseText, toolCallNames } = await runAgentLoop(
    userId,
    systemPrompt,
    initialMessages,
    toolContext,
  );

  // --- Anti-hallucination guardrail ------------------------------------------
  // If the response claims a task was created but we never called any
  // creation tool in this turn, retry forcing tool_choice='required' on the
  // first round so the model is compelled to actually call a tool.
  const claimedCreation = CREATION_CLAIM_REGEX.test(responseText);
  const actuallyCalledCreationTool = toolCallNames.some((name) => CREATION_TOOL_NAMES.has(name));

  if (claimedCreation && !actuallyCalledCreationTool) {
    console.warn(
      '[WhatsApp Agent] Hallucination guardrail triggered — retrying with tool_choice=required userId=%s',
      userId,
    );
    const retry = await runAgentLoop(userId, systemPrompt, initialMessages, toolContext, {
      forceToolChoice: true,
    });
    responseText = retry.responseText || responseText;
    toolCallNames = [...toolCallNames, ...retry.toolCallNames];
  }

  const finalResponse = responseText || 'Entendido! Como posso te ajudar?';

  // Persist conversation turn to Redis history
  await appendHistory(redis, userId, userMessage, finalResponse, todayIso);

  // Fire-and-forget: extract personal info the model may have missed
  extractMemoryPostResponse(userId, userMessage, memory).catch((err) => {
    console.error('[WhatsApp Memory extraction] failed:', err);
  });

  return finalResponse;
};
