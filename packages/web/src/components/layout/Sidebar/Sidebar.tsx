/**
 * Sidebar Component - Jarvi Web
 *
 * Global application sidebar. Handles:
 *  - User profile header (avatar, name, plan label, settings/collapse toggle)
 *  - Optional Pro CTA for trialing / free users
 *  - Task navigation items (Todas as tarefas, Hoje, Esta semana, Futuro, Sem data, Vencidas)
 *  - Collapsible "Categorias" group with hover add-button
 *  - Collapsible "Filtros" group (custom lists)
 *  - Expanded (320 px) / Collapsed (56 px) states, toggled internally
 *
 * Figma: https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001333-125371
 */

import { useState, useRef, useEffect, type RefObject } from 'react';
import {
  Checks,
  SunHorizon,
  Couch,
  CalendarDots,
  Tray,
  HourglassLow,
  Hash,
  SlidersHorizontal,
  SidebarSimple,
} from '@phosphor-icons/react';
import { useAuth } from '../../../contexts/AuthContext';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import { Avatar } from '../../ui/Avatar/Avatar';
import { Button } from '../../ui/Button/Button';
import { ListItem } from '../../ui/ListItem/ListItem';
import { Dropdown, Tooltip } from '../../ui';
import { SettingsDialog, type SettingsPage } from '../../features/account/SettingsDialog/SettingsDialog';
import { SidebarEmptyState } from './SidebarEmptyState';
import { SidebarGroupHeader } from './SidebarGroupHeader';
import { SidebarUserMenu } from './SidebarUserMenu';
import { UpgradeButton } from '../../ui/UpgradeButton/UpgradeButton';
import { useNavigate, useLocation } from 'react-router-dom';
import { SignOut, Gear } from '@phosphor-icons/react';
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
  selectedCustomListId?: string | null;
  selectedCategory?: CategoryType | null;
  onListSelect?: (listType: ListType) => void;
  onCustomListSelect?: (listId: string) => void;
  onCategorySelect?: (category: CategoryType) => void;
  addButtonRef?: RefObject<HTMLButtonElement>;
  taskCounts?: {
    all?: number;
    today?: number;
    week?: number;
    later?: number;
    noDate?: number;
  };
  categories?: Array<{ id: string; name: string; count: number }>;
  customLists?: Array<{ id: string; name: string }>;
  activeSectionId?: string | null;
  onScrollToSection?: (sectionId: SectionId) => void;
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: Array<{ id: ListType; label: string; icon: typeof Checks }> = [
  { id: 'all', label: 'Todas as tarefas', icon: Checks },
  { id: 'today', label: 'Hoje', icon: SunHorizon },
  { id: 'week', label: 'Esta semana', icon: Couch },
  { id: 'later', label: 'Futuro', icon: CalendarDots },
  { id: 'noDate', label: 'Sem data', icon: Tray },
  { id: 'overdue', label: 'Vencidas', icon: HourglassLow },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar({
  selectedList = 'all',
  selectedCustomListId = null,
  selectedCategory,
  onListSelect,
  onCustomListSelect,
  onCategorySelect,
  addButtonRef,
  taskCounts = {},
  categories = [],
  customLists = [],
  activeSectionId,
  onScrollToSection,
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(() => categories.length > 0);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(() => customLists.length > 0);

  useEffect(() => {
    if (categories.length > 0) setIsCategoriesExpanded(true);
  }, [categories.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (customLists.length > 0) setIsFiltersExpanded(true);
  }, [customLists.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialPage, setSettingsInitialPage] = useState<SettingsPage>('profile');

  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const { user, logout } = useAuth();
  const { subscription, daysLeftInTrial } = useSubscription();

  const showProCta = subscription?.status !== 'active';

  useEffect(() => {
    if (location.pathname === '/settings') {
      setIsSettingsOpen(true);
    }
  }, [location.pathname]);

  // ── Scroll-spy highlight ────────────────────────────────────────────────────
  const scrollSpyList: ListType | null =
    selectedList === 'all' && activeSectionId
      ? (SECTION_TO_LIST[activeSectionId as SectionId] ?? null)
      : null;

  // ── Nav click handler ───────────────────────────────────────────────────────
  const handleNavClick = (listType: ListType) => {
    if (listType === 'all') {
      onListSelect?.('all');
      return;
    }

    if (selectedList === 'all' && onScrollToSection) {
      const sectionId = LIST_TO_SECTION[listType];
      if (sectionId) {
        onScrollToSection(sectionId);
        return;
      }
    }

    onListSelect?.(listType);
  };

  const isNavItemActive = (itemId: ListType): boolean => {
    const isAllView =
      selectedList === 'all' && !selectedCategory && !selectedCustomListId;

    if (isAllView) {
      if (itemId === 'all') return scrollSpyList === null;
      return scrollSpyList === itemId;
    }

    return (
      selectedList === itemId && !selectedCategory && !selectedCustomListId
    );
  };

  // ── User info ───────────────────────────────────────────────────────────────
  const userName = user?.name || 'Usuário';
  const userAvatar = user?.avatar;
  const planLabel =
    subscription?.status === 'trialing' && daysLeftInTrial !== null && daysLeftInTrial > 0
      ? `${daysLeftInTrial} dias para testar`
      : subscription?.status === 'active'
        ? 'Plano Pro'
        : 'Plano Gratuito';

  const handleLogout = () => {
    setIsDropdownOpen(false);
    logout();
  };

  const handleSettings = () => {
    setIsDropdownOpen(false);
    setSettingsInitialPage('profile');
    setIsSettingsOpen(true);
  };

  const handleUpgradeClick = () => {
    setSettingsInitialPage('payments');
    setIsSettingsOpen(true);
  };

  const handleAddCategory = () => {
    setSettingsInitialPage('categories');
    setIsSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    navigate('/tasks', { replace: true });
  };

  // ── Single root — animates between expanded / collapsed via CSS ─────────────
  return (
    <div
      className={styles.sidebar}
      data-collapsed={isCollapsed || undefined}
    >
      {/* ── Collapsed panel (absolutely fills root, fades in when collapsed) ── */}
      <div className={styles.collapsedPanel}>
        {/* Avatar button */}
        <Tooltip label={userName} position="right" showDelay={300}>
          <button
            ref={profileButtonRef}
            className={styles.collapsedAvatarButton}
            onClick={() => setIsDropdownOpen((v) => !v)}
            type="button"
            aria-label="Menu do usuário"
          >
            <Avatar src={userAvatar} name={userName} size="medium" />
          </button>
        </Tooltip>

        {/* Expand toggle */}
        <Tooltip label="Expandir" position="right" showDelay={300}>
          <Button
            variant="ghost"
            size="medium"
            icon={SidebarSimple}
            iconPosition="icon-only"
            onClick={() => setIsCollapsed(false)}
            aria-label="Expandir sidebar"
          />
        </Tooltip>

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

        {/* Custom lists icon */}
        {customLists.length > 0 && (
          <div className={styles.collapsedNavList}>
            <Tooltip label="Filtros" position="right" showDelay={300}>
              <Button
                variant="ghost"
                size="small"
                icon={SlidersHorizontal}
                iconPosition="icon-only"
                className={styles.collapsedNavButton}
                aria-label="Filtros"
              />
            </Tooltip>
          </div>
        )}
      </div>

      {/* ── Expanded panel (fades out when collapsed) ── */}
      <div className={styles.expandedPanel}>
        {/* SidebarHeader */}
        <div className={styles.header}>
          {/* User row */}
          <div className={styles.userRow}>
            <SidebarUserMenu
              ref={profileButtonRef}
              src={userAvatar}
              name={userName}
              plan={planLabel}
              isActive={isDropdownOpen}
              onClick={() => setIsDropdownOpen((v) => !v)}
            />

            <Button
              variant="ghost"
              size="small"
              icon={SidebarSimple}
              iconPosition="icon-only"
              onClick={() => setIsCollapsed(true)}
              aria-label="Recolher sidebar"
            />
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
                  counter={
                    item.id !== 'all' && item.id !== 'overdue' && item.id !== 'completed'
                      ? taskCounts[item.id as keyof typeof taskCounts]
                      : undefined
                  }
                  counterVariant="chip"
                  onClick={() => handleNavClick(item.id)}
                />
              ))}
            </div>
          </div>

          {/* Categorias group */}
          <div className={styles.groupSection}>
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
              <div className={styles.navList}>
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <ListItem
                      key={category.id}
                      label={category.name}
                      icon={Hash}
                      active={selectedCategory === category.name}
                      counter={category.count}
                      counterVariant="chip"
                      onClick={() => onCategorySelect?.(category.name)}
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

          {/* Filtros group */}
          <div className={styles.groupSection}>
            <div className={styles.groupHeaderWrapper}>
              <SidebarGroupHeader
                label="Filtros"
                isExpanded={isFiltersExpanded}
                onToggle={() => setIsFiltersExpanded((v) => !v)}
              />
            </div>
            {isFiltersExpanded && (
              <div className={styles.navList}>
                {customLists.length > 0 ? (
                  customLists.map((list) => (
                    <ListItem
                      key={list.id}
                      label={list.name}
                      icon={SlidersHorizontal}
                      active={selectedCustomListId === list.id}
                      onClick={() => onCustomListSelect?.(list.id)}
                    />
                  ))
                ) : (
                  <SidebarEmptyState
                    description="Use filtros para organizar tarefas com critérios personalizados."
                    buttonLabel="Criar filtro"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Shared: Dropdown + Settings — always rendered regardless of state */}
      <Dropdown
        isOpen={isDropdownOpen}
        onClose={() => setIsDropdownOpen(false)}
        anchorRef={profileButtonRef}
        align={isCollapsed ? 'right' : 'left'}
        width={200}
      >
        <ListItem label="Minha Conta" icon={Gear} onClick={handleSettings} />
        <ListItem label="Sair" icon={SignOut} onClick={handleLogout} />
      </Dropdown>

      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        initialPage={settingsInitialPage}
      />
    </div>
  );
}
