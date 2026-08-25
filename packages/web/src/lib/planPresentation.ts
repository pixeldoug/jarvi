export type PlanType = 'monthly' | 'annual' | 'lifetime' | null;

export interface SubscriptionSnapshot {
  status: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  isActive?: boolean;
  trialExtended?: boolean;
  planType?: PlanType;
}

export interface PlanPresentation {
  sidebarLabel: string;
  paymentsName: string;
  paymentsDescription: string | null;
  isPro: boolean;
  isTrialing: boolean;
  isTrialExpired: boolean;
  daysLeft: number | null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isSubscriptionCurrentlyActive(
  subscription: SubscriptionSnapshot | null | undefined,
): boolean {
  if (!subscription) return false;
  if (subscription.status === 'active') return true;
  if (subscription.status !== 'trialing') return false;
  const trialEnd = parseDate(subscription.trialEndsAt);
  return !!trialEnd && trialEnd.getTime() > Date.now();
}

export function getDaysLeftInTrial(
  subscription: SubscriptionSnapshot | null | undefined,
): number | null {
  if (!subscription?.trialEndsAt || subscription.status !== 'trialing') return null;
  const trialEnd = parseDate(subscription.trialEndsAt);
  if (!trialEnd) return null;
  const diffTime = trialEnd.getTime() - Date.now();
  if (diffTime <= 0) return 0;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatPtDate(value: string | null | undefined): string | null {
  const date = parseDate(value);
  if (!date) return null;
  return date.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function getPlanPresentation(
  subscription: SubscriptionSnapshot | null | undefined,
): PlanPresentation {
  const isPro = subscription?.status === 'active';
  const daysLeft = getDaysLeftInTrial(subscription);
  const trialStillActive = isSubscriptionCurrentlyActive(subscription) && subscription?.status === 'trialing';
  const isTrialExpired =
    !isPro &&
    !trialStillActive &&
    (subscription?.status === 'none' || subscription?.status === 'trialing');

  if (isPro) {
    return {
      sidebarLabel: 'Plano Pro',
      paymentsName: 'Pro',
      paymentsDescription: subscription?.currentPeriodEnd
        ? `Sua próxima cobrança acontecerá em ${formatPtDate(subscription.currentPeriodEnd)}.`
        : null,
      isPro: true,
      isTrialing: false,
      isTrialExpired: false,
      daysLeft: null,
    };
  }

  if (subscription?.status === 'past_due') {
    return {
      sidebarLabel: 'Pagamento pendente',
      paymentsName: 'Pagamento pendente',
      paymentsDescription: 'Atualize seu método de pagamento.',
      isPro: false,
      isTrialing: false,
      isTrialExpired: false,
      daysLeft: null,
    };
  }

  if (subscription?.status === 'canceled') {
    return {
      sidebarLabel: 'Plano cancelado',
      paymentsName: 'Cancelado',
      paymentsDescription: 'Seu plano foi cancelado.',
      isPro: false,
      isTrialing: false,
      isTrialExpired: false,
      daysLeft: null,
    };
  }

  if (trialStillActive && daysLeft !== null && daysLeft > 0) {
    const endsAt = formatPtDate(subscription?.trialEndsAt);
    return {
      sidebarLabel: `${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} para testar`,
      paymentsName: 'Gratuito',
      paymentsDescription: endsAt
        ? `Seu período de teste gratuito termina em ${endsAt}.`
        : 'Você está no período de teste gratuito.',
      isPro: false,
      isTrialing: true,
      isTrialExpired: false,
      daysLeft,
    };
  }

  if (isTrialExpired) {
    const endedAt = formatPtDate(subscription?.trialEndsAt);
    return {
      sidebarLabel: 'Plano Gratuito',
      paymentsName: 'Gratuito',
      paymentsDescription: endedAt
        ? `Seu período de teste encerrou em ${endedAt}.`
        : 'Você está no plano gratuito.',
      isPro: false,
      isTrialing: false,
      isTrialExpired: true,
      daysLeft: 0,
    };
  }

  return {
    sidebarLabel: 'Plano Gratuito',
    paymentsName: 'Gratuito',
    paymentsDescription: null,
    isPro: false,
    isTrialing: false,
    isTrialExpired: false,
    daysLeft: null,
  };
}

export function isTaskCompleted(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function hasVisibleTaskTitle(title: unknown): boolean {
  return typeof title === 'string' && title.trim().length > 0;
}
