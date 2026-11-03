import { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';

/**
 * Signed `client_reference_id` for the Stripe Payment Links. The webhook only
 * trusts a reference the backend issued to this user (a bare user id could be
 * put on the public link by anyone). Fetched up front so the checkout can open
 * synchronously from the click; null until it loads.
 */
export function useCheckoutReference(enabled = true): string | null {
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiClient
      .get<{ reference?: string }>('/api/subscriptions/checkout-reference')
      .then((data) => {
        if (!cancelled && typeof data.reference === 'string') setReference(data.reference);
      })
      .catch(() => {
        // Without it the webhook falls back to the (verified) checkout email.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return reference;
}
