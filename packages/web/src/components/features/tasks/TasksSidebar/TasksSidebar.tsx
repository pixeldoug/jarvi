/**
 * TasksSidebar Component - Jarvi Web
 * 
 * Sidebar specific to Tasks page with lists and categories
 * Following JarviDS design system from Figma
 */

import {
  Checks,
  FireSimple,
  Flag,
  SunHorizon,
  Couch,
  Prohibit,
  HourglassLow,
  MoonStars,
  Plus,
  Hash,
} from '@phosphor-icons/react';
import { ListItem } from '../../../ui/ListItem';
import styles from './TasksSidebar.module.css';

export type ListType = 'all' | 'important' | 'today' | 'tomorrow' | 'week' | 'later' | 'noDate' | 'overdue';
export type CategoryType = string;

export interface TasksSidebarProps {
  /** Currently selected list */
  selectedList?: ListType | null;
  /** Currently selected custom list id */
  selectedCustomListId?: string | null;
  /** Currently selected category */
  selectedCategory?: CategoryType | null;
  /** Handler when a list is selected */
  onListSelect?: (listType: ListType) => void;
  /** Handler when a custom list is selected */
  onCustomListSelect?: (listId: string) => void;
  /** Handler when a category is selected */
  onCategorySelect?: (category: CategoryType) => void;
  /** Handler for adding a new list/category */
  onAddClick?: () => void;
  /** Ref to the add button (for anchoring popovers) */
  addButtonRef?: React.RefObject<HTMLButtonElement>;
  /** Task counts per list */
  taskCounts?: {
    all?: number;
    important?: number;
    today?: number;
    tomorrow?: number;
    week?: number;
    later?: number;
    noDate?: number;
    overdue?: number;
  };
  /** Categories with their task counts */
  categories?: Array<{
    id: string;
    name: string;
    count: number;
  }>;

  /** Custom lists (saved filters) */
  customLists?: Array<{
    id: string;
    name: string;
  }>;
}

const lists: Array<{
  id: ListType;
  label: string;
  icon: typeof Checks;
}> = [
  { id: 'all', label: 'Todas as tarefas', icon: Checks },
  { id: 'important', label: 'Prioridades', icon: FireSimple },
  { id: 'overdue', label: 'Vencidas', icon: HourglassLow },
  { id: 'today', label: 'Hoje', icon: Flag },
  { id: 'tomorrow', label: 'Amanhã', icon: SunHorizon },
  { id: 'week', label: 'Semana que vem', icon: Couch },
  { id: 'later', label: 'Mais pra frente', icon: MoonStars },
  { id: 'noDate', label: 'Sem data', icon: Prohibit },
];

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
}: TasksSidebarProps) {
  const handleListClick = (listType: ListType) => {
    onListSelect?.(listType);
  };

  const handleCustomListClick = (listId: string) => {
    onCustomListSelect?.(listId);
  };

  const handleCategoryClick = (categoryName: string) => {
    onCategorySelect?.(categoryName);
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
        {/* Lists */}
        <div className={styles.listSection}>
          {lists.map((list) => (
            <ListItem
              key={list.id}
              label={list.label}
              icon={list.icon}
              active={selectedList === list.id && !selectedCategory && !selectedCustomListId}
              counter={taskCounts[list.id]}
              counterVariant="chip"
              onClick={() => handleListClick(list.id)}
            />
          ))}
        </div>

        {/* Divider */}
        {(customLists.length > 0 || categories.length > 0) && <div className={styles.divider} />}

        {/* Custom Lists */}
        {customLists.length > 0 && (
          <div className={styles.listSection}>
            {customLists.map((list) => (
              <ListItem
                key={list.id}
                label={list.name}
                icon={Hash}
                active={selectedCustomListId === list.id}
                onClick={() => handleCustomListClick(list.id)}
              />
            ))}
          </div>
        )}

        {customLists.length > 0 && categories.length > 0 && <div className={styles.divider} />}

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
                onClick={() => handleCategoryClick(category.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

