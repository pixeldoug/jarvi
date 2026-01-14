import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { PostHogProvider } from 'posthog-js/react';

const options = {
  api_host: import.meta.env.PROD ? '/ingest' : import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  ui_host: 'https://us.posthog.com', // Necessário para o toolbar funcionar com proxy
} as const;

// Só renderiza com PostHog em produção
const AppWrapper = () => {
  if (import.meta.env.PROD) {
    return (
      <PostHogProvider apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY} options={options}>
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
