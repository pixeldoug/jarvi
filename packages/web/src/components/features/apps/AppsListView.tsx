/**
 * AppsListView — the Apps page body: connected apps first ("Conectados",
 * only when there are any), then the rest ("Disponíveis"). An app's row
 * opens its dialog, like a note row. Trailing action (compliance: stacked
 * list cards): Conectar to connect; once connected, a "…" menu when the
 * description already says so ("Conectado em …"), else the Conectado chip;
 * "Em breve" for apps not available yet.
 */

import { useRef, useState } from 'react';
import { DotsThreeVertical, Plugs } from '@phosphor-icons/react';
import {
  Button,
  ConnectionChip,
  Dropdown,
  ListCard,
  ListCardGroup,
  ListItem,
  Loading,
} from '../../ui';
import { formatWhatsAppPhone } from '../../../lib/whatsappPhone';
import { APPS, type AppDefinition, type AppId } from './AppConnectPages';
import type { AppConnections } from './useAppConnections';
import styles from './AppsListView.module.css';

/** Logo on a white tile with a hairline border (the Plugs glyph keeps the plain tile) */
export function AppIcon({ app }: { app: AppDefinition }) {
  if (app.id === 'ai') return <Plugs size={20} weight="regular" />;
  return (
    <span className={styles.logoTile}>
      <img src={app.icon} alt="" className={styles.appIcon} draggable={false} />
    </span>
  );
}

export function isAppConnected(appId: AppId, connections: AppConnections): boolean {
  if (appId === 'whatsapp') return connections.whatsappLinked;
  if (appId === 'ai') return connections.aiLinked;
  return false;
}

/** "…" on a connected app whose description already says it is connected */
function AppMenu({ app, onManage }: { app: AppDefinition; onManage: () => void }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  return (
    <>
      <span ref={anchorRef} className={styles.menuAnchor}>
        <Button
          variant="ghost"
          size="small"
          icon={DotsThreeVertical}
          iconPosition="icon-only"
          iconWeight="bold"
          active={open}
          aria-label={`Mais opções do ${app.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        />
      </span>
      <Dropdown isOpen={open} onClose={() => setOpen(false)} anchorRef={anchorRef} align="right" width={220}>
        <ListItem
          label="Gerenciar"
          onClick={() => {
            setOpen(false);
            onManage();
          }}
        />
      </Dropdown>
    </>
  );
}

export interface AppsListViewProps {
  connections: AppConnections;
  isLoading: boolean;
  onOpenApp: (appId: AppId) => void;
}

export function AppsListView({ connections, isLoading, onOpenApp }: AppsListViewProps) {
  if (isLoading) {
    return <Loading centered size="lg" />;
  }

  const connected = APPS.filter((app) => isAppConnected(app.id, connections));
  const notConnected = APPS.filter((app) => !isAppConnected(app.id, connections));

  /** The description when it states the connection ("Conectado em …") */
  const connectionDescription = (app: AppDefinition): string | null =>
    app.id === 'whatsapp' && connections.whatsappLinked && connections.whatsappPhone
      ? `Conectado em ${formatWhatsAppPhone(connections.whatsappPhone)}.`
      : null;

  const renderAction = (app: AppDefinition, isConnected: boolean) => {
    if (!app.available) return <span className={styles.comingSoon}>Em breve</span>;
    if (!isConnected) {
      return (
        <Button
          variant="secondary"
          size="small"
          onClick={() => onOpenApp(app.id)}
          aria-label={`Conectar ${app.name}`}
        >
          Conectar
        </Button>
      );
    }
    if (connectionDescription(app)) return <AppMenu app={app} onManage={() => onOpenApp(app.id)} />;
    return <ConnectionChip onClick={() => onOpenApp(app.id)} aria-label={`Gerenciar ${app.name}`} />;
  };

  const renderGroup = (label: string, apps: AppDefinition[], isConnected: boolean) => (
    <section className={styles.group} aria-label={label}>
      <h2 className={styles.groupLabel}>{label}</h2>
      <ListCardGroup className={styles.cards}>
        {apps.map((app) => (
          <ListCard
            key={app.id}
            as="li"
            className={styles.row}
            icon={<AppIcon app={app} />}
            title={app.name}
            description={connectionDescription(app) ?? app.description}
            // Same row hover / click as a note; apps not available yet stay static
            onClick={app.available ? () => onOpenApp(app.id) : undefined}
            action={renderAction(app, isConnected)}
          />
        ))}
      </ListCardGroup>
    </section>
  );

  return (
    <div className={styles.list}>
      {connected.length > 0 && renderGroup('Conectados', connected, true)}
      {notConnected.length > 0 && renderGroup('Disponíveis', notConnected, false)}
    </div>
  );
}
