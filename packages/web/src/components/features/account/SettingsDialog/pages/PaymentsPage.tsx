/**
 * PaymentsPage - SettingsDialog
 *
 * "Pagamentos" tab: current plan info + upgrade cards.
 *
 * States:
 *  - Trial / None / Canceled: shows all 3 plan cards with "Assinar" CTA
 *  - Active: shows current plan name + "Gerenciar Plano" button (Stripe portal).
 *            Plan changes are handled entirely via the Stripe Billing Portal
 *            to avoid creating duplicate subscriptions.
 *
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App
 * Node: 40001319-31767 (active/paid state)
 */

import { Lightning } from '@phosphor-icons/react';
import { useAuth } from '../../../../../contexts/AuthContext';
import { useSubscription, type PlanType } from '../../../../../contexts/SubscriptionContext';
import { Button, Chip, Divider } from '../../../../ui';
import styles from '../SettingsDialog.module.css';

const BILLING_PORTAL_URL =
  import.meta.env.VITE_STRIPE_BILLING_PORTAL_URL ||
  'https://billing.stripe.com/p/login/4gw8xg46U6RdaRO288?locale=pt-br';

// ============================================================================
// PLAN DATA
// ============================================================================

const PAYMENT_URLS = {
  monthly:  import.meta.env.VITE_STRIPE_PAYMENT_LINK_URL        || '',
  annual:   import.meta.env.VITE_STRIPE_PAYMENT_LINK_YEARLY_URL  || '',
  lifetime: import.meta.env.VITE_STRIPE_PAYMENT_LINK_ONETIME_URL || '',
} as const;

const PLAN_DISPLAY_NAMES: Record<NonNullable<PlanType>, string> = {
  monthly:  'Mensal',
  annual:   'Anual',
  lifetime: 'Vitalício',
};

interface PlanOption {
  id: keyof typeof PAYMENT_URLS;
  title: string;
  chip: string | null;
  price: string;
  suffix: string | null;
  description: string;
}

/** Plans shown when the user has NO active subscription (trial / none). */
const PLANS_UPSELL: PlanOption[] = [
  {
    id: 'monthly',
    title: 'Mensal',
    chip: null,
    price: 'R$ 24,90',
    suffix: '/mês',
    description: 'Use o app sem restrições.',
  },
  {
    id: 'annual',
    title: 'Anual',
    chip: 'Economize 17%',
    price: 'R$ 20,75',
    suffix: '/mês',
    description: 'Equivale a R$ 249,00/ano',
  },
  {
    id: 'lifetime',
    title: 'Vitalício',
    chip: 'Melhor valor',
    price: 'R$ 398,00',
    suffix: null,
    description: 'Pagamento único, acesso para sempre.',
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export interface PaymentsPageProps {
  onClose: () => void;
}

export function PaymentsPage({ onClose: _onClose }: PaymentsPageProps) {
  const { user } = useAuth();
  const { subscription, hasActiveSubscription } = useSubscription();

  const buildPaymentUrl = (baseUrl: string) => {
    if (!baseUrl) return baseUrl;
    const url = new URL(baseUrl);
    if (user?.id) url.searchParams.set('client_reference_id', user.id);
    if (user?.email) url.searchParams.set('prefilled_email', user.email);
    return url.toString();
  };
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const planType = subscription?.planType ?? null;
  const planDisplayName = planType ? PLAN_DISPLAY_NAMES[planType] : null;

  // ── Active subscription ────────────────────────────────────────────────────
  if (hasActiveSubscription && subscription?.status === 'active') {
    const nextBilling = formatDate(subscription.currentPeriodEnd);

    return (
      <div className={styles.section}>
        <div>
          <p className={styles.sectionLabel}>Seu Plano</p>
          <p className={styles.planCurrentName} style={{ color: 'var(--semantic-content-info)' }}>
            {planDisplayName ?? 'Pro'}
          </p>
        </div>

        {nextBilling && (
          <p className={styles.sectionDescription}>
            Sua próxima cobrança acontecerá em {nextBilling}.
          </p>
        )}

        <div>
          <Button
            variant="secondary"
            size="small"
            onClick={() => window.open(BILLING_PORTAL_URL, '_blank', 'noopener,noreferrer')}
          >
            Gerenciar Plano
          </Button>
        </div>
      </div>
    );
  }

  // ── Trial / None / Past Due / Canceled ─────────────────────────────────────
  const getPlanInfo = () => {
    switch (subscription?.status) {
      case 'trialing':
        return {
          name: 'Gratuito',
          description: subscription?.trialEndsAt
            ? `Seu período de teste gratuito termina em ${formatDate(subscription.trialEndsAt)}.`
            : null,
        };
      case 'past_due':
        return { name: 'Pagamento pendente', description: 'Atualize seu método de pagamento.' };
      case 'canceled':
        return { name: 'Cancelado', description: 'Seu plano foi cancelado.' };
      default:
        return { name: 'Gratuito', description: null };
    }
  };

  const planInfo = getPlanInfo();

  return (
    <>
      {/* Current plan */}
      <div className={styles.section}>
        <div>
          <p className={styles.sectionLabel}>Seu Plano</p>
          <p className={styles.planCurrentName}>{planInfo.name}</p>
        </div>
        {planInfo.description && (
          <p className={styles.sectionDescription}>{planInfo.description}</p>
        )}
      </div>

      <Divider />

      {/* Upgrade section */}
      <p className={styles.upgradeTitle}>Mude para o plano pro</p>

      <div className={styles.plansGrid}>
        {PLANS_UPSELL.map((plan) => (
          <div key={plan.id} className={styles.planCard}>
            <div className={styles.planCardInfo}>
              <div className={styles.planTitleRow}>
                <p className={styles.planCardTitle}>{plan.title}</p>
                {plan.chip && (
                  <Chip label={plan.chip} size="small" className={styles.chipAccent} />
                )}
              </div>

              <div className={styles.planPriceBlock}>
                <p className={styles.planPrice}>
                  <span className={styles.planPriceMain}>{plan.price}</span>
                  {plan.suffix && (
                    <span className={styles.planPriceSuffix}>{plan.suffix}</span>
                  )}
                </p>
                <p className={styles.planCardDescription}>{plan.description}</p>
              </div>
            </div>

            <Button
              variant="secondary"
              icon={Lightning}
              iconPosition="left"
              fullWidth
              onClick={() => window.open(buildPaymentUrl(PAYMENT_URLS[plan.id]), '_blank', 'noopener,noreferrer')}
            >
              Assinar
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}
