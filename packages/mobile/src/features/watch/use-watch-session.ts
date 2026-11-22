import { useEffect } from 'react';

import { API_URL, getSessionToken } from '@/api/client';
import type { AuthStatus } from '@/auth/auth-provider';
import { shareSessionWithWatch } from '../../../modules/jarvi-watch';

/**
 * Keeps the Apple Watch app (targets/watch) on this session: it gets the token
 * on sign-in and every launch, and forgets it on sign-out. While loading or
 * offline the watch keeps what it has. A watch app installed later gets the
 * last session from the native side (WatchSessionBridge).
 */
export function useWatchSession(status: AuthStatus): void {
  useEffect(() => {
    if (status === 'signedIn') shareSessionWithWatch(getSessionToken(), API_URL);
    else if (status === 'signedOut') shareSessionWithWatch(null, API_URL);
  }, [status]);
}
