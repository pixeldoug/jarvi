import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ChatCompletionTool } from 'openai/resources/chat/completions';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Provider clients
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


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  completed: boolean;
  priority?: string | null;
  category?: string | null;
  due_date?: string | null;
  time?: string | null;
  created_at: string;
}

export type SSEEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolName: string; toolArgs: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; success: boolean; data?: Record<string, unknown> }
  | { type: 'separator' }
  | { type: 'done' }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Function-calling tool definitions
// ---------------------------------------------------------------------------

const AI_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Cria uma nova tarefa para o usuário.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título da tarefa' },
          description: { type: 'string', description: 'Descrição da tarefa' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Prioridade' },
          due_date: { type: 'string', description: 'Data de vencimento em ISO 8601 (YYYY-MM-DD)' },
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
      description: 'Atualiza uma tarefa existente do usuário.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'ID da tarefa a atualizar' },
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
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
        properties: {
          task_id: { type: 'string', description: 'ID da tarefa' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Exclui uma tarefa.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'ID da tarefa' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_memory',
      description: 'Atualiza o perfil de memória do usuário. IMPORTANTE: o campo summary deve conter TODO o conhecimento acumulado sobre o usuário — tanto o que já estava na memória anterior quanto as novas informações aprendidas nesta conversa. Nunca descarte informações antigas; sempre mescle com as novas.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Perfil completo e acumulado do usuário. Deve incluir: relacionamentos pessoais (família, amigos, colegas mencionados), preferências e hábitos, eventos importantes e datas, padrões de comportamento, contexto profissional e pessoal. Mescle sempre com o que já estava na memória anterior — nunca substitua, sempre acumule.',
          },
        },
        required: ['summary'],
      },
    },
  },
];

// Converts AI_TOOLS (OpenAI format) to Anthropic tool format
function toAnthropicTools(tools: ChatCompletionTool[]): Anthropic.Tool[] {
  return tools
    .filter((t): t is Extract<ChatCompletionTool, { type: 'function'; function: object }> =>
      t.type === 'function' && 'function' in t,
    )
    .map((t) => ({
      name: t.function.name,
      description: t.function.description ?? '',
      input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
    }));
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function getUserMemory(userId: string): Promise<string> {
  try {
    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query(
        'SELECT memory_text, consent_ai_memory FROM user_memory_profiles WHERE user_id = $1',
        [userId],
      );
      const row = result.rows[0];
      if (!row || row.consent_ai_memory === false) return '';
      return row.memory_text || '';
    }
    const db = getDatabase();
    const row = await db.get<{ memory_text: string; consent_ai_memory: number }>(
      'SELECT memory_text, consent_ai_memory FROM user_memory_profiles WHERE user_id = ?',
      [userId],
    );
    if (!row || !row.consent_ai_memory) return '';
    return row.memory_text || '';
  } catch {
    return '';
  }
}

async function getUserTasks(userId: string): Promise<TaskRow[]> {
  if (isPostgreSQL()) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, title, description, completed, priority, category, due_date, time, created_at FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return result.rows;
  }
  const db = getDatabase();
  return db.all<TaskRow[]>(
    'SELECT id, title, description, completed, priority, category, due_date, time, created_at FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  );
}

async function getTaskById(taskId: string, userId: string): Promise<TaskRow | null> {
  if (isPostgreSQL()) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, title, description, completed, priority, category, due_date, time, created_at FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, userId],
    );
    return result.rows[0] || null;
  }
  const db = getDatabase();
  const row = await db.get<TaskRow>(
    'SELECT id, title, description, completed, priority, category, due_date, time, created_at FROM tasks WHERE id = ? AND user_id = ?',
    [taskId, userId],
  );
  return row || null;
}

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<{ success: boolean; data?: Record<string, unknown>; message?: string }> {
  const now = new Date().toISOString();

  switch (toolName) {
    case 'create_task': {
      const taskId = uuidv4();
      const title = String(args.title || '');
      const description = args.description ? String(args.description) : null;
      const priority = args.priority ? String(args.priority) : null;
      const dueDate = args.due_date ? String(args.due_date) : null;
      const category = args.category ? String(args.category) : null;

      if (isPostgreSQL()) {
        const pool = getPool();
        await pool.query(
          `INSERT INTO tasks (id, user_id, title, description, priority, category, due_date, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [taskId, userId, title, description, priority, category, dueDate, now, now],
        );
      } else {
        const db = getDatabase();
        await db.run(
          `INSERT INTO tasks (id, user_id, title, description, priority, category, due_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [taskId, userId, title, description, priority, category, dueDate, now, now],
        );
      }

      return {
        success: true,
        data: { id: taskId, title, description, priority, due_date: dueDate, category },
      };
    }

    case 'update_task': {
      const taskId = String(args.task_id || '');
      const task = await getTaskById(taskId, userId);
      if (!task) return { success: false, message: 'Tarefa não encontrada' };

      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;
      const placeholder = () => (isPostgreSQL() ? `$${paramIdx++}` : '?');

      for (const [key, col] of [['title', 'title'], ['description', 'description'], ['priority', 'priority'], ['due_date', 'due_date'], ['category', 'category']] as const) {
        if (args[key] !== undefined) {
          fields.push(`${col} = ${placeholder()}`);
          values.push(args[key]);
        }
      }

      if (fields.length === 0) return { success: true, data: { id: taskId } };

      fields.push(`updated_at = ${placeholder()}`);
      values.push(now);
      values.push(taskId);
      values.push(userId);

      const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ${placeholder()} AND user_id = ${placeholder()}`;

      if (isPostgreSQL()) {
        await getPool().query(sql, values);
      } else {
        await getDatabase().run(sql, values);
      }

      const updated = await getTaskById(taskId, userId);
      return { success: true, data: updated as unknown as Record<string, unknown> };
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
      return { success: true, data: { id: taskId, completed: true } };
    }

    case 'delete_task': {
      const taskId = String(args.task_id || '');
      if (isPostgreSQL()) {
        await getPool().query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
      } else {
        await getDatabase().run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
      }
      return { success: true, data: { id: taskId, deleted: true } };
    }

    case 'update_memory': {
      const summary = String(args.summary || '');
      if (isPostgreSQL()) {
        const pool = getPool();
        await pool.query(
          `INSERT INTO user_memory_profiles (id, user_id, memory_text, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE SET memory_text = $3, updated_at = $4`,
          [uuidv4(), userId, summary, now],
        );
      } else {
        const db = getDatabase();
        const existing = await db.get('SELECT id FROM user_memory_profiles WHERE user_id = ?', [userId]);
        if (existing) {
          await db.run(
            'UPDATE user_memory_profiles SET memory_text = ?, updated_at = ? WHERE user_id = ?',
            [summary, now, userId],
          );
        } else {
          await db.run(
            'INSERT INTO user_memory_profiles (id, user_id, memory_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [uuidv4(), userId, summary, now, now],
          );
        }
      }
      return { success: true };
    }

    default:
      return { success: false, message: `Tool desconhecida: ${toolName}` };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDateTimeForTimezone(timezone: string): string {
  try {
    return new Date().toLocaleString('pt-BR', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    // Fallback to Brasília if timezone is invalid
    return new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
}

async function getUserTimezone(userId: string): Promise<string> {
  try {
    if (isPostgreSQL()) {
      const pool = getPool();
      const result = await pool.query('SELECT timezone FROM users WHERE id = $1', [userId]);
      return result.rows[0]?.timezone || 'America/Sao_Paulo';
    }
    const db = getDatabase();
    const row = await db.get<{ timezone?: string }>('SELECT timezone FROM users WHERE id = ?', [userId]);
    return row?.timezone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

// ---------------------------------------------------------------------------
// Memory reconciliation
// ---------------------------------------------------------------------------

async function needsReconciliation(userId: string): Promise<boolean> {
  try {
    let lastReconciled: string | null = null;
    if (isPostgreSQL()) {
      const result = await getPool().query('SELECT last_reconciled_at FROM users WHERE id = $1', [userId]);
      lastReconciled = result.rows[0]?.last_reconciled_at ?? null;
    } else {
      const row = await getDatabase().get<{ last_reconciled_at?: string }>(
        'SELECT last_reconciled_at FROM users WHERE id = ?',
        [userId],
      );
      lastReconciled = row?.last_reconciled_at ?? null;
    }
    if (!lastReconciled) return true;
    const diff = Date.now() - new Date(lastReconciled).getTime();
    return diff > 20 * 60 * 60 * 1000; // 20 hours — fires once per day with buffer
  } catch {
    return false;
  }
}

async function markReconciled(userId: string): Promise<void> {
  const now = new Date().toISOString();
  if (isPostgreSQL()) {
    await getPool().query('UPDATE users SET last_reconciled_at = $1 WHERE id = $2', [now, userId]);
  } else {
    await getDatabase().run('UPDATE users SET last_reconciled_at = ? WHERE id = ?', [now, userId]);
  }
}

async function getAllUserTasks(userId: string): Promise<TaskRow[]> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      'SELECT id, user_id, title, description, completed, priority, category, due_date, time, created_at FROM tasks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [userId],
    );
    return result.rows as TaskRow[];
  } else {
    return (await getDatabase().all<TaskRow[]>(
      'SELECT id, user_id, title, description, completed, priority, category, due_date, time, created_at FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [userId],
    )) as TaskRow[];
  }
}

async function reconcileMemory(userId: string, currentMemory: string, timezone: string): Promise<string> {
  if (!currentMemory.trim()) return currentMemory;

  const openai = getOpenAIClient();
  const tasks = await getAllUserTasks(userId);

  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  const activeList = activeTasks.length
    ? activeTasks.map((t) => `  - "${t.title}"${t.due_date ? ` (vence: ${t.due_date})` : ''}`).join('\n')
    : '  (nenhuma)';

  const completedList = completedTasks.length
    ? completedTasks.slice(0, 20).map((t) => `  - "${t.title}"`).join('\n')
    : '  (nenhuma)';

  const now = getDateTimeForTimezone(timezone);

  const prompt = `Você é um assistente que mantém o perfil de memória de um usuário.

Data/hora atual: ${now}

MEMÓRIA ATUAL:
${currentMemory}

TAREFAS ATIVAS DO USUÁRIO:
${activeList}

TAREFAS CONCLUÍDAS (mais recentes):
${completedList}

Sua tarefa: reescreva a memória para refletir o estado ATUAL do usuário.
Regras:
- Mantenha todos os fatos permanentes (nomes de pessoas, relacionamentos, localização, preferências, hábitos).
- Atualize estados transitórios: se a memória diz "está considerando X" mas a tarefa X já foi concluída, escreva "fez X" ou "comprou X".
- Se uma intenção mencionada na memória não tem tarefa correspondente ativa ou concluída, mantenha como "considerou/pensou em X" com contexto temporal se possível.
- Remova redundâncias. Seja conciso mas completo.
- Escreva em terceira pessoa, em português brasileiro.
- Retorne APENAS o texto da memória atualizada, sem explicações adicionais.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    });
    const updated = response.choices[0]?.message?.content?.trim();
    return updated || currentMemory;
  } catch {
    return currentMemory;
  }
}

// ---------------------------------------------------------------------------
// System prompt builders
// ---------------------------------------------------------------------------

function buildTaskModeSystemPrompt(task: TaskRow, memory: string, timezone: string): string {
  const parts = [
    `Você é o Jarvi, assistente pessoal de produtividade em português brasileiro.`,
    `Personalidade: você age como um amigo próximo que realmente entende o problema do usuário — direto, empático, prático. Não é um bot que só executa comandos: você raciocina sobre a situação, oferece orientação útil quando faz sentido, e só então organiza as ações. Use a memória do usuário ativamente para personalizar cada resposta.`,
    ``,
    `Você está ajudando com uma tarefa específica:`,
    `- Título: "${task.title}"`,
    task.description ? `- Descrição: "${task.description}"` : null,
    task.priority ? `- Prioridade: ${task.priority}` : null,
    task.due_date ? `- Data de vencimento: ${task.due_date}` : null,
    task.category ? `- Categoria: ${task.category}` : null,
    task.time ? `- Horário: ${task.time}` : null,
    `- ID da tarefa: ${task.id}`,
    `- Concluída: ${task.completed ? 'Sim' : 'Não'}`,
    '',
    memory ? `Memória sobre o usuário:\n${memory}` : null,
    '',
    `Regras:`,
    `- Responda sempre em português brasileiro, de forma concisa e amigável.`,
    `- FORMATAÇÃO: Escreva de forma escaneável. Use quebras de linha (\n) para separar ideias. Use bullets (• item) para listar 2 ou mais itens. Use **negrito** para destacar informações-chave. Nunca escreva parágrafos longos — máximo 2 frases por bloco. Confirme ações em 1 linha curta, depois faça perguntas em linhas separadas.`,
    `- Use as ferramentas disponíveis para executar ações quando o usuário pedir.`,
    `- Quando atualizar esta tarefa, use o task_id "${task.id}".`,
    `- PROATIVIDADE: Se a tarefa não tiver descrição ou contexto suficiente, faça 1-2 perguntas ESPECÍFICAS ao tipo da tarefa logo na primeira resposta — nunca perguntas genéricas. Use o bom senso para inferir o que o usuário ainda precisa resolver. Exemplos: limpeza/manutenção → "Você já tem os produtos/equipamentos necessários?"; compras → "Já tem lista dos itens?"; viagem → "Data, destino e quantas pessoas?"; culinária → "Tem todos os ingredientes?"; evento → "Fornecedores confirmados?"; presente → "Tem ideia do que dar?". Adapte ao contexto específico da tarefa.`,
    `- ATUALIZAÇÃO AUTOMÁTICA: Quando o usuário fornecer contexto (data, local, orçamento, com quem, detalhes), use update_task imediatamente para salvar na descrição e nos campos relevantes. Não espere o usuário pedir. Após salvar, confirme brevemente e sugira que o usuário pode editar a descrição diretamente na tarefa (visível ao lado) caso queira ajustar algo.`,
    `- MEMÓRIA (OBRIGATÓRIO): Em TODA resposta, antes de responder, verifique se a mensagem do usuário contém qualquer dado novo sobre ele: nomes de pessoas ou animais ("minha gata Tina", "meu filho Pedro"), relacionamentos, localização, preferências, hábitos, eventos, datas importantes, contexto profissional ou pessoal. Se detectar QUALQUER dado novo — mesmo que nenhuma tarefa seja criada — chame update_memory imediatamente, mesclando com o que já estava salvo. Exemplos de gatilhos: "minha esposa", "meu cachorro Rex", "moro em Campinas", "odeio acordar cedo", "tenho reunião toda segunda". Use a memória existente ativamente nas respostas para personalizar sugestões e contexto.`,
    `- Data/hora atual (fuso do usuário: ${timezone}): ${getDateTimeForTimezone(timezone)}`,
  ];
  return parts.filter(Boolean).join('\n');
}

function buildGeneralModeSystemPrompt(tasks: TaskRow[], memory: string, timezone: string): string {
  const activeTasks = tasks.filter((t) => !t.completed);
  const completedCount = tasks.length - activeTasks.length;

  const taskSummary = activeTasks.length > 0
    ? activeTasks
        .slice(0, 50)
        .map((t) => {
          const parts = [`"${t.title}"`];
          if (t.due_date) parts.push(`vence ${t.due_date}`);
          if (t.priority) parts.push(`prioridade ${t.priority}`);
          if (t.category) parts.push(`cat: ${t.category}`);
          parts.push(`id: ${t.id}`);
          return `  - ${parts.join(' | ')}`;
        })
        .join('\n')
    : '  (nenhuma tarefa ativa)';

  const lines = [
    `Você é o Jarvi, assistente pessoal de produtividade em português brasileiro.`,
    `Personalidade: você age como um amigo próximo que realmente entende o problema do usuário — direto, empático, prático. Não é um bot que só cria tarefas: você raciocina sobre a situação, oferece orientação útil quando faz sentido, e só então organiza as ações necessárias. Use a memória do usuário ativamente para personalizar cada resposta.`,
    ``,
    `Contexto da conta do usuário:`,
    `- ${activeTasks.length} tarefas ativas, ${completedCount} concluídas`,
    `Tarefas ativas:`,
    taskSummary,
    '',
    memory ? `Memória sobre o usuário:\n${memory}` : null,
    '',
    `Regras:`,
    `- Responda sempre em português brasileiro, de forma concisa e amigável.`,
    `- FORMATAÇÃO: Escreva de forma escaneável. Use quebras de linha (\n) para separar ideias. Use bullets (• item) para listar 2 ou mais itens. Use **negrito** para destacar informações-chave. Nunca escreva parágrafos longos — máximo 2 frases por bloco. Confirme ações em 1 linha curta, depois faça perguntas em linhas separadas.`,
    `- Use as ferramentas disponíveis para executar ações quando o usuário pedir.`,
    `- TÍTULO DA TAREFA: Use títulos concisos mas descritivos — devem ter contexto suficiente para que o usuário identifique a tarefa sem precisar abri-la. Inclua o elemento diferenciador (local, pessoa, motivo) quando relevante. Exemplos: prefira "Limpar piscina da casita para hóspedes" a "Limpar a piscina"; prefira "Agendar Airbnb – casamento do Fifi" a "Agendar Airbnb"; prefira "Comprar presente – aniversário da mãe" a "Comprar presente". Evite artigos desnecessários no início. Máximo de ~60 caracteres.`,
    `- CRIAR vs ATUALIZAR (CRÍTICO): Use create_task SEMPRE que o usuário pedir para criar/adicionar/agendar algo novo, mesmo que já exista uma tarefa com título parecido na lista. Tarefas similares são coisas distintas (ex: "Airbnb para casamento do Fifi" e "Airbnb para casamento da Sarah" são duas tarefas diferentes). Só use update_task quando: (a) o usuário pedir explicitamente para editar/atualizar/corrigir uma tarefa existente pelo nome ou ID, OU (b) o usuário estiver respondendo a uma pergunta de contexto que você fez sobre uma tarefa que acabou de ser criada nesta mesma conversa.`,
    `- DADOS DA NOVA TAREFA (CRÍTICO): Ao criar uma tarefa, preencha os campos (due_date, category, priority, description) APENAS com informações explicitamente ditas pelo usuário naquele pedido. NUNCA copie, herde ou reutilize datas, categorias ou detalhes de outras tarefas da lista ou de pedidos anteriores na conversa. Se o usuário não mencionou data, deixe due_date vazio. Se não mencionou categoria, deixe category vazio.`,
    `- DATA DE VENCIMENTO vs DATA DO EVENTO (CRÍTICO): due_date é QUANDO o usuário precisa EXECUTAR/CONCLUIR a tarefa, não quando o evento acontece. Para tarefas que exigem antecedência (reservas de hotel/Airbnb, compra de passagens, planejamento de viagem, encomendas, convites, etc.), calcule um prazo realista ANTERIOR ao evento: reservas de hospedagem → 7 a 14 dias antes; passagens → 14 a 30 dias antes; compras online → 5 a 10 dias antes; outras reservas → 3 a 7 dias antes. Guarde a data real do evento na descrição da tarefa (ex: "Evento: 30/07"). Nunca coloque a data do evento como due_date dessas tarefas.`,
    `- PROATIVIDADE: Após criar a tarefa (depois que a ferramenta retornar), escreva 1-2 perguntas de contexto ESPECÍFICAS ao tipo da tarefa — nunca perguntas genéricas. Não escreva nada antes de chamar a ferramenta. Exemplos por tipo: limpeza/manutenção → "Você já tem os produtos/equipamentos necessários?"; compras → "Já tem uma lista dos itens?"; viagem/hospedagem → "Qual a data, destino e quantas pessoas vão?"; culinária/receita → "Tem todos os ingredientes em casa?"; evento/festa → "Já tem fornecedores confirmados?"; saúde/consulta → "Tem plano de saúde ou vai particular?"; presente → "Tem ideia do que dar?". Adapte sempre ao contexto específico.`,
    `- ATUALIZAÇÃO AUTOMÁTICA: Quando o usuário responder com contexto sobre a tarefa recém-criada nesta conversa, use update_task para salvar as informações na descrição e nos campos relevantes (due_date, priority, category). Após salvar, mencione brevemente que a tarefa foi atualizada e que o usuário pode clicar nela para ver os detalhes completos ou editar mais.`,
    `- CRIAR TAREFA IMEDIATAMENTE: Quando o usuário usar expressões de necessidade ou intenção ("preciso", "quero", "tenho que", "vou", "lembra de", "agenda", "marca", "compra", "faz", "resolve"), crie a tarefa na hora — não peça confirmação. NÃO escreva nada antes de chamar a ferramenta. Após a criação ser confirmada, escreva 1-2 perguntas de contexto específicas para enriquecer a tarefa (urgência, local, data, detalhes relevantes ao tipo).`,
    `- CONSELHO vs TAREFA: Só responda sem criar tarefa quando a mensagem for puramente uma dúvida, pedido de informação ou desabafo sem ação implícita (ex: "o que você acha de X?", "como funciona Y?"). Se houver qualquer intenção de fazer/resolver algo, crie a tarefa.`,
    `- MEMÓRIA (OBRIGATÓRIO): Em TODA resposta, antes de responder, verifique se a mensagem do usuário contém qualquer dado novo sobre ele: nomes de pessoas ou animais ("minha gata Tina", "meu filho Pedro"), relacionamentos, localização, preferências, hábitos, eventos, datas importantes, contexto profissional ou pessoal. Se detectar QUALQUER dado novo — mesmo que nenhuma tarefa seja criada — chame update_memory imediatamente, mesclando com o que já estava salvo. Exemplos de gatilhos: "minha esposa", "meu cachorro Rex", "moro em Campinas", "odeio acordar cedo", "tenho reunião toda segunda". Use a memória existente ativamente nas respostas para personalizar sugestões e contexto.`,
    `- Data/hora atual (fuso do usuário: ${timezone}): ${getDateTimeForTimezone(timezone)}`,
  ];
  return lines.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Main streaming chat function
// ---------------------------------------------------------------------------

export async function streamChat(
  userId: string,
  userName: string,
  messages: ChatMessage[],
  mode: 'task' | 'general',
  taskId: string | undefined,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  const anthropic = getAnthropicClient();

  const [rawMemory, timezone] = await Promise.all([
    getUserMemory(userId),
    getUserTimezone(userId),
  ]);

  // Reconcile memory once per day: update stale/transient info based on current task state
  let memory = rawMemory;
  if (await needsReconciliation(userId)) {
    try {
      memory = await reconcileMemory(userId, rawMemory, timezone);
      if (memory !== rawMemory) {
        await executeToolCall('update_memory', { summary: memory }, userId);
      }
      await markReconciled(userId);
    } catch {
      memory = rawMemory;
    }
  }

  let systemPrompt: string;

  if (mode === 'task' && taskId) {
    const task = await getTaskById(taskId, userId);
    if (!task) {
      onEvent({ type: 'error', message: 'Tarefa não encontrada' });
      onEvent({ type: 'done' });
      return;
    }
    systemPrompt = buildTaskModeSystemPrompt(task, memory, timezone);
  } else {
    const tasks = await getUserTasks(userId);
    systemPrompt = buildGeneralModeSystemPrompt(tasks, memory, timezone);
  }

  // Anthropic uses a separate system param; messages must not contain system role
  const anthropicMessages: Anthropic.MessageParam[] = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const anthropicTools = toAnthropicTools(AI_TOOLS);

  // Recursive streaming function using Anthropic format
  const processStreamAnthropic = async (msgs: Anthropic.MessageParam[]): Promise<void> => {
    // Accumulate tool inputs across streaming deltas
    const pendingToolUses: Map<number, { id: string; name: string; inputJson: string }> = new Map();
    let textContent = '';

    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5',
      system: systemPrompt,
      messages: msgs,
      tools: anthropicTools,
      max_tokens: 4096,
    });

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start':
          if (event.content_block.type === 'tool_use') {
            pendingToolUses.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              inputJson: '',
            });
          }
          break;

        case 'content_block_delta':
          if (event.delta.type === 'text_delta') {
            textContent += event.delta.text;
            onEvent({ type: 'text', content: event.delta.text });
          } else if (event.delta.type === 'input_json_delta') {
            const existing = pendingToolUses.get(event.index);
            if (existing) existing.inputJson += event.delta.partial_json;
          }
          break;

        case 'message_delta':
          if (event.delta.stop_reason === 'tool_use') {
            // Build the assistant message with all content blocks
            const contentBlocks: Anthropic.ContentBlock[] = [];

            if (textContent) {
              contentBlocks.push({ type: 'text', text: textContent } as unknown as Anthropic.ContentBlock);
            }

            for (const tu of pendingToolUses.values()) {
              let input: Record<string, unknown> = {};
              try {
                input = JSON.parse(tu.inputJson || '{}');
              } catch {
                input = {};
              }
              contentBlocks.push({
                type: 'tool_use',
                id: tu.id,
                name: tu.name,
                input,
              } as unknown as Anthropic.ContentBlock);
            }

            msgs.push({ role: 'assistant', content: contentBlocks });

            // Execute each tool and collect results
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const tu of pendingToolUses.values()) {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(tu.inputJson || '{}');
              } catch {
                args = {};
              }

              onEvent({ type: 'tool_call', toolName: tu.name, toolArgs: args });

              const result = await executeToolCall(tu.name, args, userId);
              onEvent({
                type: 'tool_result',
                toolName: tu.name,
                success: result.success,
                data: result.data,
              });

              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: JSON.stringify(result),
              });
            }

            // Tool results go back as a user message in Anthropic
            msgs.push({ role: 'user', content: toolResults });

            onEvent({ type: 'separator' });
            await processStreamAnthropic(msgs);
          }
          break;
      }
    }
  };

  try {
    await processStreamAnthropic(anthropicMessages);
    onEvent({ type: 'done' });
  } catch (err: any) {
    console.error('AI Chat stream error:', err);
    onEvent({ type: 'error', message: err?.message || 'Erro ao processar resposta da IA' });
    onEvent({ type: 'done' });
  }
}
