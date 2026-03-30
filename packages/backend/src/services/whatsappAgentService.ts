import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';

// Duck-typed interface covering the Redis methods we actually use,
// compatible with both ioredis `Redis` and `Cluster` instances.
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: 'EX', time: number): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------

let anthropicClient: Anthropic | null = null;

const getAnthropicClient = (): Anthropic => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
};

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
const HISTORY_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_HISTORY_MESSAGES = 20; // 10 turns

async function loadHistory(redis: RedisLike, userId: string): Promise<ConversationMessage[]> {
  try {
    const raw = await redis.get(historyKey(userId));
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
): Promise<void> {
  try {
    const history = await loadHistory(redis, userId);
    history.push({ role: 'user', content: userMsg });
    history.push({ role: 'assistant', content: assistantMsg });
    const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
    await redis.set(historyKey(userId), JSON.stringify(trimmed), 'EX', HISTORY_TTL_SECONDS);
  } catch {
    // ignore — history is best-effort
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function getUserMemoryAndTimezone(
  userId: string,
): Promise<{ memory: string; timezone: string }> {
  try {
    if (isPostgreSQL()) {
      const [memRes, tzRes] = await Promise.all([
        getPool().query(
          'SELECT memory_text, consent_ai_memory FROM user_memory_profiles WHERE user_id = $1',
          [userId],
        ),
        getPool().query('SELECT timezone FROM users WHERE id = $1', [userId]),
      ]);
      const memRow = memRes.rows[0];
      const memory =
        memRow && memRow.consent_ai_memory !== false ? (memRow.memory_text || '') : '';
      return { memory, timezone: tzRes.rows[0]?.timezone || 'America/Sao_Paulo' };
    }
    const db = getDatabase();
    const [memRow, tzRow] = await Promise.all([
      db.get<{ memory_text: string; consent_ai_memory: number }>(
        'SELECT memory_text, consent_ai_memory FROM user_memory_profiles WHERE user_id = ?',
        [userId],
      ),
      db.get<{ timezone?: string }>('SELECT timezone FROM users WHERE id = ?', [userId]),
    ]);
    const memory = memRow && memRow.consent_ai_memory ? (memRow.memory_text || '') : '';
    return { memory, timezone: tzRow?.timezone || 'America/Sao_Paulo' };
  } catch {
    return { memory: '', timezone: 'America/Sao_Paulo' };
  }
}

async function getUserTasks(userId: string): Promise<TaskRow[]> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      `SELECT id, title, description, completed, priority, category, due_date, time, created_at
       FROM tasks WHERE user_id = $1
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
     FROM tasks WHERE user_id = ?
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
// Tool definitions (Anthropic format)
// ---------------------------------------------------------------------------

const WHATSAPP_TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_task',
    description: 'Cria uma nova tarefa para o usuário diretamente na lista de tarefas.',
    input_schema: {
      type: 'object' as const,
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
  {
    name: 'update_task',
    description: 'Atualiza campos de uma tarefa existente.',
    input_schema: {
      type: 'object' as const,
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
  {
    name: 'complete_task',
    description: 'Marca uma tarefa como concluída.',
    input_schema: {
      type: 'object' as const,
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
  },
  {
    name: 'delete_task',
    description: 'Exclui permanentemente uma tarefa.',
    input_schema: {
      type: 'object' as const,
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
  },
  {
    name: 'update_memory',
    description:
      'Atualiza o perfil de memória do usuário. O campo summary deve conter TODO o conhecimento acumulado — mescle sempre com a memória anterior, nunca descarte.',
    input_schema: {
      type: 'object' as const,
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
];

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const now = new Date().toISOString();

  switch (name) {
    case 'create_task': {
      const taskId = uuidv4();
      const title = String(args.title || '');
      const description = args.description ? String(args.description) : null;
      const priority = args.priority ? String(args.priority) : null;
      const dueDate = args.due_date ? String(args.due_date) : null;
      const time = args.time ? String(args.time) : null;
      const category = args.category ? String(args.category) : null;

      if (isPostgreSQL()) {
        await getPool().query(
          `INSERT INTO tasks (id, user_id, title, description, priority, category, due_date, time, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [taskId, userId, title, description, priority, category, dueDate, time, now, now],
        );
      } else {
        await getDatabase().run(
          `INSERT INTO tasks (id, user_id, title, description, priority, category, due_date, time, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [taskId, userId, title, description, priority, category, dueDate, time, now, now],
        );
      }
      return JSON.stringify({ success: true, id: taskId, title });
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
          values.push(args[key]);
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

function getDateTimeForTimezone(timezone: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  try {
    return new Date().toLocaleString('pt-BR', { ...opts, timeZone: timezone });
  } catch {
    return new Date().toLocaleString('pt-BR', { ...opts, timeZone: 'America/Sao_Paulo' });
  }
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

function buildSystemPrompt(tasks: TaskRow[], memory: string, timezone: string): string {
  const activeTasks = tasks.filter((t) => !t.completed);
  const completedCount = tasks.length - activeTasks.length;

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

  const lines: (string | null)[] = [
    `Você é o Jarvi, assistente pessoal de produtividade no WhatsApp, em português brasileiro.`,
    `Personalidade: amigo próximo, direto, empático, prático. Não é um bot que só cria tarefas — você conversa, orienta, responde perguntas e organiza a vida do usuário.`,
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
    `⚠️ REGRA CRÍTICA — CRIAÇÃO DE TAREFAS:`,
    `Quando o usuário expressar intenção de fazer algo ("preciso", "quero", "tenho que", "agenda", "marca", "compra", "faz", "lembrar"):`,
    `1. Chame create_task IMEDIATAMENTE — sem pedir confirmação, sem fazer perguntas antes`,
    `2. Só após a ferramenta retornar sucesso, escreva a confirmação abaixo`,
    `3. NUNCA escreva "criada" ou use o template de confirmação sem ter chamado create_task antes`,
    `4. Se o usuário fizer uma pergunta sobre como criar a tarefa (ex: "agendar pra essa semana ou deixar em aberto?"), crie com os dados disponíveis AGORA e ofereça ajustar depois — não espere a resposta`,
    ``,
    `- Ao concluir tarefa, responda em 1 linha: "✅ [título] concluída!"`,
    `- Ao criar tarefa, use EXATAMENTE este formato (sem markdown, sem **):`,
    ``,
    `➕ [título exato] criada.`,
    ``,
    `[1 frase empática e curta sobre a tarefa — ex: "Isso parece algo rápido e importante no dia a dia." ou "Boa ideia deixar isso registrado."]`,
    ``,
    `[Inclua a seção "Sugestão:" APENAS se a tarefa foi criada sem data OU sem prioridade. Liste só os campos faltantes:]`,
    `Sugestão:`,
    `• [data sugerida — ex: "Hoje", "Amanhã", "Esta semana" — com base no contexto da tarefa]`,
    `• [prioridade sugerida — ex: "Prioridade média" ou "Prioridade alta"]`,
    ``,
    `Quer mudar algo ou seguimos assim?`,
    ``,
    `Regras da criação:`,
    `- Se a tarefa já foi criada COM data e prioridade, omita a seção "Sugestão:" inteira`,
    `- A frase empática deve ser específica ao tipo de tarefa, nunca genérica`,
    `- Nunca repita o título na frase empática`,
    `- Nunca use **, ##, --- ou qualquer markdown`,
    `- Ao listar tarefas, use o formato com emojis acima, sem IDs visíveis para o usuário`,
    `- Responda perguntas sobre tarefas, datas e prioridades usando a lista acima`,
    `- MEMÓRIA: Se a mensagem contiver informação pessoal nova (nomes, relacionamentos, localização, preferências, hábitos, datas importantes), chame update_memory mesclando com o que já existia — nunca descarte informações antigas`,
    `- Data/hora atual (${timezone}): ${getDateTimeForTimezone(timezone)}`,
    ``,
    `BRIEFING DIÁRIO — use este formato EXATO quando o usuário perguntar sobre o dia ("como está meu dia", "o que tenho hoje", "o que tenho amanhã", "resumo do dia", "meu dia", "minhas tarefas de hoje/amanhã", saudações como "oi", "olá", "bom dia", "boa tarde", "boa noite" sem outra intenção clara):`,
    ``,
    `${greeting}, [nome]! [descrição do período — ex: "Hoje é segunda 30/03" ou "Amanhã é terça 31/03"].`,
    ``,
    `🔥 Prioridades`,
    `— [tarefa high priority 1]`,
    `— [tarefa high priority 2]`,
    ``,
    `Outras tarefas`,
    `• [demais tarefas do período]`,
    `• ...`,
    ``,
    `[Pergunta curta e relevante para engajar — ex: "Quer que eu te mostre o jeito mais fácil de começar?"]`,
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

  return lines.filter((l): l is string => l !== null).join('\n');
}

// ---------------------------------------------------------------------------
// Main agent runner
// ---------------------------------------------------------------------------

export const runWhatsappAgent = async (
  userId: string,
  userMessage: string,
  redis: RedisLike,
): Promise<string> => {
  const anthropic = getAnthropicClient();

  const [{ memory, timezone }, tasks, history] = await Promise.all([
    getUserMemoryAndTimezone(userId),
    getUserTasks(userId),
    loadHistory(redis, userId),
  ]);

  const systemPrompt = buildSystemPrompt(tasks, memory, timezone);

  const conversationMessages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content } as Anthropic.MessageParam)),
    { role: 'user', content: userMessage },
  ];

  let responseText = '';
  let currentMessages = conversationMessages;
  const MAX_ITERATIONS = 5;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      system: systemPrompt,
      messages: currentMessages,
      tools: WHATSAPP_TOOLS,
      max_tokens: 1024,
    });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    console.log('[WhatsApp Agent] iteration=%d stop_reason=%s tools=%s userId=%s', 
      iteration,
      response.stop_reason,
      toolUses.map((t) => `${t.name}(${JSON.stringify(t.input)})`).join(', ') || 'none',
      userId,
    );

    // Collect any text from this turn
    const textBlocks = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text.trim())
      .filter(Boolean);

    if (textBlocks.length) {
      responseText = textBlocks.join('\n');
    }

    if (response.stop_reason !== 'tool_use') break;

    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content },
    ];

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (tu) => {
        const result = await executeTool(tu.name, tu.input as Record<string, unknown>, userId);
        console.log('[WhatsApp Agent] tool=%s result=%s', tu.name, result);
        return {
          type: 'tool_result' as const,
          tool_use_id: tu.id,
          content: result,
        };
      }),
    );

    currentMessages = [
      ...currentMessages,
      { role: 'user', content: toolResults },
    ];
  }

  const finalResponse = responseText || 'Entendido! Como posso te ajudar?';

  // Persist conversation turn to Redis history
  await appendHistory(redis, userId, userMessage, finalResponse);

  return finalResponse;
};
