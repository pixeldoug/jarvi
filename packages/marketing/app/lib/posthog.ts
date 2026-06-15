'use client';

import posthog from 'posthog-js';

if (typeof window !== 'undefined') {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  if (key && !key.startsWith('phc_SUBSTITUA') && !posthog.__loaded) {
    posthog.init(key, {
      // Same-origin reverse proxy (see rewrites in next.config.mjs) so requests
      // are not blocked by ad/privacy blockers that block us.i.posthog.com.
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage+cookie',
    });
    posthog.register({ platform: 'marketing' });
  }
}

export { posthog };
