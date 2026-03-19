'use client';

import posthog from 'posthog-js';

if (typeof window !== 'undefined') {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

  if (key && !key.startsWith('phc_SUBSTITUA') && !posthog.__loaded) {
    posthog.init(key, {
      api_host: host,
      ui_host: 'https://us.posthog.com',
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage+cookie',
    });
    posthog.register({ platform: 'marketing' });
  }
}

export { posthog };
