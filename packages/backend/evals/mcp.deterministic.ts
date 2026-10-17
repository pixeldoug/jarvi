/**
 * OAuth + MCP task tools, without the network and without the Jarvi model.
 * Run: DATABASE_URL=sqlite:/tmp/jarvi-mcp-oauth.db npx ts-node -P tsconfig.eval.json evals/mcp.deterministic.ts
 */
import assert from 'assert/strict';
import { createHash, randomBytes } from 'crypto';
import { rmSync } from 'fs';
import express from 'express';
import type { AddressInfo } from 'net';
import { initializeDatabase, getDatabase } from '../src/database';
import {
  approveAuthorization,
  authenticateMcpBearer,
  createPersonalToken,
  exchangeToken,
  OAuthError,
  registerDynamicClient,
} from '../src/services/mcp/oauth';
import { createTask, listTasks, removeTask } from '../src/services/mcp/tasks';
import { verifyPkce, isAllowedRedirectUri } from '../src/services/mcp/crypto';
import mcpRoutes from '../src/routes/mcpRoutes';

const dbFile = process.env.DATABASE_URL?.replace('sqlite:', '') || '';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function main(): Promise<void> {
  assert.equal(verifyPkce('abc', createHash('sha256').update('abc').digest('base64url')), true);
  assert.equal(isAllowedRedirectUri('http://evil.example/callback'), false);
  assert.equal(isAllowedRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect'), true);

  await initializeDatabase();
  const db = getDatabase();
  await db.run(
    `INSERT INTO users (id, email, name, password, subscription_status, email_verified)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['user-mcp', 'mcp-test@jarvi.test', 'MCP Test', 'x', 'active', 1],
  );

  const client = await registerDynamicClient({
    client_name: 'Test Client',
    redirect_uris: ['https://example.com/callback'],
    token_endpoint_auth_method: 'none',
  });
  assert.ok(client.client_id);

  const { verifier, challenge } = pkce();
  const approved = await approveAuthorization(
    'user-mcp',
    {
      clientId: client.client_id,
      redirectUri: 'https://example.com/callback',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state: 'xyz',
      scope: 'tasks',
      resource: 'http://localhost:3001/mcp',
    },
    'http://localhost:3001',
  );
  const redirected = new URL(approved.redirectTo);
  assert.equal(redirected.searchParams.get('state'), 'xyz');
  assert.equal(redirected.searchParams.get('iss'), 'http://localhost:3001');
  const code = redirected.searchParams.get('code');
  assert.ok(code);

  const tokens = await exchangeToken({
    grant_type: 'authorization_code',
    code,
    client_id: client.client_id,
    redirect_uri: 'https://example.com/callback',
    code_verifier: verifier,
    resource: 'http://localhost:3001/mcp',
  });
  assert.equal(tokens.token_type, 'Bearer');
  assert.ok(tokens.access_token.startsWith('jarvi_oat_'));

  await assert.rejects(
    () =>
      exchangeToken({
        grant_type: 'authorization_code',
        code,
        client_id: client.client_id,
        redirect_uri: 'https://example.com/callback',
        code_verifier: verifier,
      }),
    (error: unknown) => error instanceof OAuthError && error.code === 'invalid_grant',
  );

  const principal = await authenticateMcpBearer(tokens.access_token, 'http://localhost:3001/mcp');
  assert.equal(principal.userId, 'user-mcp');

  const created = await createTask(principal.userId, {
    title: 'ligar para o cliente',
    dueDate: '2026-10-20',
    priority: 'high',
  });
  assert.equal(created.title, 'Ligar para o cliente');
  const listed = await listTasks(principal.userId, { query: 'cliente' });
  assert.equal(listed.length, 1);
  await removeTask(principal.userId, created.id);

  const personal = await createPersonalToken(principal.userId, 'Cursor');
  const personalPrincipal = await authenticateMcpBearer(personal.token, 'http://localhost:3001/mcp');
  assert.equal(personalPrincipal.clientId, 'jarvi-personal');

  await assert.rejects(
    () => authenticateMcpBearer('not-a-jarvi-token', 'http://localhost:3001/mcp'),
    (error: unknown) => error instanceof OAuthError && error.status === 401,
  );

  const app = express();
  app.use(express.json());
  app.use(mcpRoutes);
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  try {
    const metadata = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-authorization-server`);
    const document = (await metadata.json()) as { code_challenge_methods_supported?: string[] };
    assert.equal(metadata.status, 200);
    assert.ok(document.code_challenge_methods_supported?.includes('S256'));

    const anonymous = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(anonymous.status, 401);
    assert.match(anonymous.headers.get('www-authenticate') || '', /oauth-protected-resource/);

    const listed = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${personal.token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    const listedText = await listed.text();
    assert.equal(listed.status, 200, listedText);
    assert.match(listedText, /list_tasks/);
    assert.match(listedText, /create_task/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('mcp oauth deterministic: ok');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (dbFile.startsWith('/tmp/')) rmSync(dbFile, { force: true });
  });
