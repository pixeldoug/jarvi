import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usePostHog } from 'posthog-js/react';
import { trackRegistrationCompleted } from '../lib/openaiPixel';
import { shouldEmitProductAnalytics, shouldTrackProductUser } from '../lib/productAnalytics';

interface User {
  id: string;
  email: string;
  name: string;
  preferred_name?: string;
  avatar?: string;
  subscription_status?: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
  authProvider?: 'email' | 'google' | 'whatsapp';
  hasPassword?: boolean;
  onboardingCompletedAt?: string | null;
  whatsappVerified?: boolean;
  whatsappPhone?: string;
  emailVerified?: boolean;
}

interface RegisterMeta {
  fbc?: string;
  fbp?: string;
  eventId?: string;
  eventSourceUrl?: string;
}

interface LoginError extends Error {
  pendingVerification?: boolean;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (
    idToken: string,
    onboarding?: unknown,
    meta?: { fbc?: string; fbp?: string },
  ) => Promise<{ isNewUser: boolean }>;
  register: (email: string, name: string, password: string, meta?: RegisterMeta) => Promise<void>;
  acceptSession: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  addPasswordToGoogleAccount: (password: string) => Promise<void>;
  addEmailToWhatsappAccount: (email: string, password: string) => Promise<{ devCode?: string }>;
  verifyAddedEmail: (email: string, code: string) => Promise<void>;
  disconnectGoogle: () => Promise<void>;
  disconnectEmailLogin: () => Promise<void>;
  unlinkWhatsApp: () => Promise<void>;
  linkGoogleAccount: (idToken: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const posthog = usePostHog();

  const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

  useEffect(() => {
    // Check for existing token on app start
    const existingToken = localStorage.getItem('jarvi_token');
    if (existingToken) {
      setToken(existingToken);
      fetchUserProfile(existingToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUserProfile = async (authToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);

        if (posthog && shouldTrackProductUser(userData.email)) {
          posthog.identify(userData.email, {
            email: userData.email,
            name: userData.name,
            user_id: userData.id,
            subscription_status: userData.subscription_status ?? 'none',
          });
        }
      } else {
        // Token is invalid, remove it
        localStorage.removeItem('jarvi_token');
        setToken(null);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      localStorage.removeItem('jarvi_token');
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Check if email verification is pending
        if (data.pendingVerification) {
          const error = new Error(data.message || 'Email não verificado') as LoginError;
          error.pendingVerification = true;
          error.email = data.email;
          throw error;
        }
        throw new Error(data.error || 'Login failed');
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('jarvi_token', data.token);

      if (posthog && shouldTrackProductUser(data.user.email)) {
        posthog.identify(data.user.email, {
          email: data.user.email,
          name: data.user.name,
          user_id: data.user.id,
          subscription_status: data.user.subscription_status ?? 'none',
        });
        posthog.capture('user_logged_in', { method: 'email' });
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (
    idToken: string,
    onboarding?: unknown,
    meta?: { fbc?: string; fbp?: string },
  ) => {
    try {
      setIsLoading(true);
      const body: Record<string, unknown> = { idToken };
      if (onboarding) body.onboarding = onboarding;
      if (meta?.fbc) body.fbc = meta.fbc;
      if (meta?.fbp) body.fbp = meta.fbp;
      const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Google login failed');
      }

      const data = await response.json();
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('jarvi_token', data.token);

      if (posthog && shouldTrackProductUser(data.user.email)) {
        posthog.identify(data.user.email, {
          email: data.user.email,
          name: data.user.name,
          user_id: data.user.id,
          subscription_status: data.user.subscription_status ?? 'none',
        });
        posthog.capture('user_logged_in', { method: 'google' });
      }

      if (data.isNewUser) {
        trackRegistrationCompleted(data.user?.id ? `cr_${data.user.id}` : undefined);
      }

      return { isNewUser: Boolean(data.isNewUser) };
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    email: string,
    name: string,
    password: string,
    meta?: RegisterMeta,
  ): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          name,
          password,
          fbc: meta?.fbc,
          fbp: meta?.fbp,
          eventId: meta?.eventId,
          eventSourceUrl: meta?.eventSourceUrl,
        }),
      });

      const data = await response.json();

      if (data.pendingVerification) {
        const error = new Error(data.message || 'Verifique seu email para entrar.') as LoginError;
        error.pendingVerification = true;
        error.email = data.email;
        throw error;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      throw new Error('Não foi possível criar sua conta agora.');
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const persistSession = (nextToken: string, nextUser: User) => {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem('jarvi_token', nextToken);
  };

  const acceptSession = (nextToken: string, nextUser: User) => {
    persistSession(nextToken, nextUser);
    if (!posthog || !shouldTrackProductUser(nextUser.email)) return;
    const distinctId = nextUser.authProvider === 'whatsapp' ? nextUser.id : nextUser.email;
    if (!distinctId) return;
    posthog.identify(distinctId, {
      email: nextUser.email || undefined,
      name: nextUser.name,
      user_id: nextUser.id,
      auth_provider: nextUser.authProvider,
      subscription_status: nextUser.subscription_status ?? 'none',
    });
  };

  const logout = () => {
    if (posthog && shouldEmitProductAnalytics()) {
      posthog.capture('user_logged_out');
    }
    if (posthog) {
      posthog.reset();
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('jarvi_token');
    window.location.href = '/login';
  };

  const updateUser = (updates: Partial<User>) => {
    setUser((prevUser) => {
      if (!prevUser) return null;
      return { ...prevUser, ...updates };
    });
  };

  const addPasswordToGoogleAccount = async (password: string) => {
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    const response = await fetch(`${API_BASE_URL}/api/auth/google/add-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível criar a senha.');
    }
    setUser((prev) =>
      prev
        ? {
            ...prev,
            authProvider: (data.authProvider as User['authProvider']) || 'email',
            hasPassword: data.hasPassword ?? true,
          }
        : prev
    );
  };

  const disconnectGoogle = async () => {
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    const response = await fetch(`${API_BASE_URL}/api/auth/google/disconnect`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Não foi possível desvincular o Google.') as Error & {
        code?: string;
      };
      error.code = data.code;
      throw error;
    }
    if (data.user) {
      setUser(data.user as User);
    } else {
      setUser((prev) =>
        prev
          ? {
              ...prev,
              authProvider: (data.authProvider as User['authProvider']) || 'email',
              hasPassword: data.hasPassword ?? true,
            }
          : prev
      );
    }
  };

  const linkGoogleAccount = async (idToken: string) => {
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    const response = await fetch(`${API_BASE_URL}/api/auth/google/link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ idToken }),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Não foi possível vincular o Google.') as Error & {
        code?: string;
      };
      error.code = data.code;
      throw error;
    }
    setUser((prev) =>
      prev
        ? {
            ...prev,
            ...(data.user as Partial<User> | undefined),
            authProvider: (data.authProvider as User['authProvider']) || 'google',
          }
        : prev
    );
  };

  const addEmailToWhatsappAccount = async (email: string, password: string) => {
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    const response = await fetch(`${API_BASE_URL}/api/auth/whatsapp/add-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível adicionar o email.');
    }
    if (data.user) {
      setUser(data.user as User);
    } else {
      setUser((prev) => (prev ? { ...prev, email, hasPassword: true, emailVerified: false } : prev));
    }
    return { devCode: typeof data.devCode === 'string' ? data.devCode : undefined };
  };

  const verifyAddedEmail = async (email: string, code: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/verify-email-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível confirmar o email.');
    }
    if (data.user) {
      setUser({ ...(data.user as User), emailVerified: true });
    } else {
      setUser((prev) => (prev ? { ...prev, email, emailVerified: true } : prev));
    }
  };

  const disconnectEmailLogin = async () => {
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    const response = await fetch(`${API_BASE_URL}/api/auth/email`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível desconectar o email.');
    }
    if (data.user) {
      setUser(data.user as User);
    }
  };

  const unlinkWhatsApp = async () => {
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    const response = await fetch(`${API_BASE_URL}/api/users/whatsapp-link`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Não foi possível desvincular o WhatsApp.') as Error & {
        code?: string;
      };
      error.code = data.code;
      throw error;
    }
    if (data.user) {
      setUser(data.user as User);
    } else {
      setUser((prev) =>
        prev
          ? {
              ...prev,
              whatsappVerified: false,
              whatsappPhone: undefined,
              authProvider: prev.email ? (prev.authProvider === 'google' ? 'google' : 'email') : prev.authProvider,
            }
          : prev
      );
    }
    window.dispatchEvent(
      new CustomEvent('jarvi:whatsapp-link-changed', { detail: { linked: false } })
    );
  };

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    login,
    loginWithGoogle,
    register,
    acceptSession,
    logout,
    updateUser,
    addPasswordToGoogleAccount,
    addEmailToWhatsappAccount,
    verifyAddedEmail,
    disconnectGoogle,
    disconnectEmailLogin,
    unlinkWhatsApp,
    linkGoogleAccount,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
