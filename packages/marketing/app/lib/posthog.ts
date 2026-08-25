'use client';

import posthog from 'posthog-js';
import { dropInAppBrowserExceptions } from './dropInAppBrowserExceptions';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();

const isValidKey =
  !!POSTHOG_KEY && POSTHOG_KEY.startsWith('phc_') && !POSTHOG_KEY.includes('SUBSTITUA');

export function initMarketingPostHog(): void {
  if (typeof window === 'undefined' || !isValidKey || posthog.__loaded) return;

  posthog.init(POSTHOG_KEY, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    capture_pageview: false,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    cross_subdomain_cookie: true,
    before_send: dropInAppBrowserExceptions,
    loaded: (ph) => {
      ph.capture('$pageview', { $current_url: window.location.href });
    },
  });
  posthog.register({ platform: 'marketing' });
}

export { posthog };
