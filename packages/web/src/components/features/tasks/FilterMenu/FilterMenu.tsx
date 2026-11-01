/**
 * FilterMenu - Jarvi Web
 *
 * The Tasks page "Filtrar" menu. Each facet (Status, Prioridade, App,
 * Categoria, Nota) opens a submenu beside its row, where every option is a
 * checkbox with its task count. A pick applies at once (no "Aplicar"). On
 * mobile the submenu replaces the facet list, with a row back.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CaretLeft,
  CaretRight,
  CheckCircle,
  Fire,
  Hash,
  HourglassLow,
  Repeat,
  Tray,
  X,
} from '@phosphor-icons/react';
import { Divider, Dropdown, ListItem, NoteIcon } from '../../../ui';
import { TaskCheckbox } from '../TaskCheckbox';
import { useMediaQuery } from '../../../../hooks/useMediaQuery';
import { useNotesList } from '../../../../hooks/useNotes';
import { MOBILE_BREAKPOINT } from '../../../layout/MainLayout/MainLayout';
import type { Task } from '../../../../contexts/TaskContext';
import {
  EMPTY_TASK_FILTERS,
  NO_CATEGORY,
  countActiveFilters,
  countFacetOptions,
  type TaskFilterFacet,
  type TaskFilters,
} from '../../../../lib/taskFilters';
import whatsappIcon from '../../../../assets/icons/whatsapp.svg';
import gmailIcon from '../../../../assets/icons/gmail.svg';
import styles from './FilterMenu.module.css';

// ============================================================================
// TYPES
// ============================================================================

export interface FilterMenuProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Tasks the filters narrow down (the current view, unfiltered): the counts come from them */
  tasks: Task[];
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  /** Category names, in sidebar order */
  categories: string[];
}

interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FACETS: Array<{ id: TaskFilterFacet; label: string }> = [
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Prioridade' },
  { id: 'app', label: 'App' },
  { id: 'category', label: 'Categoria' },
  { id: 'note', label: 'Nota' },
];

const STATUS_OPTIONS: FilterOption[] = [
  { value: 'overdue', label: 'Vencidas', icon: <HourglassLow size={16} /> },
  { value: 'recurring', label: 'Recorrentes', icon: <Repeat size={16} /> },
  { value: 'inbox', label: 'Caixa de entrada', icon: <Tray size={16} /> },
  { value: 'completed', label: 'Concluídas', icon: <CheckCircle size={16} /> },
];

// Same labels and colors as PriorityPicker
const PRIORITY_OPTIONS: FilterOption[] = [
  { value: 'high', label: 'Urgente', icon: <Fire size={16} weight="fill" color="#F87171" /> },
  { value: 'medium', label: 'Média', icon: <Fire size={16} weight="fill" color="#FCD34D" /> },
  { value: 'low', label: 'Baixa', icon: <Fire size={16} weight="fill" color="#60A5FA" /> },
  { value: 'none', label: 'Sem prioridade' },
];

const APP_OPTIONS: FilterOption[] = [
  { value: 'whatsapp', label: 'WhatsApp', icon: <img src={whatsappIcon} alt="" /> },
  { value: 'gmail', label: 'Gmail', icon: <img src={gmailIcon} alt="" /> },
];

/** Shown when a facet built from the tasks has no option */
const EMPTY_MESSAGES: Partial<Record<TaskFilterFacet, string>> = {
  category: 'Nenhuma tarefa com categoria.',
  note: 'Nenhuma tarefa veio de uma nota.',
};

// Lets a diagonal move toward the open submenu cross other rows without swapping it
const HOVER_SWITCH_DELAY_MS = 150;

// ============================================================================
// COMPONENT
// ============================================================================

export function FilterMenu({
  isOpen,
  onClose,
  anchorRef,
  tasks,
  filters,
  onFiltersChange,
  categories,
}: FilterMenuProps) {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const { data: notes } = useNotesList();
  const [activeFacet, setActiveFacet] = useState<TaskFilterFacet | null>(null);

  const rowRefs = useRef<Partial<Record<TaskFilterFacet, HTMLDivElement | null>>>({});
  const submenuAnchorRef = useRef<HTMLElement | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) {
      window.clearTimeout(hoverTimer.current);
      setActiveFacet(null);
    }
  }, [isOpen]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const counts = useMemo(
    () => (activeFacet ? countFacetOptions(tasks, filters, activeFacet) : new Map<string, number>()),
    [tasks, filters, activeFacet],
  );

  const openFacet = (facet: TaskFilterFacet) => {
    window.clearTimeout(hoverTimer.current);
    submenuAnchorRef.current = rowRefs.current[facet] ?? null;
    setActiveFacet(facet);
  };

  const handleFacetHover = (facet: TaskFilterFacet) => {
    if (isMobile) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(
      () => openFacet(facet),
      activeFacet ? HOVER_SWITCH_DELAY_MS : 0,
    );
  };

  const toggle = (facet: TaskFilterFacet, value: string) => {
    const selected: string[] = filters[facet];
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onFiltersChange({ ...filters, [facet]: next } as TaskFilters);
  };

  const optionsFor = (facet: TaskFilterFacet): FilterOption[] => {
    const selected: string[] = filters[facet];
    // Built from the tasks: only what they hold (or is already picked)
    const present = (value: string) => (counts.get(value) ?? 0) > 0 || selected.includes(value);

    switch (facet) {
      case 'status':
        return STATUS_OPTIONS;
      case 'priority':
        return PRIORITY_OPTIONS;
      case 'app':
        return APP_OPTIONS;
      case 'category': {
        const names = [...categories];
        for (const value of [...counts.keys(), ...selected]) {
          if (value !== NO_CATEGORY && !names.includes(value)) names.push(value);
        }
        const options: FilterOption[] = names
          .filter(present)
          .map((name) => ({ value: name, label: name, icon: <Hash size={16} /> }));
        if (present(NO_CATEGORY)) options.push({ value: NO_CATEGORY, label: 'Sem categoria' });
        return options;
      }
      case 'note': {
        // Notes list order (last updated first); a note missing from it goes last
        const ids = [...new Set([...counts.keys(), ...selected])];
        const order = new Map((notes ?? []).map((note, index) => [note.id, index]));
        const titles = new Map((notes ?? []).map((note) => [note.id, note.title.trim() || 'Nova nota']));
        return ids
          .sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity))
          .map((id) => ({ value: id, label: titles.get(id) ?? 'Nota', icon: <NoteIcon size={16} /> }));
      }
    }
  };

  const renderOptions = (facet: TaskFilterFacet) => {
    const options = optionsFor(facet);
    if (options.length === 0) {
      return <p className={styles.empty}>{EMPTY_MESSAGES[facet]}</p>;
    }
    const selected: string[] = filters[facet];
    return (
      <div className={styles.options}>
        {options.map((option) => (
          <div
            key={option.value}
            className={styles.option}
            onClick={() => toggle(facet, option.value)}
          >
            <TaskCheckbox
              checked={selected.includes(option.value)}
              onChange={() => toggle(facet, option.value)}
              ariaLabel={option.label}
            />
            {option.icon && <span className={styles.optionIcon}>{option.icon}</span>}
            <span className={styles.optionLabel} title={option.label}>
              {option.label}
            </span>
            <span className={styles.optionCount}>{counts.get(option.value) ?? 0}</span>
          </div>
        ))}
      </div>
    );
  };

  const facetList = (
    <>
      {FACETS.map((facet) => (
        <div
          key={facet.id}
          ref={(el) => {
            rowRefs.current[facet.id] = el;
          }}
          onMouseEnter={() => handleFacetHover(facet.id)}
          onMouseLeave={() => window.clearTimeout(hoverTimer.current)}
        >
          <ListItem
            label={facet.label}
            counter={filters[facet.id].length}
            counterVariant="chip"
            active={activeFacet === facet.id}
            trailing={<CaretRight size={16} />}
            onClick={() => openFacet(facet.id)}
            buttonProps={{ 'aria-haspopup': 'menu', 'aria-expanded': activeFacet === facet.id }}
          />
        </div>
      ))}
      {countActiveFilters(filters) > 0 && (
        <>
          <Divider className={styles.divider} />
          <ListItem label="Limpar filtros" icon={X} onClick={() => onFiltersChange(EMPTY_TASK_FILTERS)} />
        </>
      )}
    </>
  );

  const activeFacetLabel = FACETS.find((facet) => facet.id === activeFacet)?.label ?? '';

  return (
    <>
      <Dropdown isOpen={isOpen} onClose={onClose} anchorRef={anchorRef} width={232} align="right">
        {isMobile && activeFacet ? (
          <>
            <ListItem label={activeFacetLabel} icon={CaretLeft} onClick={() => setActiveFacet(null)} />
            <Divider className={styles.divider} />
            {renderOptions(activeFacet)}
          </>
        ) : (
          facetList
        )}
      </Dropdown>

      {/* Desktop submenu, keyed so it re-anchors on the newly hovered row */}
      {!isMobile && (
        <Dropdown
          key={activeFacet ?? 'none'}
          isOpen={isOpen && activeFacet !== null}
          onClose={onClose}
          anchorRef={submenuAnchorRef}
          beside
          // Note titles run long: give them room before truncating
          width={activeFacet === 'note' ? 400 : 272}
          gap={4}
          // Lines the first option up with the row (content padding + border)
          offsetY={-9}
          zIndex={1001}
        >
          {activeFacet && renderOptions(activeFacet)}
        </Dropdown>
      )}
    </>
  );
}
