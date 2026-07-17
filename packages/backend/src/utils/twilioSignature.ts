/**
 * Shared Twilio webhook signature validation.
 *
 * Twilio signs inbound webhook requests (WhatsApp messages, Voice TwiML
 * fetches, Voice status callbacks) with `X-Twilio-Signature`. Since our
 * public URL can be reached via different host headers (custom domain,
 * Railway internal domain, configured webhook URL), we validate against a
 * small set of candidate URLs instead of a single hardcoded one.
 */
import { Request } from 'express';
import twilio from 'twilio';

const getValidationUrls = (req: Request, configuredUrl?: string | null): string[] => {
  const urls = new Set<string>();
  const trimmedConfiguredUrl = configuredUrl?.trim();
  const host = req.get('host');
  const path = req.originalUrl;

  if (trimmedConfiguredUrl) {
    urls.add(trimmedConfiguredUrl);
  }

  if (host) {
    urls.add(`${req.protocol}://${host}${path}`);
    urls.add(`https://${host}${path}`);
    urls.add(`http://${host}${path}`);
  }

  return Array.from(urls);
};

/**
 * @param configuredUrl Optional explicit webhook URL (e.g. `TWILIO_WEBHOOK_URL`)
 *   to include as a validation candidate, useful when the request reaches us
 *   through a proxy that changes the host header.
 */
export const hasValidTwilioSignature = (
  req: Request,
  signature: string,
  authToken: string,
  configuredUrl?: string | null,
): boolean => {
  const candidateUrls = getValidationUrls(req, configuredUrl);

  for (const url of candidateUrls) {
    if (twilio.validateRequest(authToken, signature, url, req.body)) {
      return true;
    }
  }

  console.warn('Twilio signature validation failed', {
    host: req.get('host') || null,
    originalUrl: req.originalUrl,
    attemptedUrls: candidateUrls,
    hasConfiguredUrl: Boolean(configuredUrl),
  });

  return false;
};
