import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../../database';
import { sha256 } from './crypto';

export interface OAuthClientRow {
  client_id: string;
  client_name: string | null;
  redirect_uris: string;
  created_at: string;
}

export interface AuthCodeRow {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  scopes: string;
  resource: string | null;
  expires_at: string;
  used: number;
}

export interface CredentialRow {
  id: string;
  token_hash: string;
  kind: 'access' | 'refresh' | 'personal';
  client_id: string | null;
  user_id: string;
  scopes: string;
  resource: string | null;
  name: string | null;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface AccountRow {
  id: string;
  email: string;
  name: string;
}

function sql(text: string): string {
  if (isPostgreSQL()) return text;
  return text.replace(/\$\d+/g, '?');
}

async function many<T>(text: string, params: unknown[]): Promise<T[]> {
  if (isPostgreSQL()) {
    const result = await getPool().query(text, params);
    return result.rows as T[];
  }
  const rows = await getDatabase().all<T[]>(sql(text), params);
  return rows ?? [];
}

async function one<T>(text: string, params: unknown[]): Promise<T | null> {
  const rows = await many<T>(text, params);
  return rows[0] ?? null;
}

async function exec(text: string, params: unknown[]): Promise<number> {
  if (isPostgreSQL()) {
    const result = await getPool().query(text, params);
    return result.rowCount ?? 0;
  }
  const result = await getDatabase().run(sql(text), params);
  return result.changes ?? 0;
}

export async function upsertOAuthClient(input: {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
}): Promise<void> {
  const existing = await one<OAuthClientRow>(
    'SELECT client_id, client_name, redirect_uris, created_at FROM oauth_clients WHERE client_id = $1',
    [input.clientId],
  );
  const redirectUris = JSON.stringify(input.redirectUris);
  if (!existing) {
    await exec(
      `INSERT INTO oauth_clients (client_id, client_name, redirect_uris, created_at)
       VALUES ($1, $2, $3, $4)`,
      [input.clientId, input.clientName, redirectUris, new Date().toISOString()],
    );
    return;
  }
  await exec(
    'UPDATE oauth_clients SET client_name = $1, redirect_uris = $2 WHERE client_id = $3',
    [input.clientName ?? existing.client_name, redirectUris, input.clientId],
  );
}

export async function getOAuthClient(clientId: string): Promise<OAuthClientRow | null> {
  return one<OAuthClientRow>(
    'SELECT client_id, client_name, redirect_uris, created_at FROM oauth_clients WHERE client_id = $1',
    [clientId],
  );
}

export function parseRedirectUris(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function insertAuthCode(input: {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string;
  resource: string | null;
  expiresAt: string;
}): Promise<void> {
  await exec(
    `INSERT INTO oauth_authorization_codes
      (code_hash, client_id, user_id, redirect_uri, code_challenge, scopes, resource, expires_at, used)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)`,
    [
      sha256(input.code),
      input.clientId,
      input.userId,
      input.redirectUri,
      input.codeChallenge,
      input.scopes,
      input.resource,
      input.expiresAt,
    ],
  );
}

/** Marks the code used and returns it. A second exchange gets nothing. */
export async function consumeAuthCode(code: string): Promise<AuthCodeRow | null> {
  const hash = sha256(code);
  const now = new Date().toISOString();
  if (isPostgreSQL()) {
    const result = await getPool().query(
      `UPDATE oauth_authorization_codes
       SET used = 1
       WHERE code_hash = $1 AND used = 0 AND expires_at > $2
       RETURNING code_hash, client_id, user_id, redirect_uri, code_challenge, scopes, resource, expires_at, used`,
      [hash, now],
    );
    return (result.rows[0] as AuthCodeRow) ?? null;
  }
  const changes = await exec(
    `UPDATE oauth_authorization_codes
     SET used = 1
     WHERE code_hash = $1 AND used = 0 AND expires_at > $2`,
    [hash, now],
  );
  if (!changes) return null;
  return one<AuthCodeRow>(
    `SELECT code_hash, client_id, user_id, redirect_uri, code_challenge, scopes, resource, expires_at, used
     FROM oauth_authorization_codes WHERE code_hash = $1`,
    [hash],
  );
}

export async function insertCredential(input: {
  rawToken: string;
  kind: CredentialRow['kind'];
  clientId: string | null;
  userId: string;
  scopes: string;
  resource: string | null;
  name: string | null;
  expiresAt: string | null;
}): Promise<{ id: string }> {
  const id = uuidv4();
  await exec(
    `INSERT INTO mcp_credentials
      (id, token_hash, kind, client_id, user_id, scopes, resource, name, expires_at, created_at, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL)`,
    [
      id,
      sha256(input.rawToken),
      input.kind,
      input.clientId,
      input.userId,
      input.scopes,
      input.resource,
      input.name,
      input.expiresAt,
      new Date().toISOString(),
    ],
  );
  return { id };
}

export async function findCredential(rawToken: string): Promise<CredentialRow | null> {
  const row = await one<CredentialRow>(
    `SELECT id, token_hash, kind, client_id, user_id, scopes, resource, name, expires_at, created_at, revoked_at
     FROM mcp_credentials WHERE token_hash = $1`,
    [sha256(rawToken)],
  );
  if (!row || row.revoked_at) return null;
  if (row.expires_at && row.expires_at <= new Date().toISOString()) return null;
  return row;
}

export async function revokeCredentialById(id: string, userId: string): Promise<boolean> {
  const changes = await exec(
    `UPDATE mcp_credentials
     SET revoked_at = $1
     WHERE id = $2 AND user_id = $3 AND revoked_at IS NULL`,
    [new Date().toISOString(), id, userId],
  );
  return changes > 0;
}

export async function revokeCredentialByHash(rawToken: string): Promise<void> {
  await exec(
    `UPDATE mcp_credentials SET revoked_at = $1 WHERE token_hash = $2 AND revoked_at IS NULL`,
    [new Date().toISOString(), sha256(rawToken)],
  );
}

export async function countPersonalTokens(userId: string): Promise<number> {
  const row = await one<{ count: number | string }>(
    `SELECT COUNT(*) AS count FROM mcp_credentials
     WHERE user_id = $1 AND kind = 'personal' AND revoked_at IS NULL`,
    [userId],
  );
  return Number(row?.count ?? 0);
}

export async function listPersonalTokens(userId: string): Promise<CredentialRow[]> {
  return many<CredentialRow>(
    `SELECT id, token_hash, kind, client_id, user_id, scopes, resource, name, expires_at, created_at, revoked_at
     FROM mcp_credentials
     WHERE user_id = $1 AND kind = 'personal' AND revoked_at IS NULL
     ORDER BY created_at DESC`,
    [userId],
  );
}

export interface ConnectedClient {
  client_id: string;
  client_name: string | null;
  connected_at: string;
}

export async function listConnectedClients(userId: string): Promise<ConnectedClient[]> {
  return many<ConnectedClient>(
    `SELECT c.client_id, c.client_name, MIN(t.created_at) AS connected_at
     FROM mcp_credentials t
     JOIN oauth_clients c ON c.client_id = t.client_id
     WHERE t.user_id = $1 AND t.kind = 'refresh' AND t.revoked_at IS NULL
     GROUP BY c.client_id, c.client_name
     ORDER BY connected_at DESC`,
    [userId],
  );
}

export async function revokeClientAccess(userId: string, clientId: string): Promise<void> {
  await exec(
    `UPDATE mcp_credentials
     SET revoked_at = $1
     WHERE user_id = $2 AND client_id = $3 AND revoked_at IS NULL`,
    [new Date().toISOString(), userId, clientId],
  );
}

export async function getAccount(userId: string): Promise<AccountRow | null> {
  return one<AccountRow>('SELECT id, email, name FROM users WHERE id = $1', [userId]);
}
