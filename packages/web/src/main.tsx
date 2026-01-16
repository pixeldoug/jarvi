import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

// Inicializa PostHog apenas em produção
if (import.meta.env.PROD && import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    api_host: 'https://us.i.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
  });
}

// Renderiza com PostHogProvider em produção
const AppWrapper = () => {
  if (import.meta.env.PROD && import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
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
