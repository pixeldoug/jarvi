import { PostHog } from 'posthog-node';
import { shouldEmitExternalIntegrations } from '../config/environment';

/**
 * Server-side PostHog client.
 *
 * Guarantees that key lifecycle events (notably account registration) are
 * captured even when the browser SDK is blocked by ad/privacy blockers or never
 * loads. Mirrors the role of `metaCapiService` for Meta.
 *
 * distinct_id convention: we use the user's email to stay consistent with the
 * browser SDK (`posthog.identify(email, ...)` in web/marketing), so the same
 * person is not split into two profiles.
 */

const apiKey = process.env.POSTHOG_API_KEY;
const host = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

const client: PostHog | null = apiKey
  ? new PostHog(apiKey, { host, flushAt: 1, flushInterval: 0 })
  : null;

export const isPostHogConfigured = (): boolean => client !== null;

/**
 * Eval harness distinct_id (`eval@jarvi.test`). Never write product events for
 * these, even when JARVI_EMIT_EXTERNAL_INTEGRATIONS is on — evals were
 * inflating task_created in production PostHog.
 */
export const isEvalAnalyticsDistinctId = (distinctId: string): boolean =>
  /@jarvi\.test$/i.test(distinctId.trim());

/**
 * Raw PostHog client for integrations that need it directly (e.g. the
 * `@posthog/ai` OpenAI wrapper). Returns null when PostHog is not configured —
 * callers must fall back gracefully.
 */
export const getPostHogClient = (): PostHog | null => client;

/**
 * Associates a distinct_id with person properties. Best-effort: never throws.
 */
export const identifyServer = (
  distinctId: string,
  properties: Record<string, unknown> = {},
): void => {
  if (!client || !distinctId) return;
  if (isEvalAnalyticsDistinctId(distinctId)) {
    console.debug('[eval] skipped PostHog identify:', distinctId);
    return;
  }
  if (!shouldEmitExternalIntegrations()) {
    console.debug('[dev] skipped PostHog identify:', distinctId);
    return;
  }
  try {
    client.identify({ distinctId, properties });
  } catch (error) {
    console.error('PostHog identify error:', error);
  }
};

/**
 * Captures a server-side event. Best-effort: never throws.
 */
export const captureServer = (
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
): void => {
  if (!client || !distinctId) return;
  if (isEvalAnalyticsDistinctId(distinctId)) {
    console.debug('[eval] skipped PostHog capture:', event);
    return;
  }
  // AI observability events are exempt from the dev gate. The `@posthog/ai`
  // wrapper talks to the raw client, so `$ai_generation` flows in dev either
  // way — gating `$ai_span` here produced traces missing their tool calls.
  // Product analytics (`ai_turn_completed` et al.) stays gated.
  if (!shouldEmitExternalIntegrations() && !event.startsWith('$ai_')) {
    console.debug('[dev] skipped PostHog capture:', event, properties);
    return;
  }
  try {
    client.capture({ distinctId, event, properties });
  } catch (error) {
    console.error('PostHog capture error:', error);
  }
};

/**
 * Flushes buffered events and shuts the client down. Call on process exit.
 */
export const shutdownPostHog = async (): Promise<void> => {
  if (!client) return;
  try {
    await client.shutdown();
  } catch (error) {
    console.error('PostHog shutdown error:', error);
  }
};
