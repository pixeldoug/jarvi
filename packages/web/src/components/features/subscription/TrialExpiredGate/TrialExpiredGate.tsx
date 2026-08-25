/**
 * TrialExpiredGate
 *
 * Upsell shown when a user's trial has expired. Dismissible so a free-plan
 * user can keep using the app; Browser Esc, overlay click, and the close
 * control all dismiss it.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lightning, X } from '@phosphor-icons/react';
import { useAuth } from '../../../../contexts/AuthContext';
import { useSubscription } from '../../../../contexts/SubscriptionContext';
import { apiClient } from '../../../../lib/apiClient';
import { Button, Chip } from '../../../ui';
import styles from './TrialExpiredGate.module.css';

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

export function TrialExpiredGate() {
  const { user } = useAuth();
  const { trialExpired, trialExtended, trialGateDismissed, dismissTrialGate, refreshSubscription } =
    useSubscription();
  const [isExtending, setIsExtending] = useState(false);

  const buildPaymentUrl = (baseUrl: string) => {
    if (!baseUrl) return baseUrl;
    const url = new URL(baseUrl);
    if (user?.id) url.searchParams.set('client_reference_id', user.id);
    if (user?.email) url.searchParams.set('prefilled_email', user.email);
    return url.toString();
  };

  const visible = trialExpired && !trialGateDismissed;

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissTrialGate();
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [visible, dismissTrialGate]);

  if (!visible) return null;

  const handleExtendTrial = async () => {
    setIsExtending(true);
    try {
      await apiClient.post('/api/subscriptions/extend-trial');
      await refreshSubscription();
    } catch {
      await refreshSubscription();
    } finally {
      setIsExtending(false);
    }
  };

  const heading = trialExtended
    ? 'Agora é hora de continuar de verdade!'
    : 'Seu trial expirou mas você não precisa parar por aqui.';

  const body = trialExtended
    ? 'Seu tempo extra acabou. Você pode continuar no plano gratuito ou escolher um plano Pro.'
    : 'Com o Plano Pro você continua com acesso completo ao assistente de IA. No plano gratuito você segue criando e organizando tarefas.';

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Trial expirado"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismissTrialGate();
      }}
    >
      <div className={styles.card}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={dismissTrialGate}
          aria-label="Fechar"
        >
          <X size={20} weight="regular" />
        </button>

        <div className={styles.header}>
          <h2 className={styles.title}>{heading}</h2>
          <p className={styles.description}>{body}</p>
        </div>

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
                  window.open(buildPaymentUrl(PAYMENT_URLS[plan.id]), '_blank', 'noopener,noreferrer')
                }
              >
                Assinar
              </Button>
            </div>
          ))}
        </div>

        <div className={styles.footerActions}>
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
          <Button
            variant="ghost"
            size="medium"
            iconPosition="none"
            onClick={dismissTrialGate}
          >
            Continuar no plano gratuito
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
