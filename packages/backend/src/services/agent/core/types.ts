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
  due_date?: string | Date | null;
  time?: string | Date | null;
  recurrence_type?: string | null;
  recurrence_config?: string | null;
  recurrence_until?: string | null;
  created_at: string | Date;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set(key: string, value: string, ...args: any[]): Promise<any>;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export type ToolName =
  | 'create_task'
  | 'update_task'
  | 'complete_task'
  | 'delete_task'
  | 'search_tasks'
  | 'update_memory'
  | 'create_list'
  | 'update_list'
  | 'delete_list'
  | 'show_list'
  | 'create_category'
  | 'update_category'
  | 'delete_category'
  | 'show_category'
  | 'scan_gmail'
  | 'search_web'
  | 'offer_choices'
  | 'complete_onboarding_journey';

export interface ToolExecutionResult {
  success: boolean;
  data?: Record<string, unknown>;
  message?: string;
  /**
   * Stable, machine-readable failure reason (e.g. `not_found`,
   * `invalid_arguments`). Present only when `success === false`.
   */
  error_code?: string;
  /**
   * Fields the executor actually wrote, as persisted (post-normalization).
   * Only set by write tools; read tools leave it undefined. This is what the
   * backend confirmation echoes — never the model's own arguments.
   */
  changes?: Record<string, unknown>;
  /**
   * Field-level notes the executor wants surfaced to the model and to the
   * operations record: arguments it ignored, corrected or held back (e.g. a
   * guessed due_date dropped because "semana que vem" needs a concrete day).
   */
  notes?: string[];
  /** Question the backend will ask the user before a held-back field can be written. */
  pending_question?: AgentPendingQuestion;
  /** Affected entity, for the operations record / confirmations. */
  entity?: AgentOperationEntity;
  /** Nothing new was written because an identical task already existed. */
  duplicate?: boolean;
  /** Update ran but no field changed. */
  unchanged?: boolean;
}

// ---------------------------------------------------------------------------
// Operations record — what the run ACTUALLY did (source of truth for
// confirmations; the model's text never is)
// ---------------------------------------------------------------------------

export type AgentOperationKind = 'write' | 'read';

export type AgentOperationEntityType = 'task' | 'list' | 'category' | 'memory' | 'gmail';

export interface AgentOperationEntity {
  type: AgentOperationEntityType;
  id?: string;
  title?: string;
}

/**
 * A question the backend decided the user must answer before a field can be
 * written (e.g. "semana que vem" without a weekday → which day?). Emitted to
 * the user by the channel adapter, separately from the confirmation.
 */
export interface AgentPendingQuestion {
  field: 'due_date';
  reason: 'period_needs_day';
  /** The exact expression the user wrote that triggered the question. */
  expression: string;
  /** Ready-to-send question text in Jarvi's voice. */
  text: string;
}

export interface AgentOperation {
  /** Tool name as the model requested it. */
  tool: ToolName | string;
  kind: AgentOperationKind;
  /** Parsed arguments as sent by the model (after JSON parsing, before validation). */
  args: Record<string, unknown>;
  success: boolean;
  /** Structured failure reason when `success === false`. */
  error?: { code: string; message: string };
  entity?: AgentOperationEntity;
  /** Values effectively persisted by this operation (write tools only). */
  persisted?: Record<string, unknown>;
  /** True when a create_task was suppressed by the dedup window (nothing new was written). */
  duplicate?: boolean;
  /** True when an update ran but no field changed (e.g. every arg was ignored). */
  unchanged?: boolean;
  /** Executor notes (ignored/corrected/held-back fields). */
  notes?: string[];
  pendingQuestion?: AgentPendingQuestion;
  /** Zero-based run-loop iteration in which the tool ran. */
  iteration: number;
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
  systemPromptExtras?: (ctx: AgentContext, profile: ChannelProfile) => string | null;
  /**
   * Entrega 1 — execução confiável (see `flags.ts`). When true:
   *  - tool arguments are validated server-side against the tool schema;
   *  - confirmations are generated by the backend from the operations record;
   *  - the model's own confirmation claims are held back / stripped;
   *  - the `tool_choice=required` retry is NOT used as a text fix;
   *  - ambiguous date periods ("semana que vem") never become a due_date.
   * Adapters resolve this per user from the feature flag; defaults to false.
   */
  reliableExecution?: boolean;
}

// ---------------------------------------------------------------------------
// Agent context (per-turn data the prompt builder + tool executors need)
// ---------------------------------------------------------------------------

export interface AgentContext {
  userId: string;
  /** PostHog distinct_id — the user's email. Optional so tests can omit it. */
  email?: string;
  /** User's display name for personalization (first name only). */
  preferredName: string;
  /** IANA timezone, e.g. America/Sao_Paulo. */
  timezone: string;
  /** Current persisted memory text. May be empty. */
  memory: string;
  /** Active tasks (capped) used to render the prompt's rich slice + index. */
  activeTasks: TaskRow[];
  /**
   * Total number of active tasks for this user. May exceed `activeTasks.length`
   * when the user has more active tasks than the fetch cap; used for the header
   * count and the "...e mais N" overflow note. Defaults to `activeTasks.length`.
   */
  activeTaskCount?: number;
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
  /**
   * True while the post-wizard first-tasks chat is still open
   * (`onboarding_completed_at` set, `onboarding_journey_completed_at` null).
   */
  onboardingJourneyPending?: boolean;
  /** True when the user has a verified WhatsApp number on the account. */
  whatsappVerified?: boolean;
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
  /** Streaming reasoning delta (models that expose `reasoning_content` in the chunk). */
  onReasoning?: (delta: string) => void;
  /** Human-readable progress while the agent is working (web SSE status events). */
  onStatus?: (message: string) => void;
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
  /**
   * Final assistant text after all tool iterations.
   *
   * With `profile.reliableExecution`, this is the COMPOSED text: backend
   * confirmations (from `operations`) + pending questions + the model's text
   * with confirmation claims stripped. Without the flag it is the raw model
   * text, as before.
   */
  text: string;
  /**
   * Names of every tool invoked across iterations (successful or not).
   * @deprecated Kept for compatibility — prefer `operations`.
   */
  toolCallNames: string[];
  /** Ordered record of every tool the run executed and what it persisted. */
  operations: AgentOperation[];
  /** Token usage aggregated across every OpenAI call made within this run. */
  usage: AgentTurnUsage;
  /** PostHog AI observability trace id for this run (one per user turn). */
  traceId: string;
  /** Reliability signals for telemetry (only meaningful with `reliableExecution`). */
  reliability: AgentRunReliability;
}

export interface AgentRunReliability {
  /** Whether the reliable-execution path ran for this turn. */
  enabled: boolean;
  /** Model sentences dropped because they claimed a write the record doesn't back. */
  claimsStripped: number;
  /** Tool calls rejected by server-side argument validation (no write happened). */
  invalidToolCalls: number;
  /** due_date values the backend corrected or held back. */
  dateCorrections: number;
  /** Continuity questions the backend emitted (e.g. "qual dia da semana que vem?"). */
  pendingQuestions: number;
  /** ms from run start until the first user-visible text was emitted (stream only). */
  timeToFirstTextMs?: number;
}

// ---------------------------------------------------------------------------
// Cost telemetry
// ---------------------------------------------------------------------------

export interface AgentTurnUsage {
  inputTokens: number;
  outputTokens: number;
  /** Portion of inputTokens served from OpenAI's automatic prompt cache. */
  cachedTokens: number;
  /** Number of OpenAI API calls made within this runAgent() invocation. */
  apiCalls: number;
}
