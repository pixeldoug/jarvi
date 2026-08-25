'use client';

import { useEffect, useState } from 'react';
import { getStoredConsent, storeConsent, type CookieConsentValue } from '../../lib/consent';
import { posthog, initMarketingPostHog } from '../../lib/posthog';
import { getMetaPixelBootstrapScript } from '../../lib/metaPixelBootstrap';
import {
  DEFAULT_OPENAI_PIXEL_ID,
  getOpenAiPixelBootstrapScript,
} from '../../lib/openaiPixelBootstrap';
import styles from './CookieConsent.module.css';

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
const OPENAI_PIXEL_ID =
  process.env.NEXT_PUBLIC_OPENAI_PIXEL_ID?.trim() || DEFAULT_OPENAI_PIXEL_ID;

function injectInlineScript(id: string, source: string): void {
  if (!source || document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.text = source;
  document.head.appendChild(script);
}

function enableTracking(): void {
  if (META_PIXEL_ID && /^\d+$/.test(META_PIXEL_ID)) {
    injectInlineScript('meta-pixel', getMetaPixelBootstrapScript(META_PIXEL_ID));
  }
  if (/^[A-Za-z0-9_-]{8,64}$/.test(OPENAI_PIXEL_ID)) {
    injectInlineScript('openai-pixel', getOpenAiPixelBootstrapScript(OPENAI_PIXEL_ID));
  }
  initMarketingPostHog();
}

export function CookieConsent() {
  const [consent, setConsent] = useState<CookieConsentValue | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getStoredConsent();
    setConsent(stored);
    setReady(true);
    if (stored === 'accepted') enableTracking();
  }, []);

  const choose = (value: CookieConsentValue) => {
    storeConsent(value);
    setConsent(value);
    if (value === 'accepted') enableTracking();
    if (value === 'rejected') {
      try {
        posthog.opt_out_capturing?.();
      } catch {
        /* ignore */
      }
    }
  };

  if (!ready || consent) return null;

  return (
    <div className={styles.banner} role="dialog" aria-label="Consentimento de cookies">
      <p className={styles.text}>
        Usamos cookies e pixels de analytics/ads (PostHog, Meta e OpenAI) para entender o uso do
        site e medir campanhas. Você pode aceitar ou recusar o rastreamento não essencial.{' '}
        <a href="/lgpd">Saiba mais na página da LGPD</a>.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => choose('rejected')}>
          Recusar
        </button>
        <button type="button" className={styles.primary} onClick={() => choose('accepted')}>
          Aceitar
        </button>
      </div>
    </div>
  );
}
