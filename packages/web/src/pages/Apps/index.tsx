/**
 * Apps Page
 *
 * `/apps` lists the integrations split into connected / available.
 * `?app=<id>` opens that app's dialog (also the target of links from
 * Minha Conta and the WhatsApp promo).
 */

import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { Sidebar } from '../../components/layout/Sidebar';
import {
  APPS,
  AppDialog,
  AppsListView,
  useAppConnections,
  type AppId,
} from '../../components/features/apps';

const isAppId = (value: string | null): value is AppId =>
  APPS.some((app) => app.id === value);

export function Apps() {
  const [searchParams, setSearchParams] = useSearchParams();
  const appParam = searchParams.get('app');
  const openAppId = isAppId(appParam) ? appParam : null;
  const { connections, isLoading, reload } = useAppConnections();

  const handleOpenApp = useCallback((appId: AppId) => {
    setSearchParams({ app: appId });
  }, [setSearchParams]);

  const handleCloseApp = useCallback(() => {
    setSearchParams({}, { replace: true });
    // The dialog may have connected or disconnected the app.
    void reload();
  }, [setSearchParams, reload]);

  return (
    <MainLayout
      sidebar={<Sidebar selectedList={null} />}
      title="Apps"
      titleVariant="heading"
      hideControlBar
    >
      <AppsListView connections={connections} isLoading={isLoading} onOpenApp={handleOpenApp} />
      <AppDialog appId={openAppId} onClose={handleCloseApp} />
    </MainLayout>
  );
}
