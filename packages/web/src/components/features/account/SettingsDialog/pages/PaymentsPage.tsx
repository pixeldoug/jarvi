/**
 * PaymentsPage - SettingsDialog
 *
 * "Pagamentos" tab: current plan info + upgrade cards (Mensal / Anual / Vitalício).
 *
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App
 * Node: 40001319-21233
 */

import { Lightning } from '@phosphor-icons/react';
import { useSubscription } from '../../../../../contexts/SubscriptionContext';
import { Button, Chip, Divider } from '../../../../ui';
import styles from '../SettingsDialog.module.css';

// ============================================================================
// PLAN DATA
// ============================================================================

const PAYMENT_URLS = {
  monthly:  import.meta.env.VITE_STRIPE_PAYMENT_LINK_URL        || '',
  annual:   import.meta.env.VITE_STRIPE_PAYMENT_LINK_YEARLY_URL  || '',
  lifetime: import.meta.env.VITE_STRIPE_PAYMENT_LINK_ONETIME_URL || '',
} as const;

interface PlanOption {
  id: keyof typeof PAYMENT_URLS;
  title: string;
  chip: string | null;
  price: string;
  suffix: string | null;
  description: string;
}

const PLANS: PlanOption[] = [
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
  const { subscription } = useSubscription();

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getPlanInfo = () => {
    switch (subscription?.status) {
      case 'active':
        return {
          name: 'Jarvi Plus',
          description: subscription?.currentPeriodEnd
            ? `Seu plano renovará automaticamente em ${formatDate(subscription.currentPeriodEnd)}.`
            : null,
        };
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
        {PLANS.map((plan) => (
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
              onClick={() => window.open(PAYMENT_URLS[plan.id], '_blank', 'noopener,noreferrer')}
            >
              Assinar
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}
