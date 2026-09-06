/**
 * Login methods on Meu perfil: Email, WhatsApp, Google.
 * Uses ListCard — same stacked card as Apps.
 */

import { useRef, useState } from 'react';
import { DotsThreeVertical, EnvelopeSimple } from '@phosphor-icons/react';
import {
  Button,
  Dropdown,
  ListCard,
  ListCardGroup,
  ListItem,
} from '../../../../ui';
import { GoogleLogin } from '../../../auth';
import googleLogo from '../../../../../assets/google-logo.svg';
import { formatWhatsAppPhone } from '../../../../../lib/whatsappPhone';
import type { SettingsProfileOverlay } from '../settingsOverlays';
import styles from './LoginMethodsCard.module.css';

interface LoginMethodsCardProps {
  email: string;
  emailVerified: boolean;
  whatsappPhone?: string;
  isGoogleUser: boolean;
  canChangePassword: boolean;
  canDisconnectEmail: boolean;
  canDisconnectWhatsapp: boolean;
  canDisconnectGoogle: boolean;
  onOpenOverlay: (overlay: SettingsProfileOverlay) => void;
  onLinkGoogle: (idToken: string) => Promise<void>;
  onGoToApps?: () => void;
}

interface OverflowItem {
  label: string;
  onClick: () => void;
}

function OverflowMenu({
  label,
  items,
}: {
  label: string;
  items: OverflowItem[];
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);

  if (items.length === 0) return null;

  return (
    <>
      <span ref={anchorRef} className={styles.overflowAnchor}>
        <Button
          variant="ghost"
          size="small"
          icon={DotsThreeVertical}
          iconPosition="icon-only"
          iconWeight="bold"
          active={open}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        />
      </span>
      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        align="right"
        width={220}
        zIndex={1100}
        disableOutsideIgnoreCheck
      >
        {items.map((item) => (
          <ListItem
            key={item.label}
            label={item.label}
            onClick={() => {
              setOpen(false);
              item.onClick();
            }}
          />
        ))}
      </Dropdown>
    </>
  );
}

export function LoginMethodsCard({
  email,
  emailVerified,
  whatsappPhone,
  isGoogleUser,
  canChangePassword,
  canDisconnectEmail,
  canDisconnectWhatsapp,
  canDisconnectGoogle,
  onOpenOverlay,
  onLinkGoogle,
  onGoToApps,
}: LoginMethodsCardProps) {
  const emailPending = Boolean(email && !emailVerified);
  const emailConnected = Boolean(email && emailVerified);
  const whatsappConnected = Boolean(whatsappPhone);

  const emailDescription = emailPending
    ? `Aguardando confirmação em ${email}.`
    : emailConnected
      ? `Conectado em ${email}.`
      : 'Adicione um email e senha para entrar.';

  const whatsappDescription = whatsappConnected && whatsappPhone
    ? `Conectado em ${formatWhatsAppPhone(whatsappPhone)}.`
    : 'Entre no Jarvi pelo WhatsApp.';

  const googleDescription = isGoogleUser
    ? `Conectado em ${email}.`
    : email
      ? `Faça login com sua conta Google com ${email}.`
      : 'Faça login com sua conta Google.';

  const emailItems: OverflowItem[] = [
    ...(canChangePassword
      ? [{ label: 'Alterar senha', onClick: () => onOpenOverlay('password') }]
      : []),
    ...(canDisconnectEmail
      ? [{ label: 'Desconectar', onClick: () => onOpenOverlay('disconnect-email') }]
      : []),
  ];

  const whatsappItems: OverflowItem[] = [
    ...(onGoToApps
      ? [{ label: 'Gerenciar', onClick: onGoToApps }]
      : []),
    ...(canDisconnectWhatsapp
      ? [{ label: 'Desconectar', onClick: () => onOpenOverlay('disconnect-whatsapp') }]
      : []),
  ];

  const googleItems: OverflowItem[] = canDisconnectGoogle
    ? [{ label: 'Desconectar', onClick: () => onOpenOverlay('disconnect') }]
    : [];

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Formas de entrar</h2>
        <p className={styles.description}>Gerencie como você entra no Jarvi.</p>
      </div>
      <ListCardGroup>
        <ListCard
          as="li"
          icon={<EnvelopeSimple size={24} weight="regular" />}
          title="Email"
          description={emailDescription}
          action={
            emailPending ? (
              <Button variant="primary" size="small" onClick={() => onOpenOverlay('add-email')}>
                Confirmar
              </Button>
            ) : emailConnected ? (
              <OverflowMenu label="Mais opções do email" items={emailItems} />
            ) : (
              <Button variant="secondary" size="small" onClick={() => onOpenOverlay('add-email')}>
                Conectar
              </Button>
            )
          }
        />

        <ListCard
          as="li"
          icon={<img src="/icons/apps/whatsapp.svg" alt="" />}
          title="WhatsApp"
          description={whatsappDescription}
          action={
            whatsappConnected ? (
              <OverflowMenu label="Mais opções do WhatsApp" items={whatsappItems} />
            ) : (
              <Button variant="secondary" size="small" onClick={() => onGoToApps?.()}>
                Conectar
              </Button>
            )
          }
        />

        <ListCard
          as="li"
          icon={<img src={googleLogo} alt="" />}
          title="Google"
          description={googleDescription}
          action={
            isGoogleUser ? (
              <OverflowMenu label="Mais opções do Google" items={googleItems} />
            ) : (
              <GoogleLogin
                onCredential={onLinkGoogle}
                renderButton={({ onClick, disabled, loading }) => (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={onClick}
                    disabled={disabled}
                    loading={loading}
                  >
                    Conectar
                  </Button>
                )}
              />
            )
          }
        />
      </ListCardGroup>
    </div>
  );
}
