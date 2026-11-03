/**
 * useAppConnections — which apps are connected, for the Apps page.
 * WhatsApp is seeded from the auth user, then both statuses are fetched.
 * `reload` re-reads them (e.g. after the app dialog closes).
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { API_URL, parseApiPayload } from './AppConnectPages';

export interface AppConnections {
  whatsappLinked: boolean;
  whatsappPhone: string;
  aiLinked: boolean;
}

export function useAppConnections() {
  const { token, user } = useAuth();
  const [connections, setConnections] = useState<AppConnections>(() => ({
    whatsappLinked: Boolean(user?.whatsappVerified),
    whatsappPhone: user?.whatsappPhone || '',
    aiLinked: false,
  }));
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    const loadWhatsapp = async () => {
      try {
        const res = await fetch(`${API_URL}/api/users/whatsapp-link`, { headers });
        const data = await parseApiPayload(res);
        if (!res.ok) return;
        setConnections((prev) => ({
          ...prev,
          whatsappLinked: Boolean(data.linked),
          whatsappPhone: typeof data.phone === 'string' ? data.phone : '',
        }));
      } catch {
        // Keep auth-seeded state if status fetch fails.
      }
    };

    const loadAi = async () => {
      try {
        const res = await fetch(`${API_URL}/api/mcp/status`, { headers });
        const data = await parseApiPayload(res);
        if (!res.ok) return;
        const tokens = Array.isArray(data.tokens) ? data.tokens : [];
        const clients = Array.isArray(data.clients) ? data.clients : [];
        setConnections((prev) => ({ ...prev, aiLinked: tokens.length > 0 || clients.length > 0 }));
      } catch {
        // Keep the list usable if the status request fails.
      }
    };

    await Promise.all([loadWhatsapp(), loadAi()]);
    setIsLoading(false);
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ linked?: boolean }>).detail;
      if (typeof detail?.linked !== 'boolean') return;
      const linked = detail.linked;
      setConnections((prev) => ({
        ...prev,
        whatsappLinked: linked,
        whatsappPhone: linked ? prev.whatsappPhone : '',
      }));
    };
    window.addEventListener('jarvi:whatsapp-link-changed', handleChange);
    return () => window.removeEventListener('jarvi:whatsapp-link-changed', handleChange);
  }, []);

  return { connections, isLoading, reload };
}
