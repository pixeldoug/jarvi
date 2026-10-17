import { Router, type Request, type Response } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { authenticateToken } from '../middleware/auth';
import {
  approveAuthorization,
  authenticateMcpBearer,
  authorizationServerMetadata,
  beginAuthorization,
  createPersonalToken,
  denyAuthorization,
  describeClient,
  disconnectClient,
  exchangeToken,
  issuerFromRequest,
  OAuthError,
  personalTokenStatus,
  protectedResourceMetadata,
  readOAuthRequest,
  registerDynamicClient,
  revokePersonalToken,
  wwwAuthenticate,
} from '../services/mcp/oauth';
import { allowMcpCall, handleMcpRequest } from '../services/mcp/server';
import { mcpResourceUrl, publicBaseUrl } from '../services/mcp/urls';

const router = Router();

const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 300 : 2000,
  message: { error: 'too_many_requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

function sendOAuthError(res: Response, error: unknown): void {
  if (error instanceof OAuthError) {
    res.status(error.status).json({ error: error.code, error_description: error.message });
    return;
  }
  console.error('OAuth request failed', error);
  res.status(500).json({ error: 'server_error', error_description: 'Erro interno.' });
}

function metadata(res: Response, body: unknown): void {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(body);
}

router.get('/.well-known/openai-apps-challenge', (_req, res) => {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) {
    res.status(404).end();
    return;
  }
  res.type('text/plain').send(token);
});

router.get('/.well-known/oauth-protected-resource', (req, res) => {
  metadata(res, protectedResourceMetadata(publicBaseUrl(req)));
});

router.get('/.well-known/oauth-protected-resource/mcp', (req, res) => {
  metadata(res, protectedResourceMetadata(publicBaseUrl(req)));
});

router.get('/.well-known/oauth-authorization-server', (req, res) => {
  metadata(res, authorizationServerMetadata(publicBaseUrl(req)));
});

router.get('/.well-known/oauth-authorization-server/mcp', (req, res) => {
  metadata(res, authorizationServerMetadata(publicBaseUrl(req)));
});

router.get('/oauth/authorize', oauthLimiter, async (req, res) => {
  const request = readOAuthRequest(req.query as Record<string, unknown>);
  if (request.codeChallengeMethod === '' ) request.codeChallengeMethod = 'S256';
  try {
    const result = await beginAuthorization(request, issuerFromRequest(req));
    res.redirect(result.redirectTo);
  } catch (error) {
    sendOAuthError(res, error);
  }
});

router.get('/oauth/client', oauthLimiter, async (req, res) => {
  const clientId = typeof req.query.client_id === 'string' ? req.query.client_id : '';
  const client = await describeClient(clientId);
  if (!client) {
    res.status(404).json({ error: 'invalid_client' });
    return;
  }
  res.json(client);
});

router.post('/oauth/register', oauthLimiter, async (req, res) => {
  try {
    const client = await registerDynamicClient((req.body ?? {}) as Record<string, unknown>);
    res.status(201).json(client);
  } catch (error) {
    sendOAuthError(res, error);
  }
});

router.post(
  '/oauth/token',
  oauthLimiter,
  express.urlencoded({ extended: false }),
  async (req, res) => {
    try {
      const tokens = await exchangeToken((req.body ?? {}) as Record<string, unknown>);
      res.json(tokens);
    } catch (error) {
      sendOAuthError(res, error);
    }
  },
);

router.post('/api/oauth/approve', authenticateToken, async (req, res) => {
  try {
    const result = await approveAuthorization(
      req.user!.id,
      readOAuthRequest((req.body ?? {}) as Record<string, unknown>),
      issuerFromRequest(req),
    );
    res.json(result);
  } catch (error) {
    sendOAuthError(res, error);
  }
});

router.post('/api/oauth/deny', async (req, res) => {
  try {
    const result = await denyAuthorization(
      readOAuthRequest((req.body ?? {}) as Record<string, unknown>),
      issuerFromRequest(req),
    );
    res.json(result);
  } catch (error) {
    sendOAuthError(res, error);
  }
});

router.get('/api/mcp/status', authenticateToken, async (req, res) => {
  try {
    res.json(await personalTokenStatus(req.user!.id, publicBaseUrl(req)));
  } catch (error) {
    sendOAuthError(res, error);
  }
});

router.post('/api/mcp/tokens', authenticateToken, async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const created = await createPersonalToken(req.user!.id, name);
    res.status(201).json(created);
  } catch (error) {
    sendOAuthError(res, error);
  }
});

router.delete('/api/mcp/tokens/:id', authenticateToken, async (req, res) => {
  const removed = await revokePersonalToken(req.user!.id, req.params.id);
  if (!removed) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ revoked: true });
});

router.post('/api/mcp/clients/revoke', authenticateToken, async (req, res) => {
  const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId : '';
  if (!clientId) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  await disconnectClient(req.user!.id, clientId);
  res.json({ revoked: true });
});

router.all('/mcp', async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const base = publicBaseUrl(req);
  if (!token) {
    res.set('WWW-Authenticate', wwwAuthenticate(base));
    res.status(401).json({ error: 'invalid_token', error_description: 'Autenticação necessária.' });
    return;
  }
  try {
    const principal = await authenticateMcpBearer(token, mcpResourceUrl(base));
    if (!allowMcpCall(principal.userId)) {
      res.status(429).json({ error: 'rate_limited', error_description: 'Muitas chamadas. Espere um minuto.' });
      return;
    }
    const auth: AuthInfo = {
      token,
      clientId: principal.clientId,
      scopes: principal.scopes,
      expiresAt: principal.expiresAt,
      resource: new URL(mcpResourceUrl(base)),
      extra: { userId: principal.userId },
    };
    (req as Request & { auth?: AuthInfo }).auth = auth;
    await handleMcpRequest(req, res, req.body);
  } catch (error) {
    if (res.headersSent) return;
    if (error instanceof OAuthError) {
      if (error.status === 401) res.set('WWW-Authenticate', wwwAuthenticate(base));
      res.status(error.status).json({ error: error.code, error_description: error.message });
      return;
    }
    console.error('MCP request failed', error);
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;
