/**
 * TrialExpiredGate
 *
 * Full-screen persistent gate shown when a user's trial has expired.
 * Cannot be dismissed — the user must upgrade or use the 1-day extension.
 *
 * State 1 (trial_extended = false):
 *   "Seu trial expirou mas você não precisa parar por aqui."
 *   + ghost CTA "Experimentar por mais 1 dia grátis"
 *
 * State 2 (trial_extended = true):
 *   "Agora é hora de continuar de verdade!"
 *   No extension CTA.
 *
 * Figma (state 1): https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001403-109756
 * Figma (state 2): https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001403-109827
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Lightning } from '@phosphor-icons/react';
import { useSubscription } from '../../../../contexts/SubscriptionContext';
import { apiClient } from '../../../../lib/apiClient';
import { Button, Chip } from '../../../ui';
import styles from './TrialExpiredGate.module.css';

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

export function TrialExpiredGate() {
  const { trialExpired, trialExtended, refreshSubscription } = useSubscription();
  const [isExtending, setIsExtending] = useState(false);

  if (!trialExpired) return null;

  const handleExtendTrial = async () => {
    setIsExtending(true);
    try {
      await apiClient.post('/api/subscriptions/extend-trial');
      await refreshSubscription();
    } catch {
      // If extension already used or error, just refresh — gate will update
      await refreshSubscription();
    } finally {
      setIsExtending(false);
    }
  };

  const heading = trialExtended
    ? 'Agora é hora de continuar de verdade!'
    : 'Seu trial expirou mas você não precisa parar por aqui.';

  const body = trialExtended
    ? 'Seu tempo extra acabou. Para continuar usando o Jarvi, escolha um plano.'
    : 'Com o Plano Pro você continua com acesso completo ao assistente de IA, categorias, filtros e tudo mais que você estava usando.';

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Trial expirado">
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>{heading}</h2>
          <p className={styles.description}>{body}</p>
        </div>

        {/* Plan cards */}
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
                onClick={() =>
                  window.open(PAYMENT_URLS[plan.id], '_blank', 'noopener,noreferrer')
                }
              >
                Assinar
              </Button>
            </div>
          ))}
        </div>

        {/* 1-day extension CTA — only on first expiry */}
        {!trialExtended && (
          <Button
            variant="ghost"
            size="medium"
            iconPosition="none"
            disabled={isExtending}
            onClick={handleExtendTrial}
          >
            {isExtending ? 'Aguarde...' : 'Experimentar por mais 1 dia grátis'}
          </Button>
        )}
      </div>
    </div>,
    document.body
  );
}
