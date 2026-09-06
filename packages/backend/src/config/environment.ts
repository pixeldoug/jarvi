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
 * Slack onboarding alerts, PostHog lifecycle events, Meta CAPI, etc.
 * Off by default outside production so local onboarding tests do not pollute prod.
 * Set JARVI_EMIT_EXTERNAL_INTEGRATIONS=true to force-enable locally.
 */
export const shouldEmitExternalIntegrations = (): boolean => {
  const override = process.env.JARVI_EMIT_EXTERNAL_INTEGRATIONS?.trim().toLowerCase();
  if (override === 'true' || override === '1') return true;
  if (override === 'false' || override === '0') return false;
  return isProduction();
};
