import type { Request } from 'express';
import { requireActiveSubscription } from '../../middleware/requireSubscription';
import { MCP_SCOPE, isAllowedRedirectUri, randomToken, verifyPkce } from './crypto';
import { registerOAuthClient, resolveOAuthClient } from './clients';
import {
  consumeAuthCode,
  countPersonalTokens,
  findCredential,
  getAccount,
  insertAuthCode,
  insertCredential,
  listConnectedClients,
  listPersonalTokens,
  revokeClientAccess,
  revokeCredentialByHash,
  revokeCredentialById,
  type ConnectedClient,
} from './store';
import { frontendBaseUrl, mcpResourceUrl, publicBaseUrl, resourcesMatch } from './urls';

const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PERSONAL_TOKEN_LIMIT = 10;

export class OAuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface OAuthRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
  resource: string | null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function readOAuthRequest(source: Record<string, unknown>): OAuthRequest {
  const resource = asString(source.resource).trim();
  return {
    clientId: asString(source.client_id).trim(),
    redirectUri: asString(source.redirect_uri).trim(),
    codeChallenge: asString(source.code_challenge).trim(),
    codeChallengeMethod: asString(source.code_challenge_method).trim() || 'S256',
    state: asString(source.state).slice(0, 2048),
    scope: asString(source.scope).trim() || MCP_SCOPE,
    resource: resource || null,
  };
}

function authorizationErrorRedirect(
  redirectUri: string,
  issuer: string,
  state: string,
  error: string,
  description: string,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  url.searchParams.set('iss', issuer);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

async function validatedClient(request: OAuthRequest) {
  if (!request.clientId) throw new OAuthError(400, 'invalid_request', 'client_id é obrigatório.');
  if (!isAllowedRedirectUri(request.redirectUri)) {
    throw new OAuthError(400, 'invalid_request', 'redirect_uri inválido.');
  }
  const client = await resolveOAuthClient(request.clientId);
  if (!client) throw new OAuthError(400, 'invalid_client', 'Cliente OAuth desconhecido.');
  if (!client.redirectUris.includes(request.redirectUri)) {
    throw new OAuthError(400, 'invalid_request', 'redirect_uri não autorizado para este cliente.');
  }
  if (request.codeChallengeMethod !== 'S256' || request.codeChallenge.length < 43) {
    throw new OAuthError(400, 'invalid_request', 'PKCE S256 é obrigatório.');
  }
  if (request.scope.split(' ').some((scope) => scope && scope !== MCP_SCOPE)) {
    throw new OAuthError(400, 'invalid_scope', 'O único escopo disponível é tasks.');
  }
  return client;
}

export async function beginAuthorization(
  request: OAuthRequest,
  issuer: string,
): Promise<{ redirectTo: string }> {
  try {
    const client = await validatedClient(request);
    const params = new URLSearchParams({
      client_id: request.clientId,
      redirect_uri: request.redirectUri,
      code_challenge: request.codeChallenge,
      code_challenge_method: 'S256',
      scope: MCP_SCOPE,
      client_name: client.name,
    });
    if (request.state) params.set('state', request.state);
    if (request.resource) params.set('resource', request.resource);
    return { redirectTo: `${frontendBaseUrl()}/oauth/consent?${params.toString()}` };
  } catch (error) {
    if (error instanceof OAuthError && isAllowedRedirectUri(request.redirectUri)) {
      const client = await resolveOAuthClient(request.clientId);
      if (client?.redirectUris.includes(request.redirectUri)) {
        return {
          redirectTo: authorizationErrorRedirect(
            request.redirectUri,
            issuer,
            request.state,
            error.code,
            error.message,
          ),
        };
      }
    }
    throw error;
  }
}

export async function describeClient(clientId: string): Promise<{ name: string } | null> {
  const client = await resolveOAuthClient(clientId);
  if (!client) return null;
  return { name: client.name };
}

async function assertSubscribed(userId: string, email: string, name: string): Promise<void> {
  const req = { user: { id: userId, email, name } } as Request;
  let status = 200;
  await new Promise<void>((resolve, reject) => {
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {
        resolve();
        return this;
      },
    };
    void requireActiveSubscription(
      req,
      res as unknown as Parameters<typeof requireActiveSubscription>[1],
      (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
  if (status >= 400) {
    throw new OAuthError(403, 'access_denied', 'É preciso uma assinatura ativa para conectar um assistente.');
  }
}

export async function approveAuthorization(
  userId: string,
  request: OAuthRequest,
  issuer: string,
): Promise<{ redirectTo: string }> {
  const account = await getAccount(userId);
  if (!account) throw new OAuthError(401, 'access_denied', 'Conta não encontrada.');
  await assertSubscribed(account.id, account.email, account.name);
  const client = await validatedClient(request);
  const code = randomToken('jarvi_oac');
  await insertAuthCode({
    code,
    clientId: client.clientId,
    userId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scopes: MCP_SCOPE,
    resource: request.resource,
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  const url = new URL(request.redirectUri);
  url.searchParams.set('code', code);
  url.searchParams.set('iss', issuer);
  if (request.state) url.searchParams.set('state', request.state);
  return { redirectTo: url.toString() };
}

export async function denyAuthorization(
  request: OAuthRequest,
  issuer: string,
): Promise<{ redirectTo: string }> {
  const client = await resolveOAuthClient(request.clientId);
  if (!client || !isAllowedRedirectUri(request.redirectUri) || !client.redirectUris.includes(request.redirectUri)) {
    throw new OAuthError(400, 'invalid_request', 'redirect_uri inválido.');
  }
  return {
    redirectTo: authorizationErrorRedirect(
      request.redirectUri,
      issuer,
      request.state,
      'access_denied',
      'A pessoa recusou o acesso.',
    ),
  };
}

interface IssuedTokens {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issuePair(input: {
  userId: string;
  clientId: string;
  resource: string | null;
}): Promise<IssuedTokens> {
  const accessToken = randomToken('jarvi_oat');
  const refreshToken = randomToken('jarvi_ort');
  const accessExpires = new Date(Date.now() + ACCESS_TTL_MS).toISOString();
  const refreshExpires = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  await insertCredential({
    rawToken: accessToken,
    kind: 'access',
    clientId: input.clientId,
    userId: input.userId,
    scopes: MCP_SCOPE,
    resource: input.resource,
    name: null,
    expiresAt: accessExpires,
  });
  await insertCredential({
    rawToken: refreshToken,
    kind: 'refresh',
    clientId: input.clientId,
    userId: input.userId,
    scopes: MCP_SCOPE,
    resource: input.resource,
    name: null,
    expiresAt: refreshExpires,
  });
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_MS / 1000,
    refresh_token: refreshToken,
    scope: MCP_SCOPE,
  };
}

export async function exchangeToken(body: Record<string, unknown>): Promise<IssuedTokens> {
  const grantType = asString(body.grant_type);
  const clientId = asString(body.client_id).trim();
  if (grantType === 'authorization_code') {
    const code = asString(body.code);
    const redirectUri = asString(body.redirect_uri);
    const verifier = asString(body.code_verifier);
    const resource = asString(body.resource).trim();
    const stored = await consumeAuthCode(code);
    if (!stored || stored.client_id !== clientId || stored.redirect_uri !== redirectUri) {
      throw new OAuthError(400, 'invalid_grant', 'Código de autorização inválido.');
    }
    if (!verifyPkce(verifier, stored.code_challenge)) {
      throw new OAuthError(400, 'invalid_grant', 'code_verifier não confere.');
    }
    if (resource && stored.resource && resource !== stored.resource) {
      throw new OAuthError(400, 'invalid_target', 'resource não confere com a autorização.');
    }
    return issuePair({
      userId: stored.user_id,
      clientId,
      resource: stored.resource,
    });
  }
  if (grantType === 'refresh_token') {
    const refreshToken = asString(body.refresh_token);
    const stored = await findCredential(refreshToken);
    if (!stored || stored.kind !== 'refresh' || stored.client_id !== clientId) {
      throw new OAuthError(400, 'invalid_grant', 'Refresh token inválido.');
    }
    await revokeCredentialByHash(refreshToken);
    return issuePair({
      userId: stored.user_id,
      clientId,
      resource: stored.resource,
    });
  }
  throw new OAuthError(400, 'unsupported_grant_type', 'Grant não suportado.');
}

export async function registerDynamicClient(body: Record<string, unknown>) {
  try {
    const client = await registerOAuthClient({
      clientName: body.client_name,
      redirectUris: body.redirect_uris,
      tokenEndpointAuthMethod: body.token_endpoint_auth_method,
    });
    return {
      client_id: client.clientId,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_client_metadata';
    throw new OAuthError(400, code, 'Não foi possível registrar o cliente.');
  }
}

export interface McpPrincipal {
  userId: string;
  email: string;
  name: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
}

export async function authenticateMcpBearer(
  token: string,
  resource: string,
): Promise<McpPrincipal> {
  if (!token.startsWith('jarvi_oat_') && !token.startsWith('jarvi_mcp_')) {
    throw new OAuthError(401, 'invalid_token', 'Token inválido.');
  }
  const credential = await findCredential(token);
  if (!credential || (credential.kind !== 'access' && credential.kind !== 'personal')) {
    throw new OAuthError(401, 'invalid_token', 'Token inválido.');
  }
  if (!credential.scopes.split(' ').includes(MCP_SCOPE)) {
    throw new OAuthError(403, 'insufficient_scope', 'Escopo insuficiente.');
  }
  if (!resourcesMatch(credential.resource, resource)) {
    throw new OAuthError(401, 'invalid_token', 'Token emitido para outro recurso.');
  }
  const account = await getAccount(credential.user_id);
  if (!account) throw new OAuthError(401, 'invalid_token', 'Conta não encontrada.');
  await assertSubscribed(account.id, account.email, account.name);
  return {
    userId: account.id,
    email: account.email,
    name: account.name,
    clientId: credential.client_id || 'jarvi-personal',
    scopes: credential.scopes.split(' ').filter(Boolean),
    expiresAt: credential.expires_at
      ? Math.floor(new Date(credential.expires_at).getTime() / 1000)
      : undefined,
  };
}

export function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    scopes_supported: [MCP_SCOPE],
  };
}

export function protectedResourceMetadata(base: string) {
  return {
    resource: mcpResourceUrl(base),
    authorization_servers: [base],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Jarvi',
  };
}

export async function createPersonalToken(userId: string, name: string): Promise<{ token: string; id: string }> {
  const account = await getAccount(userId);
  if (!account) throw new OAuthError(401, 'invalid_token', 'Conta não encontrada.');
  await assertSubscribed(account.id, account.email, account.name);
  const existing = await countPersonalTokens(userId);
  if (existing >= PERSONAL_TOKEN_LIMIT) {
    throw new OAuthError(400, 'invalid_request', 'Limite de 10 chaves atingido.');
  }
  const token = randomToken('jarvi_mcp');
  const created = await insertCredential({
    rawToken: token,
    kind: 'personal',
    clientId: null,
    userId,
    scopes: MCP_SCOPE,
    resource: null,
    name: name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || 'Chave',
    expiresAt: null,
  });
  return { token, id: created.id };
}

export async function personalTokenStatus(userId: string, base: string): Promise<{
  mcpUrl: string;
  tokens: Array<{ id: string; name: string; createdAt: string }>;
  clients: ConnectedClient[];
}> {
  const [tokens, clients] = await Promise.all([
    listPersonalTokens(userId),
    listConnectedClients(userId),
  ]);
  return {
    mcpUrl: mcpResourceUrl(base),
    tokens: tokens.map((token) => ({
      id: token.id,
      name: token.name || 'Chave',
      createdAt: token.created_at,
    })),
    clients,
  };
}

export async function revokePersonalToken(userId: string, id: string): Promise<boolean> {
  return revokeCredentialById(id, userId);
}

export async function disconnectClient(userId: string, clientId: string): Promise<void> {
  await revokeClientAccess(userId, clientId);
}

export function wwwAuthenticate(base: string): string {
  const metadata = `${base}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${metadata}", scope="${MCP_SCOPE}"`;
}

export function issuerFromRequest(req: Request): string {
  return publicBaseUrl(req);
}
