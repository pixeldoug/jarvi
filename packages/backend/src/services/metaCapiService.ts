import crypto from 'crypto';

/**
 * Meta Conversions API (CAPI) service.
 *
 * Sends server-side events to the Meta dataset so that deep-funnel conversions
 * (notably account verification, which can happen off-session / off-device) are
 * attributed reliably even when the browser Pixel cannot fire or is blocked.
 *
 * Browser Pixel events and these server events share the same `eventId` so Meta
 * deduplicates them instead of double-counting.
 */

export type MetaEventName =
  | 'InitiateCheckout'
  | 'RegistrationSubmitted'
  | 'CompleteRegistration';

export interface MetaUserData {
  email?: string | null;
  externalId?: string | null;
  firstName?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  fbc?: string | null;
  fbp?: string | null;
}

export interface SendMetaEventParams {
  eventName: MetaEventName;
  eventId: string;
  eventSourceUrl?: string | null;
  actionSource?: 'website' | 'system_generated';
  eventTime?: number;
  userData: MetaUserData;
  customData?: Record<string, unknown>;
}

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

const isConfigured = (): boolean =>
  Boolean(process.env.META_PIXEL_ID && process.env.META_CAPI_ACCESS_TOKEN);

const hash = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

const buildUserData = (userData: MetaUserData): Record<string, unknown> => {
  const data: Record<string, unknown> = {};

  const em = hash(userData.email);
  if (em) data.em = [em];

  const externalId = hash(userData.externalId);
  if (externalId) data.external_id = [externalId];

  const fn = hash(userData.firstName);
  if (fn) data.fn = [fn];

  // IP and User Agent must NOT be hashed.
  if (userData.clientIpAddress) data.client_ip_address = userData.clientIpAddress;
  if (userData.clientUserAgent) data.client_user_agent = userData.clientUserAgent;
  if (userData.fbc) data.fbc = userData.fbc;
  if (userData.fbp) data.fbp = userData.fbp;

  return data;
};

/**
 * Sends a single event to the Meta Conversions API.
 *
 * Never throws: any failure is logged and swallowed so authentication flows are
 * never blocked by analytics. Returns `true` when the event was accepted.
 */
export const sendMetaEvent = async (params: SendMetaEventParams): Promise<boolean> => {
  if (!isConfigured()) {
    return false;
  }

  const pixelId = process.env.META_PIXEL_ID as string;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN as string;
  const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE;

  const event: Record<string, unknown> = {
    event_name: params.eventName,
    event_time: params.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: params.eventId,
    action_source: params.actionSource ?? 'website',
    user_data: buildUserData(params.userData),
  };

  if (params.eventSourceUrl) {
    event.event_source_url = params.eventSourceUrl;
  }
  if (params.customData && Object.keys(params.customData).length > 0) {
    event.custom_data = params.customData;
  }

  const body: Record<string, unknown> = { data: [event] };
  if (testEventCode) {
    body.test_event_code = testEventCode;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(
    accessToken
  )}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[MetaCAPI] Event rejected', {
        eventName: params.eventName,
        status: response.status,
        body: text.slice(0, 500),
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('[MetaCAPI] Failed to send event', {
      eventName: params.eventName,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
};

/**
 * Extracts the best-effort client IP from an Express request, honoring the
 * `trust proxy` setting already configured on the app.
 */
export const getClientIp = (reqIp?: string, forwardedFor?: string | string[]): string | undefined => {
  if (forwardedFor) {
    const value = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const first = value.split(',')[0]?.trim();
    if (first) return first;
  }
  return reqIp || undefined;
};
