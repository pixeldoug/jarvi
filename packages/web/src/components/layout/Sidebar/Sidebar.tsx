/**
 * Sidebar Component - Jarvi Web
 *
 * Global application sidebar. Handles:
 *  - User profile header (avatar, name, plan label, settings/collapse toggle)
 *  - Optional Pro CTA for trialing / free users
 *  - Task navigation item (Tarefas); Vencidas / Caixa de entrada are filters on the page
 *  - "Buscar" entry (also ⌘K / Ctrl+K anywhere) opening the CommandPalette
 *  - "Notas" and "Apps" entries (route to /notes and /apps; task items then navigate back to /tasks with router state)
 *  - "Chats" entry (routes to /chats): there the menu is the icon rail + the conversation history
 *  - Collapsible "Categorias" group with hover add-button
 *  - Expanded (320 px) / Collapsed (56 px) states, toggled internally
 *
 * Figma: https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001333-125371
 */

import { useState, useRef, useEffect, useMemo, useCallback, type RefObject, type MutableRefObject } from 'react';
import {
  Checks,
  Hash,
  SidebarSimple,
  Bug,
  Lightbulb,
  CirclesFour,
  ChatCircle,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import { Avatar } from '../../ui/Avatar/Avatar';
import { Button } from '../../ui/Button/Button';
import { ListItem } from '../../ui/ListItem/ListItem';
import { Dialog, Dropdown, Tooltip, Divider, BottomSheet, WhatsNewCard, NoteIcon } from '../../ui';
import {
  SettingsDialog,
  SettingsPageContent,
  SIDEBAR_ITEMS,
  type SettingsPage,
  type SettingsProfileOverlay,
} from '../../features/account/SettingsDialog/SettingsDialog';
import { ChangePasswordDialog } from '../../features/account/SettingsDialog/ChangePasswordDialog';
import { DisconnectGoogleDialog } from '../../features/account/SettingsDialog/DisconnectGoogleDialog';
import { DisconnectWhatsAppDialog } from '../../features/account/SettingsDialog/DisconnectWhatsAppDialog';
import { DisconnectEmailDialog } from '../../features/account/SettingsDialog/DisconnectEmailDialog';
import { AddEmailDialog } from '../../features/account/SettingsDialog/AddEmailDialog';
import { DeleteAccountDialog } from '../../features/account/SettingsDialog/DeleteAccountDialog';
import { useMobileSidebar } from '../MainLayout/MainLayout';
import { useMergedTaskCategories } from '../../../hooks/useMergedTaskCategories';
import { SidebarEmptyState } from './SidebarEmptyState';
import { SidebarGroupHeader } from './SidebarGroupHeader';
import { SidebarUserMenu } from './SidebarUserMenu';
import { UpgradeButton } from '../../ui/UpgradeButton/UpgradeButton';
import { ThemeToggle } from '../../ui/ThemeToggle';
import { useTheme } from '../../../contexts/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { SignOut, Gear } from '@phosphor-icons/react';
import { FeedbackDialog } from '../../features/feedback/FeedbackDialog';
import { ChatHistoryPanel } from '../../features/chats';
import {
  CommandPalette,
  CommandPaletteShortcut,
  COMMAND_PALETTE_SHORTCUT,
  useCommandPaletteHotkey,
} from '../../features/search';
import type { FeedbackKind } from '../../../lib/posthogFeedback';
import styles from './Sidebar.module.css';

// ── Re-exported task navigation constants ─────────────────────────────────────
// These are used by the Tasks page to set up scroll-spy and section anchors.

export type ListType =
  | 'all'
  | 'important'
  | 'today'
  | 'tomorrow'
  | 'week'
  | 'later'
  | 'noDate'
  | 'overdue'
  | 'recurring'
  | 'completed';

export type CategoryType = string;

export const SECTION_IDS = [
  'section-vencidas',
  'section-hoje',
  'section-amanha',
  'section-esta-semana',
  'section-semana-que-vem',
  'section-eventos-futuros',
  'section-sem-data',
  'section-completadas',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_TO_LIST: Record<SectionId, ListType> = {
  'section-vencidas': 'overdue',
  'section-hoje': 'today',
  'section-amanha': 'week',
  'section-esta-semana': 'week',
  'section-semana-que-vem': 'week',
  'section-eventos-futuros': 'later',
  'section-sem-data': 'noDate',
  'section-completadas': 'completed',
};

export const LIST_TO_SECTION: Partial<Record<ListType, SectionId>> = {
  overdue: 'section-vencidas',
  today: 'section-hoje',
  week: 'section-amanha',
  later: 'section-eventos-futuros',
  noDate: 'section-sem-data',
  completed: 'section-completadas',
};

// ─────────────────────────────────────────────────────────────────────────────

export interface SidebarProps {
  selectedList?: ListType | null;
  selectedCategory?: CategoryType | null;
  onListSelect?: (listType: ListType) => void;
  onCategorySelect?: (category: CategoryType) => void;
  addButtonRef?: RefObject<HTMLButtonElement>;
  taskCounts?: {
    all?: number;
    today?: number;
    week?: number;
    later?: number;
    noDate?: number;
  };
  /** Omit to let the Sidebar derive them (same data the Tasks page passes) */
  categories?: Array<{ id: string; name: string; count: number }>;
  /** Imperative ref — caller sets this to open the SettingsDialog on any page */
  openSettingsRef?: MutableRefObject<((page: SettingsPage) => void) | null>;
  /** When true, collapses the sidebar; restores previous state when false */
  forceCollapsed?: boolean;
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: Array<{ id: ListType; label: string; icon: typeof Checks }> = [
  // The calendar is a view of "Tarefas" (Lista / Calendário switch on the page)
  { id: 'all', label: 'Tarefas', icon: Checks },
];

const NOTES_NAV_LABEL = 'Notas';

const isNotesPath = (pathname: string): boolean =>
  pathname === '/notes' || pathname.startsWith('/notes/');

const APPS_NAV_LABEL = 'Apps';

const isAppsPath = (pathname: string): boolean => pathname === '/apps';

const CHATS_NAV_LABEL = 'Chats';

const isChatsPath = (pathname: string): boolean =>
  pathname === '/chats' || pathname.startsWith('/chats/');

/** Router state the Tasks page reads on mount to open a view from another page. */
export interface TasksNavigationState {
  tasksView?: ListType;
  tasksCategory?: string;
  /** Opens this task's details once tasks load (a note's "Tarefa" marker) */
  openTaskId?: string;
}

// Desktop collapsed/locked preference. Module-level so it survives the Sidebar
// remount when switching pages (Tasks ↔ Notes); resets on reload as before.
let desktopCollapsedPreference = false;

type WhatsAppPromoPlacement = 'hidden' | 'modal' | 'floating';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const whatsAppPromoPlacementRequests = new Map<
  string,
  Promise<WhatsAppPromoPlacement>
>();

const getWhatsAppPromoPlacement = (
  userId: string,
  token: string
): Promise<WhatsAppPromoPlacement> => {
  const existingRequest = whatsAppPromoPlacementRequests.get(userId);
  if (existingRequest) return existingRequest;

  const request = fetch(`${API_URL}/api/users/whatsapp-promo/impression`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Não foi possível carregar a promoção do WhatsApp');
      }

      const data = (await response.json()) as { placement?: WhatsAppPromoPlacement };
      return data.placement === 'modal' || data.placement === 'floating'
        ? data.placement
        : 'hidden';
    })
    .catch((error) => {
      whatsAppPromoPlacementRequests.delete(userId);
      throw error;
    });

  whatsAppPromoPlacementRequests.set(userId, request);
  return request;
};

const dismissWhatsAppPromo = async (userId: string, token: string): Promise<void> => {
  const response = await fetch(`${API_URL}/api/users/whatsapp-promo/dismiss`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Não foi possível ocultar a promoção do WhatsApp');
  }

  whatsAppPromoPlacementRequests.set(userId, Promise.resolve('hidden'));
};

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar({
  selectedList = 'all',
  selectedCategory,
  onListSelect,
  onCategorySelect,
  addButtonRef,
  taskCounts: _taskCounts = {},
  categories: categoriesProp,
  openSettingsRef,
  forceCollapsed,
}: SidebarProps) {
  const { isMobile, close: closeMobileSidebar } = useMobileSidebar();

  // Pages that don't own task state (e.g. Notes) omit these; derive them the
  // same way the Tasks page does so the groups don't show empty states.
  const mergedTaskCategories = useMergedTaskCategories();
  const derivedCategories = useMemo(
    () =>
      categoriesProp
        ? []
        : mergedTaskCategories.map((category) => ({
            id: category.id,
            name: category.name,
            count: category.count,
          })),
    [categoriesProp, mergedTaskCategories]
  );
  const categories = categoriesProp ?? derivedCategories;

  const [isCollapsed, setIsCollapsed] = useState(() => desktopCollapsedPreference);
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);
  const prevCollapsedRef = useRef<boolean>(desktopCollapsedPreference);
  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(() => categories.length > 0);
  const [whatsAppPromoPlacement, setWhatsAppPromoPlacement] =
    useState<WhatsAppPromoPlacement>('hidden');


  useEffect(() => {
    if (categories.length > 0) setIsCategoriesExpanded(true);
  }, [categories.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialPage, setSettingsInitialPage] = useState<SettingsPage>('profile');
  // On mobile, settings open as a bottom sheet instead of the desktop modal.
  const [mobileSettingsPage, setMobileSettingsPage] = useState<SettingsPage | null>(null);
  const [profileOverlay, setProfileOverlay] = useState<SettingsProfileOverlay | null>(null);

  useEffect(() => {
    if (!isSettingsOpen && mobileSettingsPage === null) {
      setProfileOverlay(null);
    }
  }, [isSettingsOpen, mobileSettingsPage]);

  // Opens a settings page — bottom sheet on mobile, modal on desktop.
  const openSettings = (page: SettingsPage) => {
    if (isMobile) {
      setMobileSettingsPage(page);
    } else {
      setSettingsInitialPage(page);
      setIsSettingsOpen(true);
    }
  };

  useEffect(() => {
    if (!openSettingsRef) return;
    openSettingsRef.current = (page: SettingsPage) => openSettings(page);
    return () => { openSettingsRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSettingsRef, isMobile]);

  useEffect(() => {
    if (forceCollapsed) {
      prevCollapsedRef.current = isCollapsed;
      setIsCollapsed(true);
    } else {
      setIsCollapsed(prevCollapsedRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceCollapsed]);

  const collapsedProfileButtonRef = useRef<HTMLButtonElement>(null);
  const expandedProfileButtonRef = useRef<HTMLButtonElement>(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Chats page: the icon rail + the conversation history, whatever the
  // collapse preference (the full menu is back on any other page).
  const isChatsRoute = isChatsPath(location.pathname);

  const isDesktopCollapsed =
    !isMobile && !isChatsRoute && (forceCollapsed || (isCollapsed && !isHoverExpanded));
  const showsRail = isDesktopCollapsed || isChatsRoute;

  const profileButtonRef =
    showsRail ? collapsedProfileButtonRef : expandedProfileButtonRef;

  const { user, token, logout } = useAuth();

  // Once closed, the promo stays closed for this page load. The placement
  // effect re-runs when the Sidebar remounts (Tasks ↔ Notas / Apps) or the query
  // changes (note tabs, `?app=`), and would otherwise replay the cached placement.
  const hideWhatsAppPromo = () => {
    setWhatsAppPromoPlacement('hidden');
    if (user?.id) whatsAppPromoPlacementRequests.set(user.id, Promise.resolve('hidden'));
  };
  const { subscription, daysLeftInTrial } = useSubscription();
  const { isLight } = useTheme();
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const toggleSearch = useCallback(() => setIsSearchOpen((open) => !open), []);
  useCommandPaletteHotkey(isSearchOpen, toggleSearch);

  const showProCta = subscription?.status !== 'active';

  useEffect(() => {
    if (import.meta.env.DEV) {
      const previewPlacement = new URLSearchParams(location.search).get('whatsappPromo');
      if (
        previewPlacement === 'modal' ||
        previewPlacement === 'floating' ||
        previewPlacement === 'hidden'
      ) {
        setWhatsAppPromoPlacement(previewPlacement);
        return;
      }
    }

    if (!token || !user?.id) {
      setWhatsAppPromoPlacement('hidden');
      return;
    }

    let cancelled = false;

    const loadWhatsAppPromoPlacement = async () => {
      try {
        const placement = await getWhatsAppPromoPlacement(user.id, token);
        if (!cancelled) setWhatsAppPromoPlacement(placement);
      } catch (error) {
        console.error('Error loading WhatsApp promo placement:', error);
        if (!cancelled) setWhatsAppPromoPlacement('hidden');
      }
    };

    void loadWhatsAppPromoPlacement();
    return () => {
      cancelled = true;
    };
  }, [location.search, token, user?.id]);

  useEffect(() => {
    const handleWhatsAppLinkChange = (event: Event) => {
      const linked = (event as CustomEvent<{ linked?: boolean }>).detail?.linked;
      setWhatsAppPromoPlacement(linked === false ? 'floating' : 'hidden');
    };

    window.addEventListener('jarvi:whatsapp-link-changed', handleWhatsAppLinkChange);
    return () => {
      window.removeEventListener('jarvi:whatsapp-link-changed', handleWhatsAppLinkChange);
    };
  }, []);

  useEffect(() => {
    if (location.pathname === '/settings') {
      if (isMobile) setMobileSettingsPage('profile');
      else setIsSettingsOpen(true);
    }
  }, [location.pathname, isMobile]);

  // ── Nav click handler ───────────────────────────────────────────────────────
  // On /notes, /apps and /chats the task callbacks belong to no page; go to
  // /tasks with router state instead (the Tasks page reads it on mount).
  const isNotesRoute = isNotesPath(location.pathname);
  const isAppsRoute = isAppsPath(location.pathname);
  const isOffTasksRoute = isNotesRoute || isAppsRoute || isChatsRoute;

  const navigateToTasks = (state: TasksNavigationState) => {
    navigate('/tasks', { state });
  };

  const handleNavClick = (listType: ListType) => {
    if (isOffTasksRoute) navigateToTasks({ tasksView: listType });
    else onListSelect?.(listType);
    closeMobileSidebar();
  };

  const handleCategoryClick = (category: CategoryType) => {
    if (isOffTasksRoute) navigateToTasks({ tasksCategory: category });
    else onCategorySelect?.(category);
    closeMobileSidebar();
  };

  const handleNotesClick = () => {
    navigate('/notes');
    closeMobileSidebar();
  };

  const handleAppsClick = () => {
    navigate('/apps');
    closeMobileSidebar();
  };

  const handleChatsClick = () => {
    navigate('/chats');
    closeMobileSidebar();
  };

  const handleSearchClick = () => {
    setIsSearchOpen(true);
    closeMobileSidebar();
  };

  /**
   * Leaves Minha Conta for the Apps page (replace, not a nested dialog):
   * `appId` opens that app's dialog there.
   */
  const goToApps = (appId?: string) => {
    setIsSettingsOpen(false);
    setMobileSettingsPage(null);
    navigate(appId ? `/apps?app=${appId}` : '/apps');
    closeMobileSidebar();
  };

  const isNavItemActive = (itemId: ListType): boolean =>
    !isOffTasksRoute &&
    (selectedList === itemId || (itemId === 'all' && selectedList === 'later')) &&
    !selectedCategory;

  const isCategoryActive = (categoryName: string): boolean =>
    !isOffTasksRoute && selectedCategory === categoryName;

  // ── User info ───────────────────────────────────────────────────────────────
  const userName = user?.preferred_name || user?.name || 'Usuário';
  const userAvatar = user?.avatar;
  const planLabel =
    subscription?.status === 'trialing' && daysLeftInTrial !== null && daysLeftInTrial > 0
      ? `${daysLeftInTrial} ${daysLeftInTrial === 1 ? 'dia' : 'dias'} para testar`
      : subscription?.status === 'active'
        ? 'Plano Pro'
        : 'Plano Gratuito';

  const handleLogout = () => {
    setIsDropdownOpen(false);
    logout();
  };

  const handleSettings = () => {
    setIsDropdownOpen(false);
    openSettings('profile');
  };

  const handleUpgradeClick = () => {
    openSettings('payments');
  };

  const handleAddCategory = () => {
    openSettings('categories');
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    // Stay on the notes / apps / chats page; elsewhere keep the old /settings → /tasks reset.
    if (!isOffTasksRoute) navigate('/tasks', { replace: true });
  };

  const handleCloseMobileSettings = () => {
    setMobileSettingsPage(null);
    if (location.pathname === '/settings') {
      navigate('/tasks', { replace: true });
    }
  };

  // Picks a settings page from the mobile user dropdown.
  const handleMobileSettingsSelect = (page: SettingsPage) => {
    setIsDropdownOpen(false);
    setMobileSettingsPage(page);
    closeMobileSidebar();
  };

  const isSidebarLocked = !isMobile && !isCollapsed;

  const handleSidebarLockToggle = () => {
    if (isMobile) {
      closeMobileSidebar();
      return;
    }
    const next = !isCollapsed;
    desktopCollapsedPreference = next;
    setIsCollapsed(next);
  };

  const sidebarToggleLabel = isMobile
    ? 'Fechar menu'
    : isSidebarLocked
      ? 'Recolher menu'
      : 'Fixar menu expandido';

  const handleSidebarMouseEnter = () => {
    if (!isMobile && !forceCollapsed && !isChatsRoute) setIsHoverExpanded(true);
  };

  const handleSidebarMouseLeave = () => {
    if (!isMobile) setIsHoverExpanded(false);
  };

  const renderSidebarToggleButton = () => (
    <span className={styles.sidebarToggleWrap}>
      <Button
        variant="ghost"
        size="small"
        icon={SidebarSimple}
        iconPosition="icon-only"
        iconWeight={isSidebarLocked ? 'fill' : 'regular'}
        active={isSidebarLocked}
        onClick={handleSidebarLockToggle}
        aria-label={sidebarToggleLabel}
        aria-pressed={!isMobile ? isSidebarLocked : undefined}
      />
    </span>
  );

  // ── Single root — animates between expanded / collapsed via CSS ─────────────
  return (
    <div
      className={styles.sidebar}
      data-collapsed={isDesktopCollapsed || undefined}
      data-locked={isSidebarLocked || undefined}
      data-chats={isChatsRoute || undefined}
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
    >
      {/* ── Collapsed panel (absolutely fills root, fades in when collapsed) ── */}
      <div className={styles.collapsedPanel}>
        {/* Avatar button */}
        <button
          ref={collapsedProfileButtonRef}
          className={styles.collapsedAvatarButton}
          onClick={() => setIsDropdownOpen((v) => !v)}
          type="button"
          aria-label="Menu do usuário"
        >
          <Avatar src={userAvatar} name={userName} size="medium" />
        </button>

        {/* Nav items — icon only */}
        <div className={styles.collapsedNavList}>
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(item.id);
            return (
              <Tooltip key={item.id} label={item.label} position="right" showDelay={300}>
                <Button
                  variant="ghost"
                  size="small"
                  icon={item.icon}
                  iconPosition="icon-only"
                  active={active}
                  className={`${styles.collapsedNavButton} ${active ? styles.collapsedNavButtonActive : ''}`}
                  onClick={() => handleNavClick(item.id)}
                  aria-label={item.label}
                />
              </Tooltip>
            );
          })}
          <Tooltip label={NOTES_NAV_LABEL} position="right" showDelay={300}>
            <Button
              variant="ghost"
              size="small"
              icon={NoteIcon}
              iconPosition="icon-only"
              active={isNotesRoute}
              className={`${styles.collapsedNavButton} ${isNotesRoute ? styles.collapsedNavButtonActive : ''}`}
              onClick={handleNotesClick}
              aria-label={NOTES_NAV_LABEL}
            />
          </Tooltip>
          <Tooltip label={CHATS_NAV_LABEL} position="right" showDelay={300}>
            <Button
              variant="ghost"
              size="small"
              icon={ChatCircle}
              iconPosition="icon-only"
              active={isChatsRoute}
              className={`${styles.collapsedNavButton} ${isChatsRoute ? styles.collapsedNavButtonActive : ''}`}
              onClick={handleChatsClick}
              aria-label={CHATS_NAV_LABEL}
            />
          </Tooltip>
          <Tooltip label={APPS_NAV_LABEL} position="right" showDelay={300}>
            <Button
              variant="ghost"
              size="small"
              icon={CirclesFour}
              iconPosition="icon-only"
              active={isAppsRoute}
              className={`${styles.collapsedNavButton} ${isAppsRoute ? styles.collapsedNavButtonActive : ''}`}
              onClick={handleAppsClick}
              aria-label={APPS_NAV_LABEL}
            />
          </Tooltip>
          <Tooltip label={`Buscar (${COMMAND_PALETTE_SHORTCUT})`} position="right" showDelay={300}>
            <Button
              variant="ghost"
              size="small"
              icon={MagnifyingGlass}
              iconPosition="icon-only"
              className={styles.collapsedNavButton}
              onClick={handleSearchClick}
              aria-label="Buscar"
            />
          </Tooltip>
        </div>

        {/* Categories icon */}
        {categories.length > 0 && (
          <div className={styles.collapsedNavList}>
            <Tooltip label="Categorias" position="right" showDelay={300}>
              <Button
                variant="ghost"
                size="small"
                icon={Hash}
                iconPosition="icon-only"
                className={styles.collapsedNavButton}
                aria-label="Categorias"
              />
            </Tooltip>
          </div>
        )}


        {/* Collapsed footer: action buttons + compact ThemeToggle last */}
        <div className={styles.collapsedFooter}>
          <Tooltip label="Sugerir ideias" position="right" showDelay={300}>
            <button
              type="button"
              className={styles.footerBugButton}
              aria-label="Sugerir ideias"
              onClick={() => setFeedbackKind('ideas')}
            >
              <Lightbulb size={20} />
            </button>
          </Tooltip>
          <Tooltip label="Reportar problema" position="right" showDelay={300}>
            <button
              type="button"
              className={styles.footerBugButton}
              aria-label="Reportar problema"
              onClick={() => setFeedbackKind('report')}
            >
              <Bug size={20} />
            </button>
          </Tooltip>
          <Tooltip
            label={isLight ? 'Ativar modo escuro' : 'Ativar modo claro'}
            position="right"
            showDelay={300}
          >
            <ThemeToggle compact />
          </Tooltip>
        </div>
      </div>

      {/* ── Chats page: the conversation history, next to the rail ── */}
      {isChatsRoute && (
        <div className={styles.chatsPanel}>
          <ChatHistoryPanel onNavigate={closeMobileSidebar} />
        </div>
      )}

      {/* ── Expanded panel (fades out when collapsed) ── */}
      <div className={styles.expandedPanel}>
        {/* SidebarHeader */}
        <div className={styles.header}>
          {/* User row */}
          <div className={styles.userRow}>
            <SidebarUserMenu
              ref={expandedProfileButtonRef}
              src={userAvatar}
              name={userName}
              plan={planLabel}
              isActive={isDropdownOpen}
              onClick={() => setIsDropdownOpen((v) => !v)}
            />

            <Tooltip label={sidebarToggleLabel} position="bottom" showDelay={300}>
              {renderSidebarToggleButton()}
            </Tooltip>
          </div>

          {/* Pro CTA */}
          {showProCta && (
            <div className={styles.proCta}>
              <UpgradeButton
                label="Fazer upgrade"
                size="large"
                fullWidth
                onClick={handleUpgradeClick}
              />
            </div>
          )}
        </div>

        {/* SidebarBody */}
        <div className={styles.body}>
          {/* Primary nav group */}
          <div className={styles.groupNav}>
            <div className={styles.navList}>
              {NAV_ITEMS.map((item) => (
                <ListItem
                  key={item.id}
                  label={item.label}
                  icon={item.icon}
                  active={isNavItemActive(item.id)}
                  onClick={() => handleNavClick(item.id)}
                />
              ))}
              <ListItem
                label={NOTES_NAV_LABEL}
                icon={NoteIcon}
                active={isNotesRoute}
                onClick={handleNotesClick}
              />
              <ListItem
                label={CHATS_NAV_LABEL}
                icon={ChatCircle}
                active={isChatsRoute}
                onClick={handleChatsClick}
              />
              <ListItem
                label={APPS_NAV_LABEL}
                icon={CirclesFour}
                active={isAppsRoute}
                onClick={handleAppsClick}
              />
              <ListItem
                label="Buscar"
                icon={MagnifyingGlass}
                trailing={isMobile ? undefined : <CommandPaletteShortcut />}
                onClick={handleSearchClick}
              />
            </div>
          </div>

          {/* Categorias group */}
          <div className={`${styles.groupSection} ${styles.groupSectionLast}`}>
            <div className={styles.groupHeaderWrapper}>
              <SidebarGroupHeader
                label="Categorias"
                isExpanded={isCategoriesExpanded}
                onToggle={() => setIsCategoriesExpanded((v) => !v)}
                showAddButton
                onAdd={handleAddCategory}
                addButtonRef={addButtonRef}
              />
            </div>
            {isCategoriesExpanded && (
              <div className={`${styles.navList} ${styles.navListScrollable}`}>
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <ListItem
                      key={category.id}
                      label={category.name}
                      icon={Hash}
                      active={isCategoryActive(category.name)}
                      onClick={() => handleCategoryClick(category.name)}
                    />
                  ))
                ) : (
                  <SidebarEmptyState
                    description="Use categorias para filtrar, priorizar e visualizar melhor o que importa."
                    buttonLabel="Criar categoria"
                    onButtonClick={handleAddCategory}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Expanded footer: ThemeToggle + label + action buttons */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <ThemeToggle />
            <span className={styles.footerThemeLabel}>
              {isLight ? 'Modo Claro' : 'Modo Escuro'}
            </span>
          </div>
          <div className={styles.footerActions}>
            <Tooltip label="Sugerir ideias" position="top" showDelay={300}>
              <button
                type="button"
                className={styles.footerBugButton}
                aria-label="Sugerir ideias"
                onClick={() => setFeedbackKind('ideas')}
              >
                <Lightbulb size={20} />
              </button>
            </Tooltip>
            <Tooltip label="Reportar problema" position="top" showDelay={300}>
              <button
                type="button"
                className={styles.footerBugButton}
                aria-label="Reportar problema"
                onClick={() => setFeedbackKind('report')}
              >
                <Bug size={20} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Shared: Dropdown + Settings — always rendered regardless of state */}
      <Dropdown
        isOpen={isDropdownOpen}
        onClose={() => setIsDropdownOpen(false)}
        anchorRef={profileButtonRef}
        align="left"
        width={isMobile ? 240 : 200}
        gap={showsRail ? 6 : 8}
        offsetX={showsRail ? 2 : 0}
      >
        {isMobile ? (
          <>
            {SIDEBAR_ITEMS.map((item) => (
              <ListItem
                key={item.id}
                label={item.label}
                icon={item.icon}
                iconWeight={item.iconWeight}
                onClick={() => handleMobileSettingsSelect(item.id)}
              />
            ))}
            <Divider />
            <ListItem label="Sair" icon={SignOut} onClick={handleLogout} />
          </>
        ) : (
          <>
            <ListItem label="Minha Conta" icon={Gear} onClick={handleSettings} />
            <ListItem label="Sair" icon={SignOut} onClick={handleLogout} />
          </>
        )}
      </Dropdown>

      {/* First impression: centered modal with overlay */}
      <Dialog
        isOpen={whatsAppPromoPlacement === 'modal'}
        onClose={hideWhatsAppPromo}
        width="md"
        showCloseButton={false}
        className={styles.whatsNewModal}
        contentClassName={styles.whatsNewModalContent}
        overlayClassName={styles.whatsNewModalOverlay}
      >
        <WhatsNewCard
          variant="welcome"
          onAction={() => {
            hideWhatsAppPromo();
            goToApps('whatsapp');
          }}
          onSecondaryAction={hideWhatsAppPromo}
        />
      </Dialog>

      {/* Later sessions: floating card without an overlay */}
      {whatsAppPromoPlacement === 'floating' &&
        createPortal(
          <div className={styles.whatsNewFloatingCard}>
            <WhatsNewCard
              onClose={hideWhatsAppPromo}
              onAction={() => {
                hideWhatsAppPromo();
                goToApps('whatsapp');
              }}
              onSecondaryAction={() => {
                hideWhatsAppPromo();
                if (user?.id && token) {
                  void dismissWhatsAppPromo(user.id, token).catch((error) => {
                    console.error('Error dismissing WhatsApp promo:', error);
                    whatsAppPromoPlacementRequests.delete(user.id);
                  });
                }
              }}
            />
          </div>,
          document.body
        )}

      <CommandPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        categories={categories}
        onSelectList={handleNavClick}
        onSelectCategory={handleCategoryClick}
        onOpenSettings={openSettings}
        onOpenFeedback={setFeedbackKind}
      />

      <FeedbackDialog
        kind={feedbackKind}
        isOpen={feedbackKind !== null}
        onClose={() => setFeedbackKind(null)}
      />

      {/* Desktop: full settings modal (hidden while a profile child overlay is open) */}
      <SettingsDialog
        isOpen={isSettingsOpen && profileOverlay === null}
        onClose={handleCloseSettings}
        initialPage={settingsInitialPage}
        onOpenProfileOverlay={setProfileOverlay}
        onGoToApps={goToApps}
      />

      {/* Mobile: single settings page in a bottom sheet */}
      <BottomSheet
        isOpen={mobileSettingsPage !== null && profileOverlay === null}
        onClose={handleCloseMobileSettings}
        title={SIDEBAR_ITEMS.find((item) => item.id === mobileSettingsPage)?.label}
      >
        {mobileSettingsPage && (
          <SettingsPageContent
            page={mobileSettingsPage}
            onClose={handleCloseMobileSettings}
            hideHeader
            onOpenProfileOverlay={setProfileOverlay}
            onGoToApps={() => goToApps('whatsapp')}
          />
        )}
      </BottomSheet>

      <ChangePasswordDialog
        isOpen={profileOverlay === 'password'}
        onClose={() => setProfileOverlay(null)}
      />
      <DisconnectGoogleDialog
        isOpen={profileOverlay === 'disconnect'}
        onClose={() => setProfileOverlay(null)}
      />
      <DisconnectWhatsAppDialog
        isOpen={profileOverlay === 'disconnect-whatsapp'}
        onClose={() => setProfileOverlay(null)}
      />
      <DisconnectEmailDialog
        isOpen={profileOverlay === 'disconnect-email'}
        onClose={() => setProfileOverlay(null)}
      />
      <AddEmailDialog
        isOpen={profileOverlay === 'add-email'}
        onClose={() => setProfileOverlay(null)}
      />
      <DeleteAccountDialog
        isOpen={profileOverlay === 'delete'}
        onClose={() => setProfileOverlay(null)}
        onDeleted={() => {
          setProfileOverlay(null);
          logout();
        }}
      />
    </div>
  );
}
