/**
 * AppsListView — the Apps page body: connected apps first ("Conectados",
 * only when there are any), then the rest ("Disponíveis"). An app's button
 * opens its dialog, like a note row. Trailing action: "+" to connect, a gear
 * to manage, or "Em breve" for apps not available yet.
 */

import { GearSix, Plugs, Plus } from '@phosphor-icons/react';
import { Button, ListCard, ListCardGroup, Loading } from '../../ui';
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

  const describe = (app: AppDefinition): string =>
    app.id === 'whatsapp' && connections.whatsappLinked && connections.whatsappPhone
      ? `Conectado em ${formatWhatsAppPhone(connections.whatsappPhone)}.`
      : app.description;

  const renderAction = (app: AppDefinition, isConnected: boolean) => {
    if (!app.available) return <span className={styles.comingSoon}>Em breve</span>;
    return (
      <Button
        variant="ghost"
        size="small"
        icon={isConnected ? GearSix : Plus}
        iconPosition="icon-only"
        onClick={() => onOpenApp(app.id)}
        aria-label={isConnected ? `Gerenciar ${app.name}` : `Conectar ${app.name}`}
      />
    );
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
            description={describe(app)}
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
