/**
 * WhatsNewCard Component - Jarvi Web
 *
 * Figma: https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App
 * Node: 40001781:323
 */

import React from 'react';
import {
  Bell,
  CardsThree,
  ChatTeardropText,
  X,
  type IconProps,
} from '@phosphor-icons/react';
import { Button } from '../Button';
import styles from './WhatsNewCard.module.css';

type PhosphorIcon = React.ComponentType<IconProps>;

export interface WhatsNewCardFeature {
  /** Feature description shown beside the icon. */
  label: React.ReactNode;
  /** Phosphor icon used for this feature. */
  icon: PhosphorIcon;
}

export interface WhatsNewCardProps {
  className?: string;
  size?: 'default' | 'compact';
  variant?: 'default' | 'welcome';
  eyebrow?: React.ReactNode;
  heading?: React.ReactNode;
  bodyLabel?: React.ReactNode;
  features?: WhatsNewCardFeature[];
  actionLabel?: React.ReactNode;
  onAction?: () => void;
  secondaryActionLabel?: React.ReactNode;
  onSecondaryAction?: () => void;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  /** Optional artwork or media rendered in the card header. */
  media?: React.ReactNode;
  /** Renders the close control on the floating card when provided. */
  onClose?: () => void;
  closeLabel?: string;
}

const WELCOME_FEATURES: WhatsNewCardFeature[] = [
  {
    icon: CardsThree,
    label: 'Transformar mensagens em tarefas',
  },
  {
    icon: Bell,
    label: 'Receber lembretes automaticamente',
  },
  {
    icon: ChatTeardropText,
    label: 'Se organizar conversando com a Jarvi',
  },
];

const FLOATING_FEATURES: WhatsNewCardFeature[] = [
  {
    icon: CardsThree,
    label: 'Transforme mensagens em tarefas',
  },
  {
    icon: Bell,
    label: 'Receba lembretes automaticamente',
  },
  {
    icon: ChatTeardropText,
    label: 'Organize-se conversando com a Jarvi',
  },
];

const WELCOME_MEDIA = (
  <picture>
    <source srcSet="/assets/whatsapp-welcome.avif" type="image/avif" />
    <source srcSet="/assets/whatsapp-welcome.webp" type="image/webp" />
    <img
      src="/assets/whatsapp-welcome.webp"
      width="1024"
      height="491"
      alt=""
      loading="eager"
      decoding="async"
    />
  </picture>
);

export function WhatsNewCard({
  className = '',
  size = 'default',
  variant = 'default',
  eyebrow,
  heading,
  bodyLabel,
  features,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  actionDisabled = false,
  actionLoading = false,
  media,
  onClose,
  closeLabel = 'Fechar',
}: WhatsNewCardProps) {
  const cardClasses = [styles.card, className].filter(Boolean).join(' ');
  const isWelcome = variant === 'welcome';
  const resolvedEyebrow = eyebrow ?? (isWelcome ? 'Seja bem-vindo!' : 'Conecte seu Whatsapp');
  const resolvedHeading =
    heading ??
    (isWelcome
      ? 'Comece conectando a Jarvi no seu Whatsapp'
      : 'Sua experiência fica muito melhor com a Jarvi no Whatsapp');
  const resolvedBodyLabel = bodyLabel ?? (isWelcome ? 'Depois de disso, você poderá' : null);
  const resolvedFeatures = features ?? (isWelcome ? WELCOME_FEATURES : FLOATING_FEATURES);
  const resolvedActionLabel = actionLabel ?? 'Conectar';
  const resolvedSecondaryActionLabel =
    secondaryActionLabel ?? (isWelcome ? 'Pular por enquanto' : 'Não mostrar mais');
  const resolvedMedia = media ?? WELCOME_MEDIA;

  return (
    <article className={cardClasses} data-size={size} data-variant={variant}>
      <div className={styles.media}>
        {resolvedMedia && <div className={styles.mediaContent}>{resolvedMedia}</div>}

        {onClose && !isWelcome && (
          <Button
            className={styles.closeButton}
            variant="secondary"
            size="small"
            icon={X}
            iconPosition="icon-only"
            aria-label={closeLabel}
            onClick={onClose}
          />
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.copy}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>{resolvedEyebrow}</p>
            <h2 className={styles.heading}>{resolvedHeading}</h2>
          </header>

          <div className={styles.body}>
            {resolvedBodyLabel && <p className={styles.bodyLabel}>{resolvedBodyLabel}</p>}
            {resolvedFeatures.length > 0 && (
              <ul className={styles.features}>
                {resolvedFeatures.map(({ icon: Icon, label }, index) => (
                  <li className={styles.feature} key={index}>
                    <Icon
                      className={styles.featureIcon}
                      size={16}
                      weight="regular"
                      aria-hidden="true"
                    />
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          <Button
            fullWidth
            size="small"
            onClick={onAction}
            disabled={actionDisabled}
            loading={actionLoading}
          >
            {resolvedActionLabel}
          </Button>
          {resolvedSecondaryActionLabel && (
            <Button
              fullWidth
              variant="secondary"
              size="small"
              onClick={onSecondaryAction}
              disabled={actionDisabled || actionLoading}
            >
              {resolvedSecondaryActionLabel}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
