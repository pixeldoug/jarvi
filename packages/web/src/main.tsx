import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import App from './App';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { initMetaPixel } from './lib/metaPixel';

const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;

if (posthogKey) {
  posthog.init(posthogKey, {
    // Same-origin reverse proxy (see rewrites in vercel.json) so requests are
    // not blocked by ad/privacy blockers that block us.i.posthog.com directly.
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
  });
  posthog.register({ platform: 'app' });
}

initMetaPixel();

const AppWrapper = () => {
  if (posthogKey) {
    return (
      <PostHogProvider client={posthog}>
        <App />
      </PostHogProvider>
    );
  }
  return <App />;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWrapper />
  </StrictMode>
);
