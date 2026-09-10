import crypto from 'crypto';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { shouldEmitExternalIntegrations } from '../config/environment';

/**
 * OpenAI Ads Conversions API.
 *
 * Browser Pixel events and these server events share the same `id` /
 * `event_id` (`cr_<userId>`) so OpenAI deduplicates instead of double-counting.
 * Unlike the Pixel, CAPI does not auto-capture `oppref` — the client must
 * forward it on signup.
 */

export const DEFAULT_OPENAI_ADS_PIXEL_ID = '5szZUPcYMs17mumdMe8uLg';

const WHATSAPP_PLACEHOLDER_EMAIL_SUFFIX = '@users.jarvi.internal';
const SKIP_FIRST_NAMES = new Set(['você', 'voce', 'user', 'oi']);

export interface OpenAiClickIds {
  oppref?: string;
  obref?: string;
  sourceUrl?: string;
}

export interface SendOpenAiRegistrationParams {
  eventId: string;
  sourceUrl?: string | null;
  oppref?: string | null;
  user: {
    email?: string | null;
    phone?: string | null;
    externalId?: string | null;
    firstName?: string | null;
    obref?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  };
}

const getPixelId = (): string =>
  process.env.OPENAI_ADS_PIXEL_ID?.trim() || DEFAULT_OPENAI_ADS_PIXEL_ID;

const getApiKey = (): string => process.env.OPENAI_ADS_CAPI_API_KEY?.trim() || '';

const isConfigured = (): boolean => Boolean(getApiKey() && getPixelId());

export const readOptionalTrimmed = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
};

export const readOpenAiClickIdsFromBody = (body: unknown): OpenAiClickIds => {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return {
    oppref: readOptionalTrimmed(record.oppref, 1024),
    obref: readOptionalTrimmed(record.obref, 256),
    sourceUrl: readOptionalTrimmed(record.eventSourceUrl, 2048),
  };
};

const sha256Hex = (value: string): string =>
  crypto.createHash('sha256').update(value, 'utf8').digest('hex');

const isPlaceholderEmail = (email: string): boolean =>
  email.trim().toLowerCase().endsWith(WHATSAPP_PLACEHOLDER_EMAIL_SUFFIX);

const hashEmail = (email: string | null | undefined): string | undefined => {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  if (!normalized || isPlaceholderEmail(normalized)) return undefined;
  return sha256Hex(normalized);
};

const hashPhone = (phone: string | null | undefined): string | undefined => {
  if (!phone) return undefined;
  const digits = phone.replace(/[^\d]/g, '').replace(/^0+/, '');
  if (digits.length < 8 || digits.length > 15) return undefined;
  return sha256Hex(digits);
};

const hashExternalId = (id: string | null | undefined): string | undefined => {
  if (!id) return undefined;
  const normalized = id.trim();
  if (!normalized) return undefined;
  return sha256Hex(normalized);
};

const hashFirstName = (name: string | null | undefined): string | undefined => {
  if (!name) return undefined;
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, '');
  if (!normalized || SKIP_FIRST_NAMES.has(normalized)) return undefined;
  return sha256Hex(normalized);
};

const defaultSourceUrl = (): string => {
  const frontend = (process.env.FRONTEND_URL || 'https://app.jarvi.life').replace(/\/$/, '');
  return `${frontend}/criar-conta`;
};

const resolveSourceUrl = (url?: string | null): string => {
  if (!url) return defaultSourceUrl();
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return defaultSourceUrl();
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return defaultSourceUrl();
  }
};

const buildUserObject = (
  user: SendOpenAiRegistrationParams['user']
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};

  const emails = hashEmail(user.email);
  if (emails) data.emails_sha256 = [emails];

  const phones = hashPhone(user.phone);
  if (phones) data.phone_numbers_sha256 = [phones];

  const externalIds = hashExternalId(user.externalId);
  if (externalIds) data.external_ids_sha256 = [externalIds];

  const firstNames = hashFirstName(user.firstName);
  if (firstNames) data.first_names_sha256 = [firstNames];

  if (user.obref) data.obref = user.obref;
  if (user.ip) data.ip_address = user.ip;
  if (user.userAgent) data.user_agent = user.userAgent;

  return data;
};

export const persistOpenAiClickIds = async (
  userId: string,
  clickIds: OpenAiClickIds
): Promise<void> => {
  const oppref = clickIds.oppref || null;
  const obref = clickIds.obref || null;
  if (!oppref && !obref) return;

  const now = new Date().toISOString();
  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE users
       SET openai_oppref = COALESCE($1, openai_oppref),
           openai_obref = COALESCE($2, openai_obref),
           updated_at = $3
       WHERE id = $4`,
      [oppref, obref, now, userId]
    );
    return;
  }

  await getDatabase().run(
    `UPDATE users
     SET openai_oppref = COALESCE(?, openai_oppref),
         openai_obref = COALESCE(?, openai_obref),
         updated_at = ?
     WHERE id = ?`,
    [oppref, obref, now, userId]
  );
};

export const sendOpenAiRegistrationCompleted = async (
  params: SendOpenAiRegistrationParams
): Promise<boolean> => {
  if (!isConfigured()) {
    return false;
  }

  if (!shouldEmitExternalIntegrations()) {
    console.debug('[dev] skipped OpenAI CAPI event: registration_completed');
    return false;
  }

  const pixelId = getPixelId();
  const apiKey = getApiKey();
  const validateOnly = /^(true|1)$/i.test(process.env.OPENAI_ADS_CAPI_VALIDATE_ONLY || '');

  const event: Record<string, unknown> = {
    id: params.eventId,
    type: 'registration_completed',
    timestamp_ms: Date.now(),
    action_source: 'web',
    source_url: resolveSourceUrl(params.sourceUrl),
    data: { type: 'customer_action' },
  };

  if (params.oppref) {
    event.oppref = params.oppref;
  }

  const user = buildUserObject(params.user);
  if (Object.keys(user).length > 0) {
    event.user = user;
  }

  const url = `https://bzr.openai.com/v1/events?pid=${encodeURIComponent(pixelId)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        validate_only: validateOnly,
        integration_source: 'jarvi',
        events: [event],
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[OpenAiCAPI] Event rejected', {
        status: response.status,
        body: text.slice(0, 500),
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('[OpenAiCAPI] Failed to send event', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
};
