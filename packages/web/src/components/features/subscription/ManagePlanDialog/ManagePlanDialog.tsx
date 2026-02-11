/**
 * ManagePlanDialog - Jarvi Web
 *
 * Dialog for managing subscription plan (Figma node: 40000599:3214)
 * Replaces the old /subscribe full-page checkout UI.
 */

import { Lightning, CaretLeft } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useSubscription } from '../../../../contexts/SubscriptionContext';
import { Button, Dialog, Divider, toast } from '../../../ui';
import styles from './ManagePlanDialog.module.css';

export interface ManagePlanDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDatePtBr(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function ManagePlanDialog({ isOpen, onClose }: ManagePlanDialogProps) {
  const { subscription, isLoading } = useSubscription();

  const paymentLinkUrl = (import.meta.env.VITE_STRIPE_PAYMENT_LINK_URL as string | undefined)?.trim();
  const canUpgrade = Boolean(paymentLinkUrl);

  const formattedTrialEnd = useMemo(
    () => formatDatePtBr(subscription?.trialEndsAt),
    [subscription?.trialEndsAt]
  );

  const formattedCurrentPeriodEnd = useMemo(
    () => formatDatePtBr(subscription?.currentPeriodEnd),
    [subscription?.currentPeriodEnd]
  );

  const planName = useMemo(() => {
    if (isLoading) return '—';

    switch (subscription?.status) {
      case 'active':
        return 'Plus';
      case 'trialing':
        return 'Gratuito';
      case 'past_due':
        return 'Pagamento pendente';
      case 'canceled':
        return 'Cancelado';
      case 'none':
      default:
        return 'Gratuito';
    }
  }, [isLoading, subscription?.status]);

  const handleBack = () => {
    onClose();
  };

  const handleUpgrade = () => {
    if (!paymentLinkUrl) {
      toast.error('Link de pagamento não configurado.');
      return;
    }
    window.open(paymentLinkUrl, '_blank', 'noopener,noreferrer');
  };

  const renderPlanDescription = () => {
    if (isLoading) return null;

    if (subscription?.status === 'trialing' && formattedTrialEnd) {
      return (
        <p className={styles.planDescription}>
          Seu período de teste gratuito termina em <strong>{formattedTrialEnd}</strong>.
        </p>
      );
    }

    if (subscription?.status === 'active' && formattedCurrentPeriodEnd) {
      return (
        <p className={styles.planDescription}>
          Seu plano renovará automaticamente em <strong>{formattedCurrentPeriodEnd}</strong>.
        </p>
      );
    }

    if (subscription?.status === 'past_due') {
      return (
        <p className={styles.planDescription}>
          Atualize seu método de pagamento para manter o acesso.
        </p>
      );
    }

    if (subscription?.status === 'canceled') {
      return (
        <p className={styles.planDescription}>
          Seu plano foi cancelado.
        </p>
      );
    }

    return null;
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      width="lg"
      className={styles.dialog}
      showCloseButton
    >
      <header className={styles.header}>
        <Button
          variant="secondary"
          size="medium"
          icon={CaretLeft}
          iconPosition="icon-only"
          aria-label="Voltar"
          onClick={handleBack}
        />

        <h1 className={styles.title}>Gerenciar Plano</h1>
      </header>

      <section className={styles.section}>
        <div className={styles.planInfo}>
          <p className={styles.sectionLabel}>Plano</p>
          <p className={styles.planName}>{planName}</p>
          {renderPlanDescription()}
        </div>
      </section>

      <Divider />

      <section className={styles.section}>
        <div className={styles.upgradeRow}>
          <div className={styles.upgradeInfo}>
            <p className={styles.sectionLabel}>Mude para o plano Plus</p>

            <div className={styles.priceBlock}>
              <p className={styles.price}>
                <span className={styles.priceValue}>R$ 12,90</span>
                <span className={styles.pricePeriod}>/mês</span>
                <span className={styles.priceEmoji} aria-hidden="true">👌</span>
              </p>
              <p className={styles.priceNote}>ou R$ 124,90/ano (economize 20%)</p>
            </div>
          </div>

          <div className={styles.upgradeActions}>
            <Button
              variant="primary"
              size="small"
              icon={Lightning}
              iconPosition="left"
              onClick={handleUpgrade}
              disabled={!canUpgrade}
            >
              Fazer Upgrade
            </Button>
          </div>
        </div>
      </section>

      <section className={styles.featureCard}>
        <div className={styles.featureHeader}>
          <Lightning size={16} weight="regular" aria-hidden="true" />
          <p className={styles.featureHeaderText}>
            Com Plus você desbloqueia todo potencial da Jarvi
          </p>
        </div>

        <div className={styles.featureGrid}>
          <div className={styles.featureItem}>
            <div className={styles.featureIcon} aria-hidden="true">💬</div>
            <div className={styles.featureText}>
              <p className={styles.featureTitle}>Integração Whatsapp</p>
              <p className={styles.featureDescription}>Crie tarefas direto no WhatsApp.</p>
            </div>
          </div>

          <div className={styles.featureItem}>
            <div className={styles.featureIcon} aria-hidden="true">🗒️</div>
            <div className={styles.featureText}>
              <p className={styles.featureTitle}>Listas Infinitas</p>
              <p className={styles.featureDescription}>Gerencie listas e filtre tarefas.</p>
            </div>
          </div>

          <div className={styles.featureItem}>
            <div className={styles.featureIcon} aria-hidden="true">✨</div>
            <div className={styles.featureText}>
              <p className={styles.featureTitle}>Edição com IA</p>
              <p className={styles.featureDescription}>Corrija e melhore sua escrita em poucos cliques com IA.</p>
            </div>
          </div>

          <div className={styles.featureItem}>
            <div className={styles.featureIcon} aria-hidden="true">🔗</div>
            <div className={styles.featureText}>
              <p className={styles.featureTitle}>Vincule Tarefas</p>
              <p className={styles.featureDescription}>Acompanhe o histórico de suas tarefas vinculando-as.</p>
            </div>
          </div>

          <div className={styles.featureItem}>
            <div className={styles.featureIcon} aria-hidden="true">🧾</div>
            <div className={styles.featureText}>
              <p className={styles.featureTitle}>Tarefas Ilimitadas</p>
              <p className={styles.featureDescription}>Crie quantas tarefas você quiser precisar.</p>
            </div>
          </div>

          <div className={styles.featureItem}>
            <div className={styles.featureIcon} aria-hidden="true">🫶</div>
            <div className={styles.featureText}>
              <p className={styles.featureTitle}>Comunidade de Criação</p>
              <p className={styles.featureDescription}>Sugira novas funções para o app e veja o progresso.</p>
            </div>
          </div>
        </div>
      </section>
    </Dialog>
  );
}

