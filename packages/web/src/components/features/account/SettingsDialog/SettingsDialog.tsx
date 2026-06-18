/**
 * SettingsDialog Component - Jarvi Web
 *
 * Two-column settings modal: sidebar navigation + scrollable canvas.
 * Pages: Meu perfil / Pagamentos / Apps / Memória / Categorias / Filtros / Aparência
 *
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App
 * Node: 40001321-32878
 */

import { useState, useEffect } from 'react';
import type { ElementType } from 'react';
import {
  X,
  User,
  CreditCard,
  CirclesFour,
  Brain,
  Palette,
  Hash,
  FunnelSimple,
} from '@phosphor-icons/react';
import { Dialog, ListItem } from '../../../ui';
import { ProfilePage } from './pages/ProfilePage';
import { PaymentsPage } from './pages/PaymentsPage';
import { AppsPage } from './pages/AppsPage';
import { MemoryPage } from './pages/MemoryPage';
import { AppearancePage } from './pages/AppearancePage';
import { CategoriesPage } from './pages/CategoriesPage';
import { FiltersPage } from './pages/FiltersPage';
import styles from './SettingsDialog.module.css';

// ============================================================================
// TYPES
// ============================================================================

export type SettingsPage =
  | 'profile'
  | 'payments'
  | 'apps'
  | 'memory'
  | 'categories'
  | 'filters'
  | 'appearance';

export interface SettingsSidebarItem {
  id: SettingsPage;
  label: string;
  icon?: ElementType;
  iconWeight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
}

// ============================================================================
// SIDEBAR ITEMS
// ============================================================================

export const SIDEBAR_ITEMS: SettingsSidebarItem[] = [
  { id: 'profile',    label: 'Meu perfil', icon: User },
  { id: 'payments',   label: 'Pagamentos', icon: CreditCard },
  { id: 'apps',       label: 'Apps',       icon: CirclesFour },
  { id: 'memory',     label: 'Memória',    icon: Brain },
  { id: 'categories', label: 'Categorias', icon: Hash },
  { id: 'filters',    label: 'Filtros',    icon: FunnelSimple },
  { id: 'appearance', label: 'Aparência',  icon: Palette },
];

// Pages that render their own full header (title + extras)
export const PAGES_WITH_CUSTOM_HEADER = new Set<SettingsPage>(['apps', 'categories', 'filters']);

// ============================================================================
// PAGE CONTENT (shared between desktop dialog and mobile bottom sheet)
// ============================================================================

export function SettingsPageContent({
  page,
  onClose,
  hideHeader = false,
}: {
  page: SettingsPage;
  onClose: () => void;
  /**
   * When true, pages that render their own title/header (apps, categories,
   * filters) omit it — used by the mobile bottom sheet, which shows the title
   * in its own sticky header instead.
   */
  hideHeader?: boolean;
}) {
  switch (page) {
    case 'profile':    return <ProfilePage />;
    case 'payments':   return <PaymentsPage onClose={onClose} />;
    case 'apps':       return <AppsPage hideHeader={hideHeader} />;
    case 'memory':     return <MemoryPage />;
    case 'categories': return <CategoriesPage hideHeader={hideHeader} />;
    case 'filters':    return <FiltersPage hideHeader={hideHeader} />;
    case 'appearance': return <AppearancePage />;
    default:           return null;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export interface SettingsDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when the dialog should close */
  onClose: () => void;
  /** Page to show when the dialog opens (defaults to 'profile') */
  initialPage?: SettingsPage;
}

export function SettingsDialog({ isOpen, onClose, initialPage = 'profile' }: SettingsDialogProps) {
  const [activePage, setActivePage] = useState<SettingsPage>(initialPage);

  useEffect(() => {
    if (isOpen) setActivePage(initialPage);
  }, [isOpen, initialPage]);

  const activeItem = SIDEBAR_ITEMS.find((item) => item.id === activePage);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      width="xl"
      showCloseButton={false}
      className={styles.dialogContainer}
      contentClassName={styles.dialogContent}
    >
      <div className={styles.wrapper}>
        {/* Close button lives outside the scrollable canvas so it stays fixed */}
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={20} weight="regular" />
        </button>

        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <h2 className={styles.sidebarTitle}>Minha Conta</h2>
          <nav className={styles.sidebarNav}>
            {SIDEBAR_ITEMS.map((item) => (
              <ListItem
                key={item.id}
                label={item.label}
                icon={item.icon}
                iconWeight={item.iconWeight}
                active={activePage === item.id}
                onClick={() => setActivePage(item.id)}
              />
            ))}
          </nav>
        </aside>

        {/* Canvas */}
        <main className={styles.canvas}>
          {!PAGES_WITH_CUSTOM_HEADER.has(activePage) && (
            <h1 className={styles.pageHeader}>{activeItem?.label}</h1>
          )}

          <SettingsPageContent page={activePage} onClose={onClose} />
        </main>
      </div>
    </Dialog>
  );
}

