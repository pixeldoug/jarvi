import type { MetadataRoute } from 'next';

import { SITE_URL } from './lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // PostHog reverse-proxy paths must not be crawled or indexed.
      disallow: '/ingest/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
