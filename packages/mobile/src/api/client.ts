import { appEvents } from '@/lib/events';

/** Backend origin, without `/api`. Set per EAS profile in eas.json. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super(typeof data.error === 'string' ? data.error : `HTTP ${status}`);
    this.name = 'ApiError';
  }
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
  const headers: Record<string, string> = { Accept: 'application/json' };
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
    throw new ApiError(0, { error: 'Sem conexão com a Jarvi. Verifique sua internet.' });
  }

  const body = await readBody(response);

  if (!response.ok) {
    const data = asRecord(body);
    // The auth middleware answers a missing token with 401 and an expired one with 403.
    const sessionRejected =
      response.status === 401 || (response.status === 403 && data.error === 'Invalid token');
    // Only a rejection of the active session signs out (not a stale in-flight request).
    if (sessionRejected && token && token === sessionToken) appEvents.emit('unauthorized');
    if (response.status === 403 && data.error === 'subscription_required') {
      appEvents.emit('subscription_required');
    }
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

/** User-facing message for any thrown value. */
export function errorMessage(error: unknown, fallback = 'Algo deu errado. Tente de novo.'): string {
  if (error instanceof ApiError || error instanceof Error) return error.message || fallback;
  return fallback;
}
