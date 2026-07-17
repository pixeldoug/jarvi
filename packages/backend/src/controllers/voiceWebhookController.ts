/**
 * Twilio Voice webhook entry points for the reminder "call" (Ligação) channel.
 *
 *   1. `handleReminderTwiml` — Twilio fetches this once the call connects.
 *      Responds with TwiML that reads the reminder out loud.
 *   2. `handleCallStatus` — Twilio posts call lifecycle events here
 *      (initiated/ringing/answered/completed) for observability. Delivery
 *      itself is fire-and-forget (mirrors the WhatsApp text channel), so
 *      this only logs — it does not mutate reminder status.
 */
import { Request, Response } from 'express';
import { buildFallbackVoiceTwiml, buildReminderVoiceTwiml } from '../services/voiceService';
import { getReminderCallMessage } from '../services/reminderService';
import { hasValidTwilioSignature } from '../utils/twilioSignature';

const isAuthorizedTwilioRequest = (req: Request): boolean => {
  const signature = req.headers['x-twilio-signature'];
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!signature || typeof signature !== 'string' || !authToken) return false;
  return hasValidTwilioSignature(req, signature, authToken, process.env.BACKEND_PUBLIC_URL);
};

export const handleReminderTwiml = async (req: Request, res: Response): Promise<void> => {
  if (!isAuthorizedTwilioRequest(req)) {
    res.sendStatus(401);
    return;
  }

  const reminderId = typeof req.query.reminderId === 'string' ? req.query.reminderId : '';

  let message: string | null = null;
  try {
    message = reminderId ? await getReminderCallMessage(reminderId) : null;
  } catch (error) {
    console.error('[voiceWebhookController] Failed to resolve reminder call message:', {
      reminderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  res.set('Content-Type', 'text/xml');
  res.send(message ? buildReminderVoiceTwiml(message) : buildFallbackVoiceTwiml());
};

export const handleCallStatus = async (req: Request, res: Response): Promise<void> => {
  if (!isAuthorizedTwilioRequest(req)) {
    res.sendStatus(401);
    return;
  }

  console.log('[voiceWebhookController] Reminder call status update:', {
    reminderId: typeof req.query.reminderId === 'string' ? req.query.reminderId : null,
    callSid: req.body.CallSid,
    status: req.body.CallStatus,
    durationSeconds: req.body.CallDuration,
  });

  res.sendStatus(204);
};
