/**
 * Twilio WhatsApp webhook entry point.
 *
 * Responsibilities (kept intentionally minimal — single source of truth for
 * intent detection and pending_task lifecycle is the unified agent):
 *   1. Validate Twilio signature.
 *   2. ACK Twilio with empty TwiML so the request returns < 1s.
 *   3. Normalize the payload and enqueue it for the worker.
 *   4. Send a quick "Processando..." for text-only messages.
 *
 * NO routing on body content (sim/não/follow-up/auto-caption media) lives
 * here anymore — the agent reads the active pending_tasks from its prompt
 * context and decides via tool calls (`confirm_pending_task`,
 * `reject_pending_task`, `update_pending_task`).
 */
import { Request, Response } from 'express';
import twilio from 'twilio';
import {
  enqueueIncomingWhatsappMessage,
  processIncomingWhatsappMessageDirect,
} from '../queues/whatsappQueue';
import { sendTextMessage } from '../services/whatsappService';

const normalizeWhatsappPhone = (value: string): string => {
  const cleaned = value.replace('whatsapp:', '').trim();
  const digits = cleaned.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
};

const getValidationUrls = (req: Request): string[] => {
  const urls = new Set<string>();
  const configuredWebhookUrl = process.env.TWILIO_WEBHOOK_URL?.trim();
  const host = req.get('host');
  const path = req.originalUrl;

  if (configuredWebhookUrl) {
    urls.add(configuredWebhookUrl);
  }

  if (host) {
    urls.add(`${req.protocol}://${host}${path}`);
    urls.add(`https://${host}${path}`);
    urls.add(`http://${host}${path}`);
  }

  return Array.from(urls);
};

const hasValidTwilioSignature = (
  req: Request,
  signature: string,
  authToken: string,
): boolean => {
  const candidateUrls = getValidationUrls(req);

  for (const url of candidateUrls) {
    if (twilio.validateRequest(authToken, signature, url, req.body)) {
      return true;
    }
  }

  console.warn('Twilio signature validation failed', {
    host: req.get('host') || null,
    originalUrl: req.originalUrl,
    attemptedUrls: candidateUrls,
    hasConfiguredWebhookUrl: Boolean(process.env.TWILIO_WEBHOOK_URL),
  });

  return false;
};

export const receiveMessage = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-twilio-signature'];

  if (!signature || typeof signature !== 'string') {
    res.sendStatus(401);
    return;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    res.sendStatus(500);
    return;
  }

  if (!hasValidTwilioSignature(req, signature, authToken)) {
    res.sendStatus(401);
    return;
  }

  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');

  void (async () => {
    try {
      const from = normalizeWhatsappPhone(String(req.body.From || ''));
      const body = String(req.body.Body || '').trim();
      const numMedia = Number.parseInt(String(req.body.NumMedia || '0'), 10);
      const mediaItems: Array<{ url: string; contentType: string; index: number }> = [];

      for (let index = 0; index < numMedia; index += 1) {
        const mediaUrl = req.body[`MediaUrl${index}`];
        const mediaContentType = req.body[`MediaContentType${index}`];
        if (typeof mediaUrl === 'string' && typeof mediaContentType === 'string') {
          mediaItems.push({ url: mediaUrl, contentType: mediaContentType, index });
        }
      }

      if (!from) return;

      const incomingMessagePayload = {
        from,
        content: body,
        mediaItems,
        messageSid: typeof req.body.MessageSid === 'string' ? req.body.MessageSid : null,
      };

      try {
        const { isFirstInBurst } = await enqueueIncomingWhatsappMessage(
          incomingMessagePayload,
        );
        // Quick acknowledgment for text-only messages so the user knows
        // we received the message while the agent processes (~2-4s).
        // Audio/image messages already display their own "⏳ Processando..."
        // status from inside the worker.
        if (isFirstInBurst && numMedia === 0) {
          sendTextMessage(from, 'Processando...').catch(() => {});
        }
      } catch (queueError) {
        console.error(
          'Failed to enqueue WhatsApp message. Falling back to direct processing:',
          {
            from,
            error: queueError instanceof Error ? queueError.message : String(queueError),
          },
        );
        await processIncomingWhatsappMessageDirect(incomingMessagePayload);
      }
    } catch (error) {
      console.error('Failed to process WhatsApp webhook payload:', error);
    }
  })();
};
