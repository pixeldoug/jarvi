/**
 * AI cost telemetry — emits one `ai_turn_completed` PostHog event per user
 * turn (i.e. per `runWhatsappAgent` / `streamChat` invocation, including any
 * anti-hallucination retry), so token usage can be attributed per user and
 * per subscription plan without depending on OpenAI's own usage dashboard
 * (which has no visibility into which of our end users made which call).
 *
 * distinct_id is the user's email, matching the convention already used by
 * `posthogService` for `user_registered` — this keeps AI usage on the same
 * PostHog person profile as the rest of that user's activity.
 */

import { captureServer } from '../../posthogService';
import { AGENT_MODEL } from './runAgent';
import type { AgentTurnUsage } from './types';

export interface AgentTurnTelemetryInput {
  /** PostHog distinct_id — the user's email (see posthogService convention). */
  email: string;
  channel: 'web' | 'whatsapp';
  /** Raw `users.subscription_status` (e.g. 'active' | 'trialing' | 'none'). */
  subscriptionStatus: string;
  usage: AgentTurnUsage;
  /** Whether the anti-hallucination retry fired during this turn. */
  retried: boolean;
}

export function recordAgentTurnUsage(input: AgentTurnTelemetryInput): void {
  if (!input.email) return;

  captureServer(input.email, 'ai_turn_completed', {
    channel: input.channel,
    model: AGENT_MODEL,
    subscription_status: input.subscriptionStatus,
    input_tokens: input.usage.inputTokens,
    output_tokens: input.usage.outputTokens,
    cached_tokens: input.usage.cachedTokens,
    api_calls: input.usage.apiCalls,
    retried: input.retried,
  });
}

/** Sums usage across multiple `runAgent` invocations (e.g. initial + retry). */
export function sumAgentTurnUsage(usages: AgentTurnUsage[]): AgentTurnUsage {
  return usages.reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
      cachedTokens: acc.cachedTokens + u.cachedTokens,
      apiCalls: acc.apiCalls + u.apiCalls,
    }),
    { inputTokens: 0, outputTokens: 0, cachedTokens: 0, apiCalls: 0 },
  );
}
