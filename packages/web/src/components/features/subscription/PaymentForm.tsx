import { useState } from 'react';
import {
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import type { StripeCardElementChangeEvent } from '@stripe/stripe-js';
import { Button } from '../../ui/Button/Button';
import { Lock } from '@phosphor-icons/react';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import styles from './PaymentForm.module.css';

interface PaymentFormProps {
  onSuccess: (subscriptionId: string) => void;
  onError?: (error: string) => void;
}

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: 'var(--semantic-control-content)',
      '::placeholder': {
        color: 'var(--semantic-control-content-placeholder)',
      },
    },
    invalid: {
      color: 'var(--semantic-content-negative)',
    },
  },
  hidePostalCode: true,
};

export function PaymentForm({ onSuccess, onError }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { subscription, daysLeftInTrial, refreshSubscription } = useSubscription();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardFocused, setCardFocused] = useState(false);
  const [cardError, setCardError] = useState(false);
  const [promotionCode, setPromotionCode] = useState('');

  const isInTrial = subscription?.status === 'trialing' && !!subscription.trialEndsAt;
  const trialEndsAtDate = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
  const formattedTrialEnd =
    trialEndsAtDate && !Number.isNaN(trialEndsAtDate.getTime())
      ? trialEndsAtDate.toLocaleDateString('pt-BR')
      : null;

  const handleCardChange = (event: StripeCardElementChangeEvent) => {
    setCardError(!!event.error);
    if (event.error) {
      setError(event.error.message);
    } else {
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setError('Stripe has not loaded yet. Please try again.');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError('Card element not found.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create payment method
      const { paymentMethod, error: stripeError } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      if (!paymentMethod) {
        throw new Error('Failed to create payment method');
      }

      // Send to backend to create subscription
      const token = localStorage.getItem('jarvi_token');
      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api/subscriptions/create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            paymentMethodId: paymentMethod.id,
            ...(promotionCode.trim() ? { promotionCode: promotionCode.trim() } : {}),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to create subscription');
      }

      // If the backend returned a client secret, we need to confirm the payment (SCA/on-session).
      if (data.clientSecret) {
        const { error: confirmError } = await stripe.confirmCardPayment(data.clientSecret, {
          payment_method: paymentMethod.id,
        });

        if (confirmError) {
          throw new Error(confirmError.message || 'Falha ao confirmar o pagamento');
        }
      }

      // Refresh subscription to sync DB status (backend will reconcile with Stripe)
      await refreshSubscription();
      onSuccess(data.subscription.id);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.trialInfo}>
        <p className={styles.trialText}>
          {isInTrial ? (
            <>
              Voce esta no periodo gratuito
              {typeof daysLeftInTrial === 'number' ? ` (${daysLeftInTrial} dia(s) restantes)` : ''}.
              {formattedTrialEnd
                ? ` Adicione seu cartao ate ${formattedTrialEnd} para continuar usando o Jarvi.`
                : ' Adicione seu cartao ao final do periodo gratuito para continuar usando o Jarvi.'}
            </>
          ) : (
            <>Adicione seu cartao para continuar usando o Jarvi. Se voce recebeu um cupom do beta, informe abaixo antes de confirmar.</>
          )}
        </p>
      </div>

      <div className={styles.couponWrapper}>
        <label className={styles.label} htmlFor="promotion-code">
          Cupom de desconto
        </label>
        <input
          id="promotion-code"
          className={styles.couponInput}
          type="text"
          value={promotionCode}
          onChange={(event) => setPromotionCode(event.target.value)}
          placeholder="Ex: BETA6MESES"
          autoComplete="off"
          disabled={isLoading}
        />
        <p className={styles.couponHelp}>
          Opcional. Use o cupom recebido no convite do beta fechado.
        </p>
      </div>

      <div className={styles.cardWrapper}>
        <label className={styles.label}>Cartao de credito</label>
        <div
          className={`${styles.cardContainer} ${cardFocused ? styles.focused : ''} ${cardError ? styles.error : ''}`}
        >
          <CardElement
            className={styles.cardElement}
            options={CARD_ELEMENT_OPTIONS}
            onChange={handleCardChange}
            onFocus={() => setCardFocused(true)}
            onBlur={() => setCardFocused(false)}
          />
        </div>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="medium"
        fullWidth
        disabled={!stripe || isLoading}
        loading={isLoading}
        className={styles.submitButton}
      >
        {isLoading ? 'Processando...' : isInTrial ? 'Adicionar cartao e cupom' : 'Assinar Jarvi Pro'}
      </Button>

      <div className={styles.secureInfo}>
        <Lock className={styles.lockIcon} weight="fill" />
        <span>Pagamento seguro processado pelo Stripe</span>
      </div>
    </form>
  );
}
