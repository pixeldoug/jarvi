import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import { subscriptionApi } from '@/api/endpoints';
import { appEvents } from '@/lib/events';
import type { SubscriptionInfo } from '@/types/models';

const subscriptionKey = ['subscription'] as const;

/**
 * A request was refused with `subscription_required`: that server enforces
 * plans, whatever this build is (a dev build can point at staging). Cleared
 * once the status says the plan is active again.
 */
let blockedByServer = false;
const blockedListeners = new Set<() => void>();

function setBlockedByServer(value: boolean) {
  if (blockedByServer === value) return;
  blockedByServer = value;
  blockedListeners.forEach((listener) => listener());
}

appEvents.on('subscription_required', () => setBlockedByServer(true));

function subscribeBlocked(listener: () => void) {
  blockedListeners.add(listener);
  return () => {
    blockedListeners.delete(listener);
  };
}

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
  const blocked = useSyncExternalStore(subscribeBlocked, () => blockedByServer);
  const isActive = query.data?.isActive;

  useEffect(() => {
    if (isActive) setBlockedByServer(false);
  }, [isActive]);

  useEffect(
    () => appEvents.on('subscription_required', () => void queryClient.invalidateQueries({ queryKey: subscriptionKey })),
    [queryClient],
  );

  return {
    ...query,
    daysLeft: daysLeftInTrial(query.data),
    // Local backends skip the paywall, so a dev build only gates once the server refuses a request.
    trialExpired: blocked ? !isActive : !__DEV__ && isTrialExpired(query.data),
    /** Refetches the status and returns it. */
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: subscriptionKey });
      return queryClient.getQueryData<SubscriptionInfo>(subscriptionKey);
    },
  };
}
