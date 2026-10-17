import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { z } from 'zod';
import {
  createTask,
  listCategories,
  listTasks,
  McpTaskError,
  readTask,
  removeTask,
  setTaskCompleted,
  updateTask,
} from './tasks';

const hits = new Map<string, { reset: number; count: number }>();

export function allowMcpCall(userId: string): boolean {
  const now = Date.now();
  const current = hits.get(userId);
  if (!current || current.reset < now) {
    hits.set(userId, { reset: now + 60_000, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 120;
}

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof McpTaskError
    ? error.message
    : 'Não foi possível concluir a ação.';
  if (!(error instanceof McpTaskError)) console.error('MCP tool failed', error);
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

function jarviServer(userId: string): McpServer {
  const server = new McpServer({ name: 'jarvi', version: '1.0.0' });

  server.registerTool(
    'list_tasks',
    {
      title: 'Listar tarefas',
      description:
        'Lista tarefas da conta. Por padrão só as pendentes, no máximo 20. Use para ver o que está aberto, filtrar por texto, categoria, prioridade ou período.',
      inputSchema: z.object({
        query: z.string().optional().describe('Texto no título ou na descrição'),
        category: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        due_from: z.string().optional().describe('Data inicial YYYY-MM-DD'),
        due_to: z.string().optional().describe('Data final YYYY-MM-DD'),
        include_completed: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        return textResult(await listTasks(userId, {
          query: args.query,
          category: args.category,
          priority: args.priority,
          dueFrom: args.due_from,
          dueTo: args.due_to,
          includeCompleted: args.include_completed,
          limit: args.limit,
        }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'get_task',
    {
      title: 'Ver tarefa',
      description: 'Devolve uma tarefa da conta, inclusive a descrição.',
      inputSchema: z.object({ task_id: z.string() }),
      annotations: { readOnlyHint: true },
    },
    async ({ task_id }) => {
      try {
        return textResult(await readTask(userId, task_id));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_categories',
    {
      title: 'Listar categorias',
      description: 'Lista as categorias que já existem na conta. Uma tarefa só aceita uma delas.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return textResult(await listCategories(userId));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'create_task',
    {
      title: 'Criar tarefa',
      description:
        'Cria uma tarefa nesta conta. Não envia WhatsApp, não liga e não cria lembrete. Datas em YYYY-MM-DD e horário em HH:MM.',
      inputSchema: z.object({
        title: z.string(),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        due_date: z.string().optional(),
        time: z.string().optional(),
        category: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        return textResult(await createTask(userId, {
          title: args.title,
          description: args.description,
          priority: args.priority,
          dueDate: args.due_date,
          time: args.time,
          category: args.category,
        }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'update_task',
    {
      title: 'Atualizar tarefa',
      description:
        'Atualiza campos de uma tarefa existente. Envie null em due_date, time, category, priority ou description para limpar o campo.',
      inputSchema: z.object({
        task_id: z.string(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
        due_date: z.string().nullable().optional(),
        time: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
      }),
    },
    async (args) => {
      try {
        return textResult(await updateTask(userId, args.task_id, {
          title: args.title,
          description: args.description,
          priority: args.priority,
          dueDate: args.due_date,
          time: args.time,
          category: args.category,
        }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'complete_task',
    {
      title: 'Concluir tarefa',
      description: 'Marca a tarefa como concluída. Se ela for recorrente, a próxima ocorrência é criada como no app.',
      inputSchema: z.object({ task_id: z.string() }),
    },
    async ({ task_id }) => {
      try {
        return textResult(await setTaskCompleted(userId, task_id, true));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'reopen_task',
    {
      title: 'Reabrir tarefa',
      description: 'Marca uma tarefa concluída como pendente de novo.',
      inputSchema: z.object({ task_id: z.string() }),
    },
    async ({ task_id }) => {
      try {
        return textResult(await setTaskCompleted(userId, task_id, false));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'delete_task',
    {
      title: 'Excluir tarefa',
      description: 'Exclui a tarefa de forma permanente. Use só quando a pessoa pedir para apagar.',
      inputSchema: z.object({ task_id: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ task_id }) => {
      try {
        return textResult(await removeTask(userId, task_id));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}

const mcpHandler = createMcpHandler((ctx) => {
  const userId = ctx.authInfo?.extra?.userId;
  if (typeof userId !== 'string' || !userId) {
    throw new Error('MCP request missing principal');
  }
  return jarviServer(userId);
});

export const handleMcpRequest = toNodeHandler(mcpHandler, {
  onerror: (error) => console.error('MCP handler failed', error),
});
