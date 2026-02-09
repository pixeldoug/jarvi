import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { Check, CheckCircle } from '@phosphor-icons/react';
import { PaymentForm } from '../../components/features/subscription/PaymentForm';
import { Button } from '../../components/ui/Button/Button';
import { Logo } from '../../components/ui/Logo/Logo';
import { useSubscription } from '../../contexts/SubscriptionContext';
import styles from './Subscribe.module.css';

// Initialize Stripe
const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
);

const FEATURES = [
  'Gerenciamento ilimitado de tarefas',
  'Notas com markdown e colaboracao',
  'Controle financeiro completo',
  'Rastreamento de habitos',
  'Sincronizacao entre dispositivos',
  'Suporte prioritario',
];

export default function SubscribePage() {
  const navigate = useNavigate();
  const [isSuccess, setIsSuccess] = useState(false);
  const { subscription, daysLeftInTrial } = useSubscription();

  const handleSuccess = (subscriptionId: string) => {
    console.log('Subscription created:', subscriptionId);
    setIsSuccess(true);
  };

  const handleContinue = () => {
    navigate('/tasks');
  };

  if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Stripe nao configurado</h1>
            <p className={styles.subtitle}>
              Configure a variavel VITE_STRIPE_PUBLISHABLE_KEY para habilitar pagamentos.
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/tasks')}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {isSuccess ? (
          <>
            <div className={styles.success}>
              <CheckCircle className={styles.successIcon} weight="fill" />
              <h2 className={styles.successTitle}>Tudo pronto!</h2>
              <p className={styles.successText}>
                Seu pagamento foi configurado com sucesso. Se voce ainda estiver no periodo gratuito,
                a cobranca comeca automaticamente ao final dele.
              </p>
            </div>
            <Button variant="primary" fullWidth onClick={handleContinue}>
              Comecar a usar o Jarvi
            </Button>
          </>
        ) : (
          <>
            <div className={styles.header}>
              <Logo className={styles.logo} />
              <h1 className={styles.title}>Assine o Jarvi Pro</h1>
              <p className={styles.subtitle}>
                Desbloqueie todo o potencial da sua produtividade
              </p>
            </div>

            <div className={styles.pricing}>
              <div className={styles.priceRow}>
                <span className={styles.currency}>R$</span>
                <span className={styles.price}>29</span>
                <span className={styles.period}>/mes</span>
              </div>
              <span className={styles.billingNote}>
                {subscription?.status === 'trialing'
                  ? `Voce tem ${daysLeftInTrial ?? 0} dia(s) restantes no periodo gratuito`
                  : 'Cobrado mensalmente'}
              </span>
            </div>

            <div className={styles.features}>
              {FEATURES.map((feature, index) => (
                <div key={index} className={styles.featureItem}>
                  <Check className={styles.checkIcon} weight="bold" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <div className={styles.divider} />

            <Elements stripe={stripePromise}>
              <PaymentForm onSuccess={handleSuccess} />
            </Elements>

            <div className={styles.footer}>
              <p className={styles.footerText}>
                Ao continuar, voce concorda com nossos{' '}
                <a href="/terms" className={styles.footerLink}>
                  Termos de Servico
                </a>{' '}
                e{' '}
                <a href="/privacy" className={styles.footerLink}>
                  Politica de Privacidade
                </a>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
