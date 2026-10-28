import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

import { ApiError, setSessionToken } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { appEvents } from '@/lib/events';
import { STORAGE_KEYS, storage } from '@/lib/storage';
import type { AuthSession, User } from '@/types/models';
import { signOutOfGoogle } from './google';

/**
 * `offline`: a stored session exists but the profile could not be loaded
 * (no network, backend down). The session is kept so a retry can resume it.
 */
type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'offline';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  acceptSession: (session: AuthSession) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type RestoredSession = { status: 'signedOut' } | { status: 'offline' } | { status: 'signedIn'; user: User };

/** Loads the stored session and its profile. Touches storage, never React state. */
async function restoreSession(): Promise<RestoredSession> {
  const token = await storage.get(STORAGE_KEYS.token);
  if (!token) return { status: 'signedOut' };
  setSessionToken(token);
  try {
    return { status: 'signedIn', user: await authApi.profile() };
  } catch (error) {
    // 401/403: missing or expired token. 404: the account was deleted.
    if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404)) {
      setSessionToken(null);
      await storage.remove(STORAGE_KEYS.token);
      return { status: 'signedOut' };
    }
    return { status: 'offline' };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  // Bumped by `retry` to re-run the restore effect.
  const [attempt, setAttempt] = useState(0);

  const clearSession = useCallback(async () => {
    setSessionToken(null);
    setUser(null);
    setStatus('signedOut');
    queryClient.clear();
    await storage.remove(STORAGE_KEYS.token);
  }, [queryClient]);

  useEffect(() => {
    let active = true;
    void restoreSession().then((result) => {
      if (!active) return;
      setUser(result.status === 'signedIn' ? result.user : null);
      setStatus(result.status);
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => appEvents.on('unauthorized', () => void clearSession()), [clearSession]);

  const acceptSession = useCallback(
    async (session: AuthSession) => {
      queryClient.clear();
      setSessionToken(session.token);
      await storage.set(STORAGE_KEYS.token, session.token);
      setUser(session.user);
      setStatus('signedIn');
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await signOutOfGoogle();
    await clearSession();
  }, [clearSession]);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  return (
    <AuthContext
      value={{
        status,
        user,
        acceptSession,
        signOut,
        updateUser,
        retry: () => {
          setStatus('loading');
          setAttempt((count) => count + 1);
        },
      }}
    >
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

/** For screens inside the signed-in stack, where a user always exists. */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser called without a signed-in user');
  return user;
}
