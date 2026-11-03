import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';

export type CheckoutReferenceStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Signed `client_reference_id` for the Stripe Payment Links. The webhook only
 * trusts a reference the backend issued to this user (a bare user id could be
 * put on the public link by anyone), and the email fallback can't match a
 * WhatsApp-only account, so the payment buttons must wait for it: fetched up
 * front so the checkout can still open synchronously from the click.
 */
export function useCheckoutReference(enabled = true): {
  reference: string | null;
  status: CheckoutReferenceStatus;
  retry: () => void;
} {
  const [reference, setReference] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckoutReferenceStatus>('idle');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus('loading');
    apiClient
      .get<{ reference?: string }>('/api/subscriptions/checkout-reference')
      .then((data) => {
        if (cancelled) return;
        if (typeof data.reference === 'string') {
          setReference(data.reference);
          setStatus('ready');
        } else {
          setStatus('error');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { reference, status, retry };
}
