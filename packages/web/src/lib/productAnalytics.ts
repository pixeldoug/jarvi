import posthog from 'posthog-js';

/**
 * Eval harness emails (`eval@jarvi.test`). Never identify or capture for these,
 * even if VITE_EMIT_PRODUCT_ANALYTICS is on.
 */
export const isEvalAnalyticsDistinctId = (distinctId: string): boolean =>
  /@jarvi\.test$/i.test(distinctId.trim());

/**
 * Product analytics (PostHog) from the browser.
 * Disabled in Vite dev by default so local onboarding tests do not pollute prod.
 * Set VITE_EMIT_PRODUCT_ANALYTICS=true in packages/web/.env to force-enable.
 */
export const shouldEmitProductAnalytics = (): boolean => {
  const override = import.meta.env.VITE_EMIT_PRODUCT_ANALYTICS;
  if (override === 'true' || override === '1') return true;
  if (override === 'false' || override === '0') return false;
  return !import.meta.env.DEV;
};

export const shouldTrackProductUser = (distinctId?: string | null): boolean => {
  if (!shouldEmitProductAnalytics()) return false;
  if (distinctId && isEvalAnalyticsDistinctId(distinctId)) return false;
  return true;
};

export const captureProductEvent = (
  event: string,
  properties?: Record<string, unknown>,
): void => {
  if (!shouldEmitProductAnalytics()) {
    console.debug('[dev] skipped PostHog capture:', event, properties);
    return;
  }
  posthog.capture(event, properties);
};

export const identifyProductUser = (
  distinctId: string,
  properties?: Record<string, unknown>,
): void => {
  if (!shouldTrackProductUser(distinctId)) {
    console.debug('[dev] skipped PostHog identify:', distinctId);
    return;
  }
  posthog.identify(distinctId, properties);
};
