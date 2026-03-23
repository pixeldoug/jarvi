/**
 * TasksSidebar Component - Jarvi Web
 *
 * Left-rail navigation for the Tasks page.
 *
 * Behaviour
 * ─────────
 * • The six high-level items represent *context* (what the user is looking at),
 *   not filters.
 * • When the user is in the "Todas as tarefas" (all) view, scrolling through the
 *   grouped sections updates the active sidebar item via scroll-spy.  Clicking
 *   a section item scrolls to that section instead of switching views.
 * • In every other view (Hoje, Esta semana, …) clicking an item switches the
 *   view context.
 */

import {
  Checks,
  Flag,
  Couch,
  MoonStars,
  Prohibit,
  CheckCircle,
  Plus,
  Hash,
} from '@phosphor-icons/react';
import { ListItem } from '../../../ui/ListItem';
import styles from './TasksSidebar.module.css';

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

// ── Section-ID constants ──────────────────────────────────────────────────────
// These must match the `id` attributes placed on the section anchor <div>s in
// the Tasks page "all" view.

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

/** Maps a section DOM id → the sidebar ListType that "owns" it. */
export const SECTION_TO_LIST: Record<SectionId, ListType> = {
  'section-vencidas': 'today',
  'section-hoje': 'today',
  'section-amanha': 'week',
  'section-esta-semana': 'week',
  'section-semana-que-vem': 'week',
  'section-eventos-futuros': 'later',
  'section-sem-data': 'noDate',
  'section-completadas': 'completed',
};

/** Maps a sidebar ListType → the first section to scroll to in the all-view. */
export const LIST_TO_SECTION: Partial<Record<ListType, SectionId>> = {
  today: 'section-hoje',
  week: 'section-amanha',
  later: 'section-eventos-futuros',
  noDate: 'section-sem-data',
  completed: 'section-completadas',
};

// ─────────────────────────────────────────────────────────────────────────────

export interface TasksSidebarProps {
  selectedList?: ListType | null;
  selectedCustomListId?: string | null;
  selectedCategory?: CategoryType | null;
  onListSelect?: (listType: ListType) => void;
  onCustomListSelect?: (listId: string) => void;
  onCategorySelect?: (category: CategoryType) => void;
  onAddClick?: () => void;
  addButtonRef?: React.RefObject<HTMLButtonElement>;
  taskCounts?: {
    all?: number;
    today?: number;
    week?: number;
    later?: number;
    noDate?: number;
  };
  categories?: Array<{ id: string; name: string; count: number }>;
  customLists?: Array<{ id: string; name: string }>;
  /**
   * Section ID currently active via scroll-spy (only relevant when
   * `selectedList === 'all'`).  The sidebar derives which nav item to
   * highlight from this value using `SECTION_TO_LIST`.
   */
  activeSectionId?: string | null;
  /**
   * Called when the user clicks a non-"all" item while `selectedList === 'all'`.
   * The Tasks page uses this to scroll-to-section instead of switching views.
   */
  onScrollToSection?: (sectionId: SectionId) => void;
}

// ─── Static nav list ──────────────────────────────────────────────────────────

const NAV_ITEMS: Array<{
  id: ListType;
  label: string;
  icon: typeof Checks;
}> = [
  { id: 'all', label: 'Todas as tarefas', icon: Checks },
  { id: 'today', label: 'Hoje', icon: Flag },
  { id: 'week', label: 'Esta semana', icon: Couch },
  { id: 'later', label: 'Mais pra frente', icon: MoonStars },
  { id: 'noDate', label: 'Sem data', icon: Prohibit },
  { id: 'completed', label: 'Concluídas', icon: CheckCircle },
];

// ─────────────────────────────────────────────────────────────────────────────

export function TasksSidebar({
  selectedList = 'all',
  selectedCustomListId = null,
  selectedCategory,
  onListSelect,
  onCustomListSelect,
  onCategorySelect,
  onAddClick,
  addButtonRef,
  taskCounts = {},
  categories = [],
  customLists = [],
  activeSectionId,
  onScrollToSection,
}: TasksSidebarProps) {
  // Derive which nav item the scroll-spy should highlight (all-view only)
  const scrollSpyList: ListType | null =
    selectedList === 'all' && activeSectionId
      ? (SECTION_TO_LIST[activeSectionId as SectionId] ?? null)
      : null;

  const handleNavClick = (listType: ListType) => {
    if (listType === 'all') {
      // Always switch to all-view / deselect
      onListSelect?.('all');
      return;
    }

    if (selectedList === 'all' && onScrollToSection) {
      // In all-view: scroll to the corresponding section anchor
      const sectionId = LIST_TO_SECTION[listType];
      if (sectionId) {
        onScrollToSection(sectionId);
        return;
      }
    }

    // Filtered view: switch context
    onListSelect?.(listType);
  };

  return (
    <div className={styles.sidebar}>
      {/* Header */}
      <header className={styles.header}>
        <h2 className={styles.title}>Minhas listas</h2>
        {onAddClick && (
          <button
            ref={addButtonRef}
            className={styles.addButton}
            onClick={onAddClick}
            type="button"
            aria-label="Adicionar lista"
          >
            <Plus size={20} weight="regular" />
          </button>
        )}
      </header>

      {/* Body */}
      <div className={styles.body}>
        {/* Primary navigation */}
        <div className={styles.listSection}>
          {NAV_ITEMS.map((item) => {
            const isAllView = selectedList === 'all' && !selectedCategory && !selectedCustomListId;

            let isActive: boolean;
            if (isAllView) {
              if (item.id === 'all') {
                // "Todas as tarefas" is active only when no section is spy-active
                isActive = scrollSpyList === null;
              } else {
                isActive = scrollSpyList === item.id;
              }
            } else {
              isActive =
                selectedList === item.id && !selectedCategory && !selectedCustomListId;
            }

            return (
              <ListItem
                key={item.id}
                label={item.label}
                icon={item.icon}
                active={isActive}
                counter={item.id !== 'all' && item.id !== 'completed' ? taskCounts[item.id as keyof typeof taskCounts] : undefined}
                counterVariant="chip"
                onClick={() => handleNavClick(item.id)}
              />
            );
          })}
        </div>

        {/* Divider */}
        {(customLists.length > 0 || categories.length > 0) && (
          <div className={styles.divider} />
        )}

        {/* Custom lists */}
        {customLists.length > 0 && (
          <div className={styles.listSection}>
            {customLists.map((list) => (
              <ListItem
                key={list.id}
                label={list.name}
                icon={Hash}
                active={selectedCustomListId === list.id}
                onClick={() => onCustomListSelect?.(list.id)}
              />
            ))}
          </div>
        )}

        {customLists.length > 0 && categories.length > 0 && (
          <div className={styles.divider} />
        )}

        {/* Categories */}
        {categories.length > 0 && (
          <div className={styles.listSection}>
            {categories.map((category) => (
              <ListItem
                key={category.id}
                label={category.name}
                icon={Hash}
                active={selectedCategory === category.name}
                counter={category.count}
                counterVariant="chip"
                onClick={() => onCategorySelect?.(category.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
