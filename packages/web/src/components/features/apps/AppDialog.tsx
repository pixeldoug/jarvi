/**
 * AppDialog — one app's connection page in its own dialog (no settings
 * sidebar). Desktop: Dialog. Mobile: BottomSheet, like the account pages.
 */

import { BottomSheet, Dialog } from '../../ui';
import { MOBILE_BREAKPOINT } from '../../layout/MainLayout/MainLayout';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { AiConnectPage } from './AiConnectPage';
import { GmailConnectPage, WhatsAppConnectPage, type AppId } from './AppConnectPages';
import styles from './AppDialog.module.css';

export interface AppDialogProps {
  /** App to show; null keeps the dialog closed */
  appId: AppId | null;
  onClose: () => void;
}

function AppConnectPage({ appId }: { appId: AppId }) {
  switch (appId) {
    case 'whatsapp': return <WhatsAppConnectPage />;
    case 'ai':       return <AiConnectPage />;
    case 'gmail':    return <GmailConnectPage />;
    default:         return null;
  }
}

/** Apps with a connection page (the rest are still "Em breve") */
export const APPS_WITH_DIALOG = new Set<AppId>(['whatsapp', 'ai', 'gmail']);

export function AppDialog({ appId, onClose }: AppDialogProps) {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const isOpen = appId !== null && APPS_WITH_DIALOG.has(appId);
  const content = isOpen ? <AppConnectPage appId={appId} /> : null;

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose}>
        {content}
      </BottomSheet>
    );
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      width="lg"
      className={styles.dialog}
    >
      {content}
    </Dialog>
  );
}
