/**
 * Canonical public origin of the marketing site. Used for SEO metadata,
 * sitemap, robots, and Open Graph URLs. Override per environment with
 * NEXT_PUBLIC_SITE_URL (e.g. a Vercel preview URL).
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jarvi.life'
).replace(/\/$/, '');
