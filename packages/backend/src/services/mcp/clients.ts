import { randomUUID } from 'crypto';
import { isAllowedRedirectUri, isPublicHttpsUrl } from './crypto';
import { getOAuthClient, parseRedirectUris, upsertOAuthClient } from './store';

export interface ResolvedClient {
  clientId: string;
  name: string;
  redirectUris: string[];
}

const metadataCache = new Map<string, { at: number; client: ResolvedClient }>();
const CACHE_MS = 10 * 60 * 1000;

function clientName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80);
  return cleaned || fallback;
}

function hostLabel(clientId: string): string {
  try {
    return new URL(clientId).host;
  } catch {
    return 'Aplicativo';
  }
}

async function fetchMetadataDocument(
  clientId: string,
): Promise<{ client_name?: unknown; redirect_uris: unknown[] } | null> {
  if (!(await isPublicHttpsUrl(clientId))) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(clientId, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'Jarvi-MCP' },
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > 65536) return null;
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as { client_name?: unknown; redirect_uris?: unknown };
    if (!Array.isArray(record.redirect_uris)) return null;
    return { client_name: record.client_name, redirect_uris: record.redirect_uris as unknown[] };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveMetadataClient(clientId: string): Promise<ResolvedClient | null> {
  const cached = metadataCache.get(clientId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.client;
  const document = await fetchMetadataDocument(clientId);
  if (!document) return null;
  const redirectUris = document.redirect_uris.filter(
    (uri): uri is string => typeof uri === 'string' && isAllowedRedirectUri(uri),
  );
  if (redirectUris.length === 0) return null;
  const client: ResolvedClient = {
    clientId,
    name: clientName(document.client_name, hostLabel(clientId)),
    redirectUris,
  };
  metadataCache.set(clientId, { at: Date.now(), client });
  await upsertOAuthClient({
    clientId,
    clientName: client.name,
    redirectUris,
  });
  return client;
}

export async function resolveOAuthClient(clientId: string): Promise<ResolvedClient | null> {
  if (!clientId || clientId.length > 512) return null;
  if (clientId.startsWith('https://')) {
    const fromMetadata = await resolveMetadataClient(clientId);
    if (fromMetadata) return fromMetadata;
  }
  const stored = await getOAuthClient(clientId);
  if (!stored) return null;
  const redirectUris = parseRedirectUris(stored.redirect_uris).filter(isAllowedRedirectUri);
  if (redirectUris.length === 0) return null;
  return {
    clientId,
    name: clientName(stored.client_name, 'Aplicativo'),
    redirectUris,
  };
}

export async function registerOAuthClient(input: {
  clientName: unknown;
  redirectUris: unknown;
  tokenEndpointAuthMethod: unknown;
}): Promise<ResolvedClient> {
  if (
    input.tokenEndpointAuthMethod != null &&
    input.tokenEndpointAuthMethod !== 'none'
  ) {
    throw new Error('unsupported_auth_method');
  }
  if (!Array.isArray(input.redirectUris) || input.redirectUris.length === 0 || input.redirectUris.length > 10) {
    throw new Error('invalid_redirect_uri');
  }
  const redirectUris = input.redirectUris.filter(
    (uri): uri is string => typeof uri === 'string' && isAllowedRedirectUri(uri),
  );
  if (redirectUris.length !== input.redirectUris.length) {
    throw new Error('invalid_redirect_uri');
  }
  const clientId = randomUUID();
  const name = clientName(input.clientName, 'Aplicativo');
  await upsertOAuthClient({ clientId, clientName: name, redirectUris });
  return { clientId, name, redirectUris };
}
