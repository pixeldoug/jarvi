import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { v4 as uuidv4 } from 'uuid';
import { getGmailTokens, fetchRecentEmails, markEmailsAsProcessed } from './gmailService';
import { analyzeEmails } from './gmailAnalysisService';
import { hasIO, getIO } from '../utils/ioManager';

// ---------------------------------------------------------------------------
// Provider client
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

// Primary model for the streaming chat agent (conversational + tool calling)
const CHAT_MODEL = 'gpt-5.4-mini';
// Cheaper model used for memory reconciliation and extraction
const MEMORY_MODEL = 'gpt-4o-mini';


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
  {
    type: 'function',
    function: {
      name: 'create_list',
      description: 'Cria um filtro personalizado (lista) para agrupar tarefas. Requer ao menos um critério: categorias, prioridade ou app conectado.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome da lista/filtro' },
          description: { type: 'string', description: 'Descrição opcional' },
          category_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nomes das categorias incluídas neste filtro',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Filtrar por prioridade',
          },
          connected_app: {
            type: 'string',
            enum: ['whatsapp'],
            description: 'Filtrar por app de origem',
          },
          show_completed: {
            type: 'boolean',
            description: 'Se false, oculta tarefas concluídas. Padrão: true',
          },
          filter_no_category: {
            type: 'boolean',
            description: 'Se true, mostra apenas tarefas SEM categoria atribuída',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_list',
      description: 'Atualiza um filtro/lista existente do usuário.',
      parameters: {
        type: 'object',
        properties: {
          list_id: { type: 'string', description: 'ID da lista a atualizar' },
          name: { type: 'string', description: 'Novo nome' },
          description: { type: 'string', description: 'Nova descrição' },
          category_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nova lista de categorias',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Novo filtro de prioridade (null para remover)',
          },
          connected_app: {
            type: 'string',
            enum: ['whatsapp'],
            description: 'Novo filtro de app (null para remover)',
          },
          show_completed: {
            type: 'boolean',
            description: 'Mostrar ou ocultar tarefas concluídas',
          },
          filter_no_category: {
            type: 'boolean',
            description: 'Se true, mostra apenas tarefas sem categoria',
          },
        },
        required: ['list_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_list',
      description: 'Exclui um filtro/lista do usuário.',
      parameters: {
        type: 'object',
        properties: {
          list_id: { type: 'string', description: 'ID da lista a excluir' },
        },
        required: ['list_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_list',
      description: 'Exibe um filtro/lista existente como artefato clicável no chat, para que o usuário possa navegar até ele com um clique. Use sempre que mencionar ou recomendar uma lista existente.',
      parameters: {
        type: 'object',
        properties: {
          list_id: { type: 'string', description: 'ID da lista a exibir' },
        },
        required: ['list_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_category',
      description: 'Cria uma nova categoria para organizar as tarefas do usuário.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome da categoria' },
          color: { type: 'string', description: 'Cor em hex (ex: #FF5733)' },
          icon: { type: 'string', description: 'Ícone da categoria' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_category',
      description: 'Atualiza uma categoria existente. Renomear propaga automaticamente para todas as tarefas e listas.',
      parameters: {
        type: 'object',
        properties: {
          category_id: { type: 'string', description: 'ID da categoria a atualizar' },
          name: { type: 'string', description: 'Novo nome' },
          color: { type: 'string', description: 'Nova cor em hex' },
          icon: { type: 'string', description: 'Novo ícone' },
          visible: { type: 'boolean', description: 'Visível na sidebar' },
        },
        required: ['category_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_category',
      description: 'Exclui uma categoria. As tarefas que pertenciam a ela ficam sem categoria.',
      parameters: {
        type: 'object',
        properties: {
          category_id: { type: 'string', description: 'ID da categoria a excluir' },
        },
        required: ['category_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_category',
      description: 'Exibe uma categoria existente como artefato clicável no chat. Use sempre que mencionar ou recomendar uma categoria existente.',
      parameters: {
        type: 'object',
        properties: {
          category_id: { type: 'string', description: 'ID da categoria a exibir' },
        },
        required: ['category_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scan_gmail',
      description: 'Analisa os emails recentes do Gmail do usuário e cria sugestões de tarefas para emails que requerem ação. Use quando o usuário pedir para verificar o Gmail, checar emails, ver se tem algo no email, ou qualquer variação disso.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

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
// DB helpers — lists & categories
// ---------------------------------------------------------------------------

interface ListRow {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  category_names: string;
  priority?: string | null;
  connected_app?: string | null;
  show_completed?: number | null;
  filter_no_category?: number | null;
}

interface CategoryRow {
  id: string;
  user_id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  visible?: number | null;
  position?: number | null;
}

function safeParseCategoryNames(raw: unknown): string[] {
  if (Array.isArray(raw) && (raw as unknown[]).every((x) => typeof x === 'string')) return raw as string[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && (parsed as unknown[]).every((x) => typeof x === 'string')) return parsed as string[];
    } catch { return []; }
  }
  return [];
}

async function getUserLists(userId: string): Promise<ListRow[]> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      'SELECT * FROM lists WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return result.rows as ListRow[];
  }
  return (await getDatabase().all<ListRow[]>('SELECT * FROM lists WHERE user_id = ? ORDER BY created_at DESC', [userId])) as ListRow[];
}

async function getUserCategories(userId: string): Promise<CategoryRow[]> {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      'SELECT * FROM categories WHERE user_id = $1 ORDER BY position ASC, name ASC',
      [userId],
    );
    return result.rows as CategoryRow[];
  }
  return (await getDatabase().all<CategoryRow[]>('SELECT * FROM categories WHERE user_id = ? ORDER BY position ASC, name ASC', [userId])) as CategoryRow[];
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

    case 'create_list': {
      const listName = String(args.name || '').trim();
      if (!listName) return { success: false, message: 'Nome da lista é obrigatório' };

      const categoryNames = Array.isArray(args.category_names)
        ? (args.category_names as string[]).map(String).filter(Boolean)
        : [];
      const priority = args.priority ? String(args.priority) : null;
      const connectedApp = args.connected_app ? String(args.connected_app) : null;
      const showCompleted = args.show_completed === false ? 0 : 1;
      const filterNoCategory = args.filter_no_category ? 1 : 0;

      if (categoryNames.length === 0 && !priority && !connectedApp && !filterNoCategory) {
        return { success: false, message: 'Ao menos um critério de filtro é necessário (categoria, prioridade, app conectado ou sem categoria)' };
      }

      const listId = uuidv4();
      const categoryNamesJson = JSON.stringify(categoryNames);

      if (isPostgreSQL()) {
        await getPool().query(
          `INSERT INTO lists (id, user_id, name, category_names, priority, connected_app, show_completed, filter_no_category, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [listId, userId, listName, categoryNamesJson, priority, connectedApp, showCompleted, filterNoCategory, now, now],
        );
      } else {
        await getDatabase().run(
          `INSERT INTO lists (id, user_id, name, category_names, priority, connected_app, show_completed, filter_no_category, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [listId, userId, listName, categoryNamesJson, priority, connectedApp, showCompleted, filterNoCategory, now, now],
        );
      }

      return {
        success: true,
        data: { id: listId, name: listName, category_names: categoryNames, priority, connected_app: connectedApp, show_completed: showCompleted === 1, filter_no_category: filterNoCategory === 1 },
      };
    }

    case 'update_list': {
      const listId = String(args.list_id || '');
      if (!listId) return { success: false, message: 'list_id é obrigatório' };

      let existing: ListRow | null = null;
      if (isPostgreSQL()) {
        const result = await getPool().query('SELECT * FROM lists WHERE id = $1 AND user_id = $2', [listId, userId]);
        existing = result.rows[0] || null;
      } else {
        existing = await getDatabase().get<ListRow>('SELECT * FROM lists WHERE id = ? AND user_id = ?', [listId, userId]) || null;
      }
      if (!existing) return { success: false, message: 'Lista não encontrada' };

      const newName = args.name ? String(args.name).trim() : existing.name;
      const newCategoryNames = Array.isArray(args.category_names)
        ? JSON.stringify((args.category_names as string[]).map(String).filter(Boolean))
        : existing.category_names;
      const newPriority = args.priority !== undefined ? (args.priority ? String(args.priority) : null) : existing.priority;
      const newConnectedApp = args.connected_app !== undefined ? (args.connected_app ? String(args.connected_app) : null) : existing.connected_app;
      const newShowCompleted = args.show_completed !== undefined ? (args.show_completed ? 1 : 0) : (existing.show_completed ?? 1);
      const newFilterNoCategory = args.filter_no_category !== undefined ? (args.filter_no_category ? 1 : 0) : (existing.filter_no_category ?? 0);

      if (isPostgreSQL()) {
        await getPool().query(
          `UPDATE lists SET name=$1, category_names=$2, priority=$3, connected_app=$4, show_completed=$5, filter_no_category=$6, updated_at=$7
           WHERE id=$8 AND user_id=$9`,
          [newName, newCategoryNames, newPriority, newConnectedApp, newShowCompleted, newFilterNoCategory, now, listId, userId],
        );
      } else {
        await getDatabase().run(
          `UPDATE lists SET name=?, category_names=?, priority=?, connected_app=?, show_completed=?, filter_no_category=?, updated_at=?
           WHERE id=? AND user_id=?`,
          [newName, newCategoryNames, newPriority, newConnectedApp, newShowCompleted, newFilterNoCategory, now, listId, userId],
        );
      }

      return {
        success: true,
        data: { id: listId, name: newName, priority: newPriority, connected_app: newConnectedApp, show_completed: newShowCompleted === 1, filter_no_category: newFilterNoCategory === 1 },
      };
    }

    case 'delete_list': {
      const listId = String(args.list_id || '');
      if (!listId) return { success: false, message: 'list_id é obrigatório' };

      if (isPostgreSQL()) {
        await getPool().query('DELETE FROM lists WHERE id = $1 AND user_id = $2', [listId, userId]);
      } else {
        await getDatabase().run('DELETE FROM lists WHERE id = ? AND user_id = ?', [listId, userId]);
      }
      return { success: true, data: { id: listId, deleted: true } };
    }

    case 'show_list': {
      const listId = String(args.list_id || '');
      if (!listId) return { success: false, message: 'list_id é obrigatório' };

      let row: ListRow | null = null;
      if (isPostgreSQL()) {
        const result = await getPool().query('SELECT * FROM lists WHERE id = $1 AND user_id = $2', [listId, userId]);
        row = result.rows[0] || null;
      } else {
        row = await getDatabase().get<ListRow>('SELECT * FROM lists WHERE id = ? AND user_id = ?', [listId, userId]) || null;
      }
      if (!row) return { success: false, message: 'Lista não encontrada' };

      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          category_names: safeParseCategoryNames(row.category_names),
          priority: row.priority ?? null,
          connected_app: row.connected_app ?? null,
          show_completed: row.show_completed !== 0,
          filter_no_category: Boolean(row.filter_no_category),
        },
      };
    }

    case 'create_category': {
      const categoryName = String(args.name || '').trim();
      if (!categoryName) return { success: false, message: 'Nome da categoria é obrigatório' };

      const color = args.color ? String(args.color) : null;
      const icon = args.icon ? String(args.icon) : null;
      const categoryId = uuidv4();

      let position = 0;
      if (isPostgreSQL()) {
        const posResult = await getPool().query(
          'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM categories WHERE user_id = $1',
          [userId],
        );
        position = posResult.rows[0]?.next_pos ?? 0;
        await getPool().query(
          `INSERT INTO categories (id, user_id, name, color, icon, position, visible, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8)`,
          [categoryId, userId, categoryName, color, icon, position, now, now],
        );
      } else {
        const posResult = await getDatabase().get<{ next_pos: number }>(
          'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM categories WHERE user_id = ?',
          [userId],
        );
        position = posResult?.next_pos ?? 0;
        await getDatabase().run(
          `INSERT INTO categories (id, user_id, name, color, icon, position, visible, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [categoryId, userId, categoryName, color, icon, position, now, now],
        );
      }

      return { success: true, data: { id: categoryId, name: categoryName, color, icon } };
    }

    case 'update_category': {
      const categoryId = String(args.category_id || '');
      if (!categoryId) return { success: false, message: 'category_id é obrigatório' };

      let existing: CategoryRow | null = null;
      if (isPostgreSQL()) {
        const result = await getPool().query('SELECT * FROM categories WHERE id = $1 AND user_id = $2', [categoryId, userId]);
        existing = result.rows[0] || null;
      } else {
        existing = await getDatabase().get<CategoryRow>('SELECT * FROM categories WHERE id = ? AND user_id = ?', [categoryId, userId]) || null;
      }
      if (!existing) return { success: false, message: 'Categoria não encontrada' };

      const newName = args.name ? String(args.name).trim() : existing.name;
      const newColor = args.color !== undefined ? (args.color ? String(args.color) : null) : existing.color;
      const newIcon = args.icon !== undefined ? (args.icon ? String(args.icon) : null) : existing.icon;
      const newVisible = args.visible !== undefined ? (args.visible ? 1 : 0) : (existing.visible ?? 1);

      if (isPostgreSQL()) {
        await getPool().query(
          `UPDATE categories SET name=$1, color=$2, icon=$3, visible=$4, updated_at=$5
           WHERE id=$6 AND user_id=$7`,
          [newName, newColor, newIcon, newVisible, now, categoryId, userId],
        );
        // Propagate rename to tasks, notes, and lists
        if (newName !== existing.name) {
          await getPool().query(
            `UPDATE tasks SET category=$1 WHERE user_id=$2 AND category=$3`,
            [newName, userId, existing.name],
          );
          const lists = await getPool().query('SELECT id, category_names FROM lists WHERE user_id = $1', [userId]);
          for (const row of lists.rows) {
            const names = safeParseCategoryNames(row.category_names);
            const idx = names.indexOf(existing.name);
            if (idx !== -1) {
              names[idx] = newName;
              await getPool().query('UPDATE lists SET category_names=$1 WHERE id=$2', [JSON.stringify(names), row.id]);
            }
          }
        }
      } else {
        await getDatabase().run(
          `UPDATE categories SET name=?, color=?, icon=?, visible=?, updated_at=? WHERE id=? AND user_id=?`,
          [newName, newColor, newIcon, newVisible, now, categoryId, userId],
        );
        if (newName !== existing.name) {
          await getDatabase().run(`UPDATE tasks SET category=? WHERE user_id=? AND category=?`, [newName, userId, existing.name]);
          const lists = await getDatabase().all<ListRow[]>('SELECT id, category_names FROM lists WHERE user_id = ?', [userId]);
          for (const row of lists) {
            const names = safeParseCategoryNames(row.category_names);
            const idx = names.indexOf(existing.name);
            if (idx !== -1) {
              names[idx] = newName;
              await getDatabase().run('UPDATE lists SET category_names=? WHERE id=?', [JSON.stringify(names), row.id]);
            }
          }
        }
      }

      return { success: true, data: { id: categoryId, name: newName, color: newColor, icon: newIcon, visible: newVisible === 1 } };
    }

    case 'show_category': {
      const categoryId = String(args.category_id || '');
      if (!categoryId) return { success: false, message: 'category_id é obrigatório' };

      let row: CategoryRow | null = null;
      if (isPostgreSQL()) {
        const result = await getPool().query('SELECT * FROM categories WHERE id = $1 AND user_id = $2', [categoryId, userId]);
        row = result.rows[0] || null;
      } else {
        row = await getDatabase().get<CategoryRow>('SELECT * FROM categories WHERE id = ? AND user_id = ?', [categoryId, userId]) || null;
      }
      if (!row) return { success: false, message: 'Categoria não encontrada' };

      return {
        success: true,
        data: { id: row.id, name: row.name, color: row.color ?? null, icon: row.icon ?? null },
      };
    }

    case 'delete_category': {
      const categoryId = String(args.category_id || '');
      if (!categoryId) return { success: false, message: 'category_id é obrigatório' };

      if (isPostgreSQL()) {
        const result = await getPool().query('SELECT name FROM categories WHERE id = $1 AND user_id = $2', [categoryId, userId]);
        const categoryName = result.rows[0]?.name;
        await getPool().query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [categoryId, userId]);
        if (categoryName) {
          await getPool().query(`UPDATE tasks SET category=NULL WHERE user_id=$1 AND category=$2`, [userId, categoryName]);
          const lists = await getPool().query('SELECT id, category_names FROM lists WHERE user_id = $1', [userId]);
          for (const row of lists.rows) {
            const names = safeParseCategoryNames(row.category_names).filter((n) => n !== categoryName);
            await getPool().query('UPDATE lists SET category_names=$1 WHERE id=$2', [JSON.stringify(names), row.id]);
          }
        }
      } else {
        const row = await getDatabase().get<{ name: string }>('SELECT name FROM categories WHERE id = ? AND user_id = ?', [categoryId, userId]);
        const categoryName = row?.name;
        await getDatabase().run('DELETE FROM categories WHERE id = ? AND user_id = ?', [categoryId, userId]);
        if (categoryName) {
          await getDatabase().run(`UPDATE tasks SET category=NULL WHERE user_id=? AND category=?`, [userId, categoryName]);
          const lists = await getDatabase().all<ListRow[]>('SELECT id, category_names FROM lists WHERE user_id = ?', [userId]);
          for (const listRow of lists) {
            const names = safeParseCategoryNames(listRow.category_names).filter((n) => n !== categoryName);
            await getDatabase().run('UPDATE lists SET category_names=? WHERE id=?', [JSON.stringify(names), listRow.id]);
          }
        }
      }

      return { success: true, data: { id: categoryId, deleted: true } };
    }

    case 'scan_gmail': {
      const tokens = await getGmailTokens(userId);
      if (!tokens) {
        return {
          success: false,
          message: 'Gmail não está conectado. O usuário precisa conectar o Gmail em Configurações → Apps → Gmail.',
        };
      }

      const emails = await fetchRecentEmails(userId);
      if (emails.length === 0) {
        return {
          success: true,
          data: { analyzed: 0, created: 0 },
          message: 'Nenhum email encontrado na caixa de entrada dos últimos 3 dias.',
        };
      }

      const results = await analyzeEmails(emails);
      let created = 0;
      const nowTs = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const createdTitles: string[] = [];
      const successfullyAnalyzedIds: string[] = [];

      for (const { email, suggestion, analyzed } of results) {
        if (analyzed) successfullyAnalyzedIds.push(email.id);
        if (!suggestion.isActionable || !suggestion.title) continue;

        const pendingId = uuidv4();
        const rawContent = `De: ${email.from}\nAssunto: ${email.subject}\nData: ${email.date}\n\n${email.snippet}`;

        if (isPostgreSQL()) {
          const pool = getPool();
          await pool.query(
            `INSERT INTO pending_tasks (
              id, user_id, source, gmail_message_id, raw_content,
              suggested_title, suggested_description, suggested_priority,
              suggested_due_date, suggested_category,
              status, expires_at, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (id) DO NOTHING`,
            [
              pendingId, userId, 'gmail', email.id, rawContent,
              suggestion.title, suggestion.description, suggestion.priority,
              suggestion.due_date, suggestion.category,
              'awaiting_confirmation', expiresAt, nowTs, nowTs,
            ],
          );
        } else {
          const db = getDatabase();
          await db.run(
            `INSERT OR IGNORE INTO pending_tasks (
              id, user_id, source, gmail_message_id, raw_content,
              suggested_title, suggested_description, suggested_priority,
              suggested_due_date, suggested_category,
              status, expires_at, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              pendingId, userId, 'gmail', email.id, rawContent,
              suggestion.title, suggestion.description, suggestion.priority,
              suggestion.due_date, suggestion.category,
              'awaiting_confirmation', expiresAt, nowTs, nowTs,
            ],
          );
        }

        if (hasIO()) {
          getIO().to(`user:${userId}`).emit('pending-task:created', { id: pendingId, source: 'gmail' });
        }

        createdTitles.push(suggestion.title);
        created++;
      }

      // Only mark successfully analyzed emails — failed ones remain eligible for retry
      await markEmailsAsProcessed(userId, successfullyAnalyzedIds);

      return {
        success: true,
        data: { analyzed: emails.length, created, tasks: createdTitles },
      };
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
      model: MEMORY_MODEL,
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
// Post-response memory extraction
// ---------------------------------------------------------------------------

async function extractMemoryPostResponse(
  userId: string,
  messages: ChatMessage[],
  currentMemory: string,
): Promise<void> {
  const userMessages = messages.filter((m) => m.role === 'user');
  const lastUserMsg = userMessages[userMessages.length - 1];
  if (!lastUserMsg || !lastUserMsg.content.trim()) return;

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
          lastUserMsg.content,
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
    await executeToolCall('update_memory', { summary: result }, userId);
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

function buildGeneralModeSystemPrompt(
  tasks: TaskRow[],
  memory: string,
  timezone: string,
  lists: ListRow[] = [],
  categories: CategoryRow[] = [],
): string {
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

  const categorySummary = categories.length > 0
    ? categories.map((c) => `  - "${c.name}" (id: ${c.id})${c.visible === 0 ? ' [oculta]' : ''}`).join('\n')
    : '  (nenhuma categoria)';

  const listSummary = lists.length > 0
    ? lists.map((l) => {
        const catNames = safeParseCategoryNames(l.category_names);
        const parts: string[] = [`"${l.name}" (id: ${l.id})`];
        if (catNames.length > 0) parts.push(`cats: ${catNames.join(', ')}`);
        if (l.priority) parts.push(`prioridade: ${l.priority}`);
        if (l.connected_app) parts.push(`app: ${l.connected_app}`);
        if (l.filter_no_category) parts.push('sem categoria');
        if (l.show_completed === 0) parts.push('oculta concluídas');
        return `  - ${parts.join(' | ')}`;
      }).join('\n')
    : '  (nenhuma lista)';

  const lines = [
    `Você é o Jarvi, assistente pessoal de produtividade em português brasileiro.`,
    `Personalidade: você age como um amigo próximo que realmente entende o problema do usuário — direto, empático, prático. Não é um bot que só cria tarefas: você raciocina sobre a situação, oferece orientação útil quando faz sentido, e só então organiza as ações necessárias. Use a memória do usuário ativamente para personalizar cada resposta.`,
    ``,
    `Contexto da conta do usuário:`,
    `- ${activeTasks.length} tarefas ativas, ${completedCount} concluídas`,
    `Tarefas ativas:`,
    taskSummary,
    '',
    `Categorias existentes:`,
    categorySummary,
    '',
    `Filtros/listas salvos:`,
    listSummary,
    '',
    memory ? `Memória sobre o usuário:\n${memory}` : null,
    '',
    `Regras:`,
    `- Responda sempre em português brasileiro, de forma concisa e amigável.`,
    `- FORMATAÇÃO: Escreva de forma escaneável. Use quebras de linha (\n) para separar ideias. Use bullets (• item) para listar 2 ou mais itens. Use **negrito** para destacar informações-chave. Nunca escreva parágrafos longos — máximo 2 frases por bloco. Confirme ações em 1 linha curta, depois faça perguntas em linhas separadas.`,
    `- Use as ferramentas disponíveis para executar ações quando o usuário pedir.`,
    `- FILTROS/LISTAS (OBRIGATÓRIO): Sempre que criar, atualizar ou mencionar um filtro/lista, chame show_list com o ID correspondente. Isso é o que exibe o artefato clicável no chat — sem show_list, nenhum artefato aparece. NUNCA descreva o filtro só em texto.`,
    `- CATEGORIAS (OBRIGATÓRIO): Sempre que criar, atualizar ou mencionar uma categoria, chame show_category com o ID correspondente. Isso é o que exibe o artefato clicável no chat — sem show_category, nenhum artefato aparece. NUNCA mencione cor, ícone ou detalhes técnicos no texto da resposta.`,
    `- TÍTULO DA TAREFA: Use títulos concisos mas descritivos — devem ter contexto suficiente para que o usuário identifique a tarefa sem precisar abri-la. Inclua o elemento diferenciador (local, pessoa, motivo) quando relevante. Exemplos: prefira "Limpar piscina da casita para hóspedes" a "Limpar a piscina"; prefira "Agendar Airbnb – casamento do Fifi" a "Agendar Airbnb"; prefira "Comprar presente – aniversário da mãe" a "Comprar presente". Evite artigos desnecessários no início. Máximo de ~60 caracteres.`,
    `- CRIAR vs ATUALIZAR (CRÍTICO): Use create_task SEMPRE que o usuário pedir para criar/adicionar/agendar algo novo, mesmo que já exista uma tarefa com título parecido na lista. Tarefas similares são coisas distintas (ex: "Airbnb para casamento do Fifi" e "Airbnb para casamento da Sarah" são duas tarefas diferentes). Só use update_task quando: (a) o usuário pedir explicitamente para editar/atualizar/corrigir uma tarefa existente pelo nome ou ID, OU (b) o usuário estiver respondendo a uma pergunta de contexto que você fez sobre uma tarefa que acabou de ser criada nesta mesma conversa.`,
    `- DADOS DA NOVA TAREFA (CRÍTICO): Ao criar uma tarefa, preencha os campos (due_date, category, priority, description) APENAS com informações explicitamente ditas pelo usuário naquele pedido. NUNCA copie, herde ou reutilize datas, categorias ou detalhes de outras tarefas da lista ou de pedidos anteriores na conversa. Se o usuário não mencionou data, deixe due_date vazio. Se não mencionou categoria, deixe category vazio.`,
    `- DATA DE VENCIMENTO vs DATA DO EVENTO (CRÍTICO): due_date é QUANDO o usuário precisa EXECUTAR/CONCLUIR a tarefa, não quando o evento acontece. Para tarefas que exigem antecedência (reservas de hotel/Airbnb, compra de passagens, planejamento de viagem, encomendas, convites, etc.), calcule um prazo realista ANTERIOR ao evento: reservas de hospedagem → 7 a 14 dias antes; passagens → 14 a 30 dias antes; compras online → 5 a 10 dias antes; outras reservas → 3 a 7 dias antes. Guarde a data real do evento na descrição da tarefa (ex: "Evento: 30/07"). Nunca coloque a data do evento como due_date dessas tarefas.`,
    `- PROATIVIDADE: Após criar a tarefa (depois que a ferramenta retornar), escreva 1-2 perguntas de contexto ESPECÍFICAS ao tipo da tarefa — nunca perguntas genéricas. Não escreva nada antes de chamar a ferramenta. Exemplos por tipo: limpeza/manutenção → "Você já tem os produtos/equipamentos necessários?"; compras → "Já tem uma lista dos itens?"; viagem/hospedagem → "Qual a data, destino e quantas pessoas vão?"; culinária/receita → "Tem todos os ingredientes em casa?"; evento/festa → "Já tem fornecedores confirmados?"; saúde/consulta → "Tem plano de saúde ou vai particular?"; presente → "Tem ideia do que dar?". Adapte sempre ao contexto específico.`,
    `- ATUALIZAÇÃO AUTOMÁTICA: Quando o usuário responder com contexto sobre a tarefa recém-criada nesta conversa, use update_task para salvar as informações na descrição e nos campos relevantes (due_date, priority, category). Após salvar, mencione brevemente que a tarefa foi atualizada e que o usuário pode clicar nela para ver os detalhes completos ou editar mais.`,
    `- CRIAR TAREFA IMEDIATAMENTE: Quando o usuário usar expressões de necessidade ou intenção ("preciso", "quero", "tenho que", "vou", "lembra de", "agenda", "marca", "compra", "faz", "resolve"), crie a tarefa na hora — não peça confirmação. NÃO escreva nada antes de chamar a ferramenta. Após a criação ser confirmada, escreva 1-2 perguntas de contexto específicas para enriquecer a tarefa (urgência, local, data, detalhes relevantes ao tipo).`,
    `- CONSELHO vs TAREFA: Só responda sem criar tarefa quando a mensagem for puramente uma dúvida, pedido de informação ou desabafo sem ação implícita (ex: "o que você acha de X?", "como funciona Y?"). Se houver qualquer intenção de fazer/resolver algo, crie a tarefa.`,
    `- MEMÓRIA (OBRIGATÓRIO): Em TODA resposta, antes de responder, verifique se a mensagem do usuário contém qualquer dado novo sobre ele: nomes de pessoas ou animais ("minha gata Tina", "meu filho Pedro"), relacionamentos, localização, preferências, hábitos, eventos, datas importantes, contexto profissional ou pessoal. Se detectar QUALQUER dado novo — mesmo que nenhuma tarefa seja criada — chame update_memory imediatamente, mesclando com o que já estava salvo. Exemplos de gatilhos: "minha esposa", "meu cachorro Rex", "moro em Campinas", "odeio acordar cedo", "tenho reunião toda segunda". Use a memória existente ativamente nas respostas para personalizar sugestões e contexto.`,
    `- GMAIL (CRÍTICO): Você só verifica emails quando o usuário pedir explicitamente — não existe monitoramento automático, periódico ou em segundo plano. NUNCA sugira, ofereça ou pergunte sobre "monitorar regularmente", "verificar periodicamente" ou qualquer forma de escaneamento automático. Após verificar o Gmail, informe o resultado e pare. Nada de perguntar se o usuário quer monitoramento contínuo.`,
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
  const openai = getOpenAIClient();

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
    const [tasks, lists, categories] = await Promise.all([
      getUserTasks(userId),
      getUserLists(userId),
      getUserCategories(userId),
    ]);
    systemPrompt = buildGeneralModeSystemPrompt(tasks, memory, timezone, lists, categories);
  }

  // OpenAI takes the system as the first message (no separate param).
  // Filter out any system messages from the client payload — we own that slot.
  const initialMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
  ];

  // Recursive streaming function. Accumulates text deltas and tool-call deltas,
  // and when the model finishes with finish_reason='tool_calls', executes all
  // tools and loops until the model returns a plain assistant message.
  const processStreamOpenAI = async (msgs: ChatCompletionMessageParam[]): Promise<void> => {
    const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();
    let textContent = '';
    let finishReason: string | null = null;

    const stream = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: msgs,
      tools: AI_TOOLS,
      stream: true,
      max_completion_tokens: 4096,
    });

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (delta?.content) {
        textContent += delta.content;
        onEvent({ type: 'text', content: delta.content });
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          let existing = pendingToolCalls.get(idx);
          if (!existing) {
            existing = { id: '', name: '', args: '' };
            pendingToolCalls.set(idx, existing);
          }
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
        }
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }

    if (finishReason !== 'tool_calls' || pendingToolCalls.size === 0) return;

    const toolCallsArray = Array.from(pendingToolCalls.values()).filter((tc) => tc.id && tc.name);

    // Push the assistant message with the accumulated tool calls
    msgs.push({
      role: 'assistant',
      content: textContent || null,
      tool_calls: toolCallsArray.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.args || '{}' },
      })),
    });

    // Execute each tool and append the results as 'tool' messages
    const toolResultMessages: ChatCompletionToolMessageParam[] = [];
    for (const tc of toolCallsArray) {
      let args: Record<string, unknown> = {};
      try {
        args = tc.args ? JSON.parse(tc.args) : {};
      } catch {
        args = {};
      }

      onEvent({ type: 'tool_call', toolName: tc.name, toolArgs: args });

      const result = await executeToolCall(tc.name, args, userId);
      onEvent({
        type: 'tool_result',
        toolName: tc.name,
        success: result.success,
        data: result.data,
      });

      toolResultMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }

    msgs.push(...toolResultMessages);

    onEvent({ type: 'separator' });
    await processStreamOpenAI(msgs);
  };

  try {
    await processStreamOpenAI(initialMessages);
    onEvent({ type: 'done' });
  } catch (err: any) {
    console.error('AI Chat stream error:', err);
    onEvent({ type: 'error', message: err?.message || 'Erro ao processar resposta da IA' });
    onEvent({ type: 'done' });
  }

  // Fire-and-forget: extract personal info the model may have missed
  extractMemoryPostResponse(userId, messages, memory).catch((err) => {
    console.error('[Memory extraction] failed:', err);
  });
}
