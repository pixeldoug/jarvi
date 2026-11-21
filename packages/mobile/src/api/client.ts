// `@/i18n/instance`, not `@/i18n`: the index re-exports changeLocale, which imports this file.
import i18n, { getCurrentLocale } from '@/i18n/instance';
import { LOCALE_HEADER, type Locale } from '@/i18n/locale';
import { appEvents } from '@/lib/events';

/** Backend origin, without `/api`. Set per EAS profile in eas.json. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

/**
 * A failed API call. `message` is the server's `error` text (already in the
 * user's language on the new backend, Portuguese on the old one).
 *
 * Branch on `code` (stable, e.g. 'SUBSCRIPTION_REQUIRED', 'INVALID_TOKEN',
 * 'TASK_NOT_FOUND'), never on the message. The old backend sends no code, so
 * logic that must work with it also accepts its fixed Portuguese/English
 * strings, as `isSessionRejection` / `isSubscriptionRequired` below do.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super(typeof data.error === 'string' ? data.error : i18n.t('errors.httpStatus', { status }));
    this.name = 'ApiError';
  }

  /** Stable error code from the new backend (`{ error, code }`); undefined on the old one. */
  get code(): string | undefined {
    return typeof this.data.code === 'string' ? this.data.code : undefined;
  }
}

/**
 * `X-Jarvi-Locale` for the current UI language. `request()` adds it to every
 * call; any request that does not go through `api` (streamed chat, uploads,
 * sockets) must spread it into its headers:
 *   fetch(url, { headers: { ...localeHeaders(), Authorization: … } })
 */
export function localeHeaders(): { [LOCALE_HEADER]: Locale } {
  return { [LOCALE_HEADER]: getCurrentLocale() };
}

/**
 * The server rejected the session: 401 (no token), or 403 for an expired /
 * invalid one — `code: 'INVALID_TOKEN'` on the new backend, the text
 * 'Invalid token' on the old one.
 */
export function isSessionRejection(status: number, data: Record<string, unknown>): boolean {
  if (status === 401) return true;
  return status === 403 && (data.code === 'INVALID_TOKEN' || data.error === 'Invalid token');
}

/** The paywall: `code: 'SUBSCRIPTION_REQUIRED'` (new backend) or `error: 'subscription_required'` (old). */
export function isSubscriptionRequired(status: number, data: Record<string, unknown>): boolean {
  return status === 403 && (data.code === 'SUBSCRIPTION_REQUIRED' || data.error === 'subscription_required');
}

/**
 * Raises the app-wide events for a failed response: sign-out when the active
 * session (`token`, the one the request carried) was rejected, the paywall
 * when the subscription is required. For callers that use `fetch` directly.
 */
export function reportApiFailure(status: number, data: Record<string, unknown>, token: string | null): void {
  // Only a rejection of the active session signs out (not a stale in-flight request).
  if (isSessionRejection(status, data) && token && token === sessionToken) appEvents.emit('unauthorized');
  if (isSubscriptionRequired(status, data)) appEvents.emit('subscription_required');
}

let sessionToken: string | null = null;

/** The auth provider keeps this in sync with the stored session. */
export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // Proxies answer with HTML on outages; keep a readable message.
    return { error: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function request<T>(method: string, path: string, payload?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...localeHeaders() };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  // The token this request carries; the session may change while it is in flight.
  const token = sessionToken;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: i18n.t('errors.network'), code: 'NETWORK' });
  }

  const body = await readBody(response);

  if (!response.ok) {
    const data = asRecord(body);
    reportApiFailure(response.status, data, token);
    throw new ApiError(response.status, data);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/**
 * User-facing message for any thrown value. Default fallback:
 * `common:errors.generic` ("Algo deu errado. Tente de novo.").
 */
export function errorMessage(error: unknown, fallback?: string): string {
  const message = error instanceof ApiError || error instanceof Error ? error.message : '';
  return message || fallback || i18n.t('errors.generic');
}
