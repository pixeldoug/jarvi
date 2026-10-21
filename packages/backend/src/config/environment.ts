/**
 * Environment configuration utilities
 */

export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV !== 'production';
};

export const isProduction = (): boolean => {
  return process.env.NODE_ENV === 'production';
};

export const getNodeEnv = (): string => {
  return process.env.NODE_ENV || 'development';
};

/**
 * Slack onboarding alerts, PostHog lifecycle events, Meta CAPI, OpenAI CAPI, etc.
 * Off by default outside production so local onboarding tests do not pollute prod.
 * Set JARVI_EMIT_EXTERNAL_INTEGRATIONS=true to force-enable locally.
 */
export const shouldEmitExternalIntegrations = (): boolean => {
  const override = process.env.JARVI_EMIT_EXTERNAL_INTEGRATIONS?.trim().toLowerCase();
  if (override === 'true' || override === '1') return true;
  if (override === 'false' || override === '0') return false;
  return isProduction();
};

/**
 * Proactive WhatsApp broadcasts (daily summary, Planejamento Semanal,
 * onboarding rescue) text every eligible user in *this* database through the
 * Twilio sender, which local, staging and production all share. Idempotency
 * rows live per database, so a second environment re-texts numbers production
 * already reached (Sunday 2026-10-18: one person got the weekly 3×).
 *
 * Off everywhere except the production deployment. Railway injects
 * RAILWAY_ENVIRONMENT_NAME, which keeps a staging service running with
 * NODE_ENV=production out as well. Set JARVI_PROACTIVE_WHATSAPP=true to test
 * the schedulers locally or on staging — only with test numbers in that DB.
 */
export const shouldRunProactiveWhatsapp = (): boolean => {
  const override = process.env.JARVI_PROACTIVE_WHATSAPP?.trim().toLowerCase();
  if (override === 'true' || override === '1') return true;
  if (override === 'false' || override === '0') return false;
  if (!isProduction()) return false;
  const railwayEnvironment = process.env.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase();
  return !railwayEnvironment || railwayEnvironment === 'production';
};
