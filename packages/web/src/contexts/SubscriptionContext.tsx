import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export type PlanType = 'monthly' | 'annual' | 'lifetime' | null;

interface SubscriptionStatus {
  status: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  isActive: boolean;
  trialExtended: boolean;
  planType: PlanType;
}

interface SubscriptionContextType {
  subscription: SubscriptionStatus | null;
  isLoading: boolean;
  error: string | null;
  refreshSubscription: () => Promise<void>;
  hasActiveSubscription: boolean;
  needsSubscription: boolean;
  daysLeftInTrial: number | null;
  trialExtended: boolean;
  trialExpired: boolean;
}

const defaultSubscription: SubscriptionStatus = {
  status: 'none',
  trialEndsAt: null,
  currentPeriodEnd: null,
  isActive: false,
  trialExtended: false,
  planType: null,
};

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

interface SubscriptionProviderProps {
  children: ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const queryClient = useQueryClient();
  const lastRefreshAt = useRef(0);

  const hasToken = !!localStorage.getItem('jarvi_token');

  const {
    data: subscription,
    isLoading,
    error: queryError,
  } = useQuery<SubscriptionStatus>({
    queryKey: ['subscription'],
    queryFn: async () => {
      const token = localStorage.getItem('jarvi_token');
      if (!token) return defaultSubscription;

      try {
        return await apiClient.get<SubscriptionStatus>('/api/subscriptions/status');
      } catch (err: any) {
        if (err?.status === 401) return defaultSubscription;
        throw err;
      }
    },
    enabled: hasToken,
    staleTime: 60_000,
    placeholderData: hasToken ? undefined : defaultSubscription,
  });

  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Unknown error') : null;

  // Refresh when backend returns 403 subscription_required
  useEffect(() => {
    const handleSubscriptionRequired = () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    };
    window.addEventListener('jarvi:subscription_required', handleSubscriptionRequired);
    return () => {
      window.removeEventListener('jarvi:subscription_required', handleSubscriptionRequired);
    };
  }, [queryClient]);

  // Refresh on tab focus / visibility change (with 5s throttle)
  useEffect(() => {
    const maybeRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshAt.current < 5000) return;
      lastRefreshAt.current = now;
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    };

    const handleFocus = () => maybeRefresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') maybeRefresh();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [queryClient]);

  const refreshSubscription = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['subscription'] });
  }, [queryClient]);

  const daysLeftInTrial = (() => {
    if (!subscription?.trialEndsAt || subscription.status !== 'trialing') return null;
    const trialEnd = new Date(subscription.trialEndsAt);
    const now = new Date();
    const diffTime = trialEnd.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  })();

  const hasActiveSubscription = subscription?.isActive ?? false;
  const needsSubscription = subscription?.status === 'none';
  const trialExtended = subscription?.trialExtended ?? false;
  const trialExpired =
    !hasActiveSubscription &&
    (subscription?.status === 'none' ||
      (subscription?.status === 'trialing' && daysLeftInTrial === 0));

  const value: SubscriptionContextType = {
    subscription: subscription ?? null,
    isLoading,
    error,
    refreshSubscription,
    hasActiveSubscription,
    needsSubscription,
    daysLeftInTrial,
    trialExtended,
    trialExpired,
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
