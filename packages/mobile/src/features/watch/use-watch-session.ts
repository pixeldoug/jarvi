import { useEffect } from 'react';

import { API_URL, getSessionToken } from '@/api/client';
import type { AuthStatus } from '@/auth/auth-provider';
import { useLocale } from '@/i18n/hooks';
import { shareSessionWithWatch } from '../../../modules/jarvi-watch';

/**
 * Keeps the Apple Watch app (targets/watch) on this session: it gets the token
 * on sign-in and every launch, and forgets it on sign-out. While loading or
 * offline the watch keeps what it has. A watch app installed later gets the
 * last session from the native side (WatchSessionBridge).
 *
 * The app's language goes along: the watch transcribes speech in it, whatever
 * language the watch itself is set to (an English watch must not turn
 * Portuguese speech into English titles).
 */
export function useWatchSession(status: AuthStatus): void {
  const locale = useLocale();
  useEffect(() => {
    if (status === 'signedIn') shareSessionWithWatch(getSessionToken(), API_URL, locale);
    else if (status === 'signedOut') shareSessionWithWatch(null, API_URL, locale);
  }, [status, locale]);
}
