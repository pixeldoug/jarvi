import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

interface SubscriptionStatus {
  status: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  isActive: boolean;
}

interface SubscriptionContextType {
  subscription: SubscriptionStatus | null;
  isLoading: boolean;
  error: string | null;
  refreshSubscription: () => Promise<void>;
  hasActiveSubscription: boolean;
  needsSubscription: boolean;
  daysLeftInTrial: number | null;
}

const defaultSubscription: SubscriptionStatus = {
  status: 'none',
  trialEndsAt: null,
  currentPeriodEnd: null,
  isActive: false,
};

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

interface SubscriptionProviderProps {
  children: ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptionStatus = useCallback(async () => {
    const token = localStorage.getItem('jarvi_token');
    
    if (!token) {
      setSubscription(defaultSubscription);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/subscriptions/status`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid
          setSubscription(defaultSubscription);
          return;
        }
        throw new Error('Failed to fetch subscription status');
      }

      const data = await response.json();
      setSubscription(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching subscription:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSubscription(defaultSubscription);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);

  // Refresh subscription when the user returns to the tab/window (e.g., after Stripe checkout).
  useEffect(() => {
    let lastRefreshAt = 0;

    const maybeRefresh = () => {
      const now = Date.now();
      // Avoid spamming requests on rapid focus/visibility changes.
      if (now - lastRefreshAt < 5000) return;
      lastRefreshAt = now;
      void fetchSubscriptionStatus();
    };

    const handleFocus = () => {
      maybeRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        maybeRefresh();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchSubscriptionStatus]);

  const refreshSubscription = useCallback(async () => {
    setIsLoading(true);
    await fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);

  // Calculate days left in trial
  const daysLeftInTrial = (() => {
    if (!subscription?.trialEndsAt || subscription.status !== 'trialing') {
      return null;
    }
    
    const trialEnd = new Date(subscription.trialEndsAt);
    const now = new Date();
    const diffTime = trialEnd.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  })();

  const hasActiveSubscription = subscription?.isActive ?? false;
  const needsSubscription = subscription?.status === 'none';

  const value: SubscriptionContextType = {
    subscription,
    isLoading,
    error,
    refreshSubscription,
    hasActiveSubscription,
    needsSubscription,
    daysLeftInTrial,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  
  return context;
}
