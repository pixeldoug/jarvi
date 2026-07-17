/**
 * Outbound voice call delivery for the "call" (Ligação) reminder channel.
 *
 * Reuses the Twilio account already configured for WhatsApp. Placing a call
 * requires a voice-capable Twilio number (`TWILIO_VOICE_NUMBER`) and a public
 * HTTPS base URL (`BACKEND_PUBLIC_URL`) that Twilio can reach to fetch the
 * TwiML spoken to the user and to post call status updates.
 */
import twilio from 'twilio';

let twilioClient: ReturnType<typeof twilio> | null = null;

const getTwilioCredentials = (): { accountSid: string; authToken: string } => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables are required');
  }

  return { accountSid, authToken };
};

const getTwilioClient = (): ReturnType<typeof twilio> => {
  const { accountSid, authToken } = getTwilioCredentials();

  if (!twilioClient) {
    twilioClient = twilio(accountSid, authToken);
  }

  return twilioClient;
};

/**
 * Voice calls need a real voice-capable Twilio number, which is often a
 * different number than the WhatsApp sender. Falls back to the WhatsApp
 * number (stripped of the `whatsapp:` prefix) for local/dev setups where
 * only one Twilio number is configured.
 */
const getTwilioVoiceNumber = (): string => {
  const voiceNumber = process.env.TWILIO_VOICE_NUMBER?.trim();
  if (voiceNumber) return voiceNumber;

  const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER?.trim();
  if (whatsappNumber) return whatsappNumber.replace(/^whatsapp:/, '');

  throw new Error(
    'TWILIO_VOICE_NUMBER (or TWILIO_WHATSAPP_NUMBER as fallback) environment variable is required',
  );
};

const getBackendPublicUrl = (): string => {
  const configured = process.env.BACKEND_PUBLIC_URL?.trim();
  if (!configured) {
    throw new Error('BACKEND_PUBLIC_URL environment variable is required to place reminder calls');
  }
  return configured.replace(/\/+$/, '');
};

const toVoiceAddress = (value: string): string => value.replace(/^whatsapp:/, '').trim();

/**
 * Places an outbound call for a reminder and returns the Twilio Call SID.
 * Twilio will fetch TwiML from `/api/webhooks/voice/reminder-twiml` once the
 * call connects, and post status updates to `/api/webhooks/voice/status`.
 */
export const initiateReminderCall = async (to: string, reminderId: string): Promise<string> => {
  const client = getTwilioClient();
  const baseUrl = getBackendPublicUrl();
  const query = `reminderId=${encodeURIComponent(reminderId)}`;

  const call = await client.calls.create({
    to: toVoiceAddress(to),
    from: getTwilioVoiceNumber(),
    url: `${baseUrl}/api/webhooks/voice/reminder-twiml?${query}`,
    method: 'POST',
    statusCallback: `${baseUrl}/api/webhooks/voice/status?${query}`,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  });

  return call.sid;
};

const VOICE_LANGUAGE = 'pt-BR';
const VOICE_NAME = 'Polly.Camila';

/** TwiML spoken when the call connects: says the reminder twice, then hangs up. */
export const buildReminderVoiceTwiml = (message: string): string => {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ language: VOICE_LANGUAGE, voice: VOICE_NAME }, message);
  response.pause({ length: 1 });
  response.say({ language: VOICE_LANGUAGE, voice: VOICE_NAME }, message);
  return response.toString();
};

/** Fallback TwiML used when the reminder/task can no longer be resolved. */
export const buildFallbackVoiceTwiml = (): string => {
  const response = new twilio.twiml.VoiceResponse();
  response.say(
    { language: VOICE_LANGUAGE, voice: VOICE_NAME },
    'Não foi possível carregar os detalhes do seu lembrete. Abra o aplicativo Jarvi para ver sua tarefa.',
  );
  return response.toString();
};
