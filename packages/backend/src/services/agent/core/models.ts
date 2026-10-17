/**
 * Which OpenAI model each agent call uses.
 *
 * Production default is gpt-6-sol (Chat Completions + tools). gpt-6.1-sol
 * cannot use function tools on /v1/chat/completions: it rejects
 * `reasoning_effort: 'none'` and requires 'none' to call tools on that API.
 * Mapping it here keeps AGENT_MODEL=gpt-6.1-sol from taking the chat down.
 *
 * Env:
 *   AGENT_MODEL                  default gpt-6-sol
 *   AGENT_FALLBACK_MODEL         default gpt-5.4-mini (after the monthly cap)
 *   MEMORY_MODEL                 default gpt-6-luna
 *   AGENT_PREMIUM_TURNS_PER_MONTH  default 30; 0 disables the cap
 */

export const DEFAULT_AGENT_MODEL = 'gpt-6-sol';
export const DEFAULT_AGENT_FALLBACK_MODEL = 'gpt-5.4-mini';
export const DEFAULT_MEMORY_MODEL = 'gpt-6-luna';
export const DEFAULT_PREMIUM_TURNS_PER_MONTH = 30;

/** Models that cannot call tools on Chat Completions (need /v1/responses). */
const CHAT_COMPLETIONS_TOOLS_UNSUPPORTED: Record<string, string> = {
  'gpt-6.1-sol': 'gpt-6-sol',
  'gpt-6-astra': 'gpt-6-sol',
};

function envOr(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function resolveChatCompletionsAgentModel(requested: string): string {
  const model = requested.trim() || DEFAULT_AGENT_MODEL;
  const replacement = CHAT_COMPLETIONS_TOOLS_UNSUPPORTED[model];
  if (!replacement) return model;
  console.warn(
    `[agent] ${model} cannot use function tools on /v1/chat/completions; using ${replacement}`,
  );
  return replacement;
}

export function getConfiguredAgentModel(): string {
  return resolveChatCompletionsAgentModel(envOr('AGENT_MODEL', DEFAULT_AGENT_MODEL));
}

export function getAgentFallbackModel(): string {
  return resolveChatCompletionsAgentModel(
    envOr('AGENT_FALLBACK_MODEL', DEFAULT_AGENT_FALLBACK_MODEL),
  );
}

export function getMemoryModel(): string {
  return envOr('MEMORY_MODEL', DEFAULT_MEMORY_MODEL);
}

/**
 * Extra Chat Completions params the model needs so tools work.
 * GPT-6 sol/luna default to reasoning; tools on this API require `none`.
 */
export function chatCompletionsSamplingParams(model: string): {
  reasoning_effort?: 'none';
} {
  if (model === 'gpt-6-sol' || model.startsWith('gpt-6-sol-')) {
    return { reasoning_effort: 'none' };
  }
  if (model === 'gpt-6-luna' || model.startsWith('gpt-6-luna-')) {
    return { reasoning_effort: 'none' };
  }
  return {};
}

/** null = cap disabled. */
export function getPremiumTurnLimit(): number | null {
  const raw = process.env.AGENT_PREMIUM_TURNS_PER_MONTH;
  if (raw === undefined || raw.trim() === '') return DEFAULT_PREMIUM_TURNS_PER_MONTH;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}
