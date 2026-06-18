'use client';

import posthog from 'posthog-js';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();

// Only a real PostHog project key (phc_…) enables analytics. Placeholder values
// shipped in local/dev configs are ignored so we never emit events to a bogus
// project.
const isValidKey =
  !!POSTHOG_KEY && POSTHOG_KEY.startsWith('phc_') && !POSTHOG_KEY.includes('SUBSTITUA');

if (typeof window !== 'undefined' && isValidKey && !posthog.__loaded) {
  posthog.init(POSTHOG_KEY, {
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

export { posthog };
