import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { subscriptionApi } from '@/api/endpoints';
import { appEvents } from '@/lib/events';
import type { SubscriptionInfo } from '@/types/models';

const subscriptionKey = ['subscription'] as const;

export function daysLeftInTrial(info: SubscriptionInfo | undefined, now: Date = new Date()): number | null {
  if (!info?.trialEndsAt || info.status !== 'trialing') return null;
  const diff = new Date(info.trialEndsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

/** Same rule as the web TrialExpiredGate: no active plan and no trial days left. */
export function isTrialExpired(info: SubscriptionInfo | undefined, now: Date = new Date()): boolean {
  if (!info || info.isActive) return false;
  return info.status === 'none' || (info.status === 'trialing' && daysLeftInTrial(info, now) === 0);
}

export function useSubscription() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: subscriptionKey, queryFn: subscriptionApi.status, staleTime: 5 * 60_000 });

  useEffect(
    () => appEvents.on('subscription_required', () => void queryClient.invalidateQueries({ queryKey: subscriptionKey })),
    [queryClient],
  );

  return {
    ...query,
    daysLeft: daysLeftInTrial(query.data),
    // The backend only enforces plans in production; mirror that in dev builds.
    trialExpired: !__DEV__ && isTrialExpired(query.data),
    refresh: () => queryClient.invalidateQueries({ queryKey: subscriptionKey }),
  };
}
