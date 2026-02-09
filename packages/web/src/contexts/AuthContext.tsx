import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usePostHog } from 'posthog-js/react';

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  subscription_status?: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
  authProvider?: 'email' | 'google';
  hasPassword?: boolean;
}

interface RegisterResult {
  pendingVerification: boolean;
  email: string;
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
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<RegisterResult>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
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

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
        
        // Identificar usuário no PostHog (apenas em produção)
        if (posthog && import.meta.env.PROD) {
          posthog.identify(userData.email, {
            email: userData.email,
            name: userData.name,
            user_id: userData.id,
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

      // Identificar usuário no PostHog (apenas em produção)
      if (posthog && import.meta.env.PROD) {
        posthog.identify(data.user.email, {
          email: data.user.email,
          name: data.user.name,
          user_id: data.user.id,
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (idToken: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Google login failed');
      }

      const data = await response.json();
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('jarvi_token', data.token);

      // Identificar usuário no PostHog (apenas em produção)
      if (posthog && import.meta.env.PROD) {
        posthog.identify(data.user.email, {
          email: data.user.email,
          name: data.user.name,
          user_id: data.user.id,
        });
      }
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, name: string, password: string): Promise<RegisterResult> => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, name, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Registration now returns pendingVerification instead of token
      if (data.pendingVerification) {
        return {
          pendingVerification: true,
          email: data.email,
        };
      }

      // Fallback for old behavior (shouldn't happen with new backend)
      if (data.token) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('jarvi_token', data.token);

        if (posthog && import.meta.env.PROD) {
          posthog.identify(data.user.email, {
            email: data.user.email,
            name: data.user.name,
            user_id: data.user.id,
          });
        }
      }

      return {
        pendingVerification: data.pendingVerification || false,
        email: data.email || email,
      };
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('jarvi_token');
    // Force redirect to login page
    window.location.href = '/login';
  };

  const updateUser = (updates: Partial<User>) => {
    setUser((prevUser) => {
      if (!prevUser) return null;
      return { ...prevUser, ...updates };
    });
  };

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    login,
    loginWithGoogle,
    register,
    logout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
