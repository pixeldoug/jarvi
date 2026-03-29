'use client';

import { useEffect } from 'react';
import { posthog } from './lib/posthog';
import styles from './error.module.css';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    posthog?.capture('app_error', {
      error_message: error.message,
      error_digest: error.digest,
      error_stack: error.stack,
    });
  }, [error]);

  return (
    <div className={styles.container}>
      <img
        src="/assets/icons/logo-icon.svg"
        alt="Jarvi"
        className={styles.logo}
        aria-hidden="true"
      />
      <h1 className={styles.title}>Algo deu errado</h1>
      <p className={styles.description}>
        Ocorreu um erro inesperado. Tente novamente ou volte para a página principal.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primaryButton} onClick={reset}>
          Tentar novamente
        </button>
        <a href="/" className={styles.secondaryLink}>
          Voltar para o início
        </a>
      </div>
    </div>
  );
}
