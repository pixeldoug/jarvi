import type { Request } from 'express';

export function publicBaseUrl(req?: Request): string {
  const configured = (process.env.PUBLIC_API_URL || process.env.BACKEND_PUBLIC_URL)?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (!req) return 'http://localhost:3001';
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto =
    (typeof forwardedProto === 'string' ? forwardedProto.split(',')[0] : req.protocol) || 'http';
  const forwardedHost = req.headers['x-forwarded-host'];
  const host =
    (typeof forwardedHost === 'string' ? forwardedHost.split(',')[0] : req.get('host')) ||
    'localhost:3001';
  return `${proto.trim()}://${host.trim()}`.replace(/\/$/, '');
}

export function mcpResourceUrl(base: string): string {
  return `${base.replace(/\/$/, '')}/mcp`;
}

export function frontendBaseUrl(): string {
  const raw =
    process.env.FRONTEND_URL ||
    process.env.FRONTEND_ORIGINS?.split(',')[0] ||
    'http://localhost:3000';
  return raw.trim().replace(/\/$/, '');
}

export function resourcesMatch(tokenResource: string | null, requestResource: string): boolean {
  if (!tokenResource) return true;
  return tokenResource.replace(/\/$/, '') === requestResource.replace(/\/$/, '');
}
