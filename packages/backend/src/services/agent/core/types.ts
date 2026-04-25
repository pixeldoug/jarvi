/**
 * Core types for the unified agent.
 *
 * Both the WhatsApp adapter and the Web adapter operate against the same
 * `runAgent` core; the only thing that varies between them is the
 * `ChannelProfile` they inject and the way they translate `AgentEvent`s
 * into their respective transports (WhatsApp = single string,
 * Web = SSE stream).
 */

// ---------------------------------------------------------------------------
// Domain rows
// ---------------------------------------------------------------------------

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

export interface ListRow {
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

export interface CategoryRow {
  id: string;
  user_id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  visible?: number | null;
  position?: number | null;
}

// ---------------------------------------------------------------------------
// Conversation / messaging
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Duck-typed Redis interface — accepts both ioredis Redis and Cluster instances.
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: 'EX', time: number): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export type ToolName =
  | 'create_task'
  | 'update_task'
  | 'complete_task'
  | 'delete_task'
  | 'update_memory'
  | 'create_list'
  | 'update_list'
  | 'delete_list'
  | 'show_list'
  | 'create_category'
  | 'update_category'
  | 'delete_category'
  | 'show_category'
  | 'scan_gmail';

export interface ToolExecutionResult {
  success: boolean;
  data?: Record<string, unknown>;
  message?: string;
}

// ---------------------------------------------------------------------------
// Channel profile
// ---------------------------------------------------------------------------

export interface ChannelProfile {
  id: 'whatsapp' | 'web';
  /** Where create_task writes — direct insert vs awaiting-approval queue. */
  taskCreationTarget: 'tasks' | 'pending_tasks';
  /** Subset of AI_TOOLS this channel exposes to the model. */
  toolsAvailable: ToolName[];
  outputFormat: 'plain' | 'markdown';
  /** Whether to consume the OpenAI stream token-by-token (web) or take the final message (WhatsApp). */
  transport: 'single' | 'stream';
  /** Briefing diário ("oi", "bom dia") format with greeting + Prioridades section. */
  enableBriefing: boolean;
  /** Daily memory reconciliation against task state (web only currently). */
  enableMemoryReconciliation: boolean;
  /** Two-minute create_task dedup window. */
  enableDedup: boolean;
  /** Retry with tool_choice:'required' when assistant claims creation without calling a tool. */
  enableAntiHallucinationRetry: boolean;
  /** Whether modo `task` (chat escopado em uma tarefa) is supported. */
  supportsTaskMode: boolean;
  /** Channel-specific extra rules appended to the system prompt. */
  systemPromptExtras?: (ctx: AgentContext) => string | null;
}

// ---------------------------------------------------------------------------
// Agent context (per-turn data the prompt builder + tool executors need)
// ---------------------------------------------------------------------------

export interface AgentContext {
  userId: string;
  /** User's display name for personalization (first name only). */
  preferredName: string;
  /** IANA timezone, e.g. America/Sao_Paulo. */
  timezone: string;
  /** Current persisted memory text. May be empty. */
  memory: string;
  /** Active tasks (max 50) used to render the prompt. */
  activeTasks: TaskRow[];
  /** Count of completed tasks for the prompt header. */
  completedTaskCount: number;
  /** User's saved filter lists (web only — empty for WhatsApp). */
  lists: ListRow[];
  /** User's categories (web only — empty for WhatsApp). */
  categories: CategoryRow[];
  /** Mode for web: 'task' = chat scoped to a single task, 'general' = default. */
  mode: 'general' | 'task';
  /** When mode === 'task', the focused task. */
  focusedTask?: TaskRow;
  /** Original user message text (used by some tool executors for trace context). */
  originalUserMessage?: string;
  /** Channel-specific metadata (e.g. WhatsApp phone / message SID). */
  whatsappPhone?: string;
  whatsappMessageSid?: string;
}

// ---------------------------------------------------------------------------
// Run-loop callbacks (the adapter pipes these to its transport)
// ---------------------------------------------------------------------------

export interface AgentCallbacks {
  /** Streaming text delta. Web pipes to SSE; WhatsApp ignores (uses final text instead). */
  onText?: (delta: string) => void;
  /** Fired when the model decides to call a tool (before execution). */
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  /** Fired after a tool finishes executing. */
  onToolResult?: (
    name: string,
    success: boolean,
    data?: Record<string, unknown>,
  ) => void;
  /** Fired between tool results and the next assistant turn (UI separator). */
  onSeparator?: () => void;
}

export interface AgentRunResult {
  /** Final assistant text after all tool iterations. */
  text: string;
  /** Names of every tool successfully invoked across iterations. */
  toolCallNames: string[];
}
