import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import {
  getDaysLeftInTrial,
  getPlanPresentation,
  isSubscriptionCurrentlyActive,
  type PlanType,
} from '../lib/planPresentation';

export type { PlanType };

const TRIAL_GATE_DISMISSED_KEY = 'jarvi_trial_gate_dismissed';

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
  trialGateDismissed: boolean;
  dismissTrialGate: () => void;
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
  const [trialGateDismissed, setTrialGateDismissed] = useState(() => {
    try {
      return localStorage.getItem(TRIAL_GATE_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('jarvi_token');

  const query = useQuery<SubscriptionStatus>({
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

  const { data: subscription, isLoading, error: queryError } = query;

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

  const daysLeftInTrial = getDaysLeftInTrial(subscription);
  const hasActiveSubscription = isSubscriptionCurrentlyActive(subscription);
  const needsSubscription = subscription?.status === 'none';
  const trialExtended = subscription?.trialExtended ?? false;
  const plan = getPlanPresentation(subscription);

  // Only treat the user as "trial expired" when we have REAL data from the
  // server and the user is actually authenticated. Without these guards, the
  // paywall flashes right after SPA login because the React Context value
  // provided to consumers (TrialExpiredGate) is still from the pre-login
  // render, where `placeholderData` returned a synthetic `status:'none'`.
  const hasRealData = !query.isPlaceholderData && query.dataUpdatedAt > 0;
  const trialExpired = hasToken && hasRealData && plan.isTrialExpired && !hasActiveSubscription;

  const dismissTrialGate = useCallback(() => {
    setTrialGateDismissed(true);
    try {
      localStorage.setItem(TRIAL_GATE_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

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
    trialGateDismissed,
    dismissTrialGate,
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
