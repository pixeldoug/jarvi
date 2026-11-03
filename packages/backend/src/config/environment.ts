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
 * Returns login OTPs in the API response (and skips WhatsApp delivery) so local
 * sign-in works without Twilio. Anyone who can call the API can then log in as
 * any user, so it needs an explicit opt-in on top of a non-production NODE_ENV —
 * a hosted environment that merely forgets NODE_ENV stays closed.
 * Set JARVI_LOCAL_OTP_BYPASS=true in packages/backend/.env to enable locally.
 */
export const allowLocalOtpBypass = (): boolean => {
  if (isProduction()) return false;
  const flag = process.env.JARVI_LOCAL_OTP_BYPASS?.trim().toLowerCase();
  return flag === 'true' || flag === '1';
};
