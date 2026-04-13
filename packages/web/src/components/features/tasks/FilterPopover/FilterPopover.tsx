/**
 * FilterPopover - Jarvi Web
 *
 * Figma (empty): https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001094-31180
 * Figma (filled): https://www.figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App?node-id=40001094-31266
 *
 * Keeps an internal "draft" state. Filters are only committed to the parent
 * when the user clicks "Aplicar". "Limpar" wipes the draft and the applied
 * state immediately. "Salvar como..." shows an inline input that creates a
 * new custom list (via ListContext) named by the user.
 */

import { useEffect, useRef, useState } from 'react';
import { Fire, Hash } from '@phosphor-icons/react';
import { Button, Dropdown, Select, Switch, TagInput } from '../../../ui';
import type { SelectOption } from '../../../ui/Select';
import { useLists } from '../../../../contexts/ListContext';
import { toast } from '../../../ui/Sonner';
import styles from './FilterPopover.module.css';

// ============================================================================
// TYPES
// ============================================================================

export interface FilterState {
  priority: string;
  category: string[];
  connectedApp: string;
  showCompleted: boolean;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  priority: '',
  category: [],
  connectedApp: '',
  showCompleted: true,
};

export function hasActiveFilters(filters: FilterState): boolean {
  return (
    Boolean(filters.priority) ||
    filters.category.length > 0 ||
    Boolean(filters.connectedApp) ||
    !filters.showCompleted
  );
}

export interface FilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Currently applied (committed) filters */
  filters: FilterState;
  /** Called with new filters when the user clicks "Aplicar" or "Limpar" */
  onFiltersChange: (filters: FilterState) => void;
  categoryOptions: SelectOption[];
  /** Called with the new list id after a successful "Salvar como..." */
  onListSaved?: (listId: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRIORITY_OPTIONS = [
  {
    value: 'low',
    label: 'Baixa',
    iconNode: <Fire size={16} weight="fill" style={{ color: '#60A5FA' }} />,
  },
  {
    value: 'medium',
    label: 'Média',
    iconNode: <Fire size={16} weight="fill" style={{ color: '#FCD34D' }} />,
  },
  {
    value: 'high',
    label: 'Urgente',
    iconNode: <Fire size={16} weight="fill" style={{ color: '#F87171' }} />,
  },
];

const CONNECTED_APP_OPTIONS = [{ value: 'whatsapp', label: 'WhatsApp' }];

// ============================================================================
// COMPONENT
// ============================================================================

export function FilterPopover({
  isOpen,
  onClose,
  anchorRef,
  filters,
  onFiltersChange,
  categoryOptions,
  onListSaved,
}: FilterPopoverProps) {
  const { createList } = useLists();

  // Internal draft — only committed on "Aplicar"
  const [draft, setDraft] = useState<FilterState>(filters);

  // Tracks which Select dropdown is currently open (one at a time)
  const [openDropdown, setOpenDropdown] = useState<'priority' | 'connectedApp' | null>(null);

  const handleDropdownOpenChange = (key: 'priority' | 'connectedApp') => (open: boolean) => {
    setOpenDropdown(open ? key : null);
  };

  // "Salvar como..." inline form state
  const [isSaveView, setIsSaveView] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);

  // Sync draft when popover opens or applied filters change externally
  useEffect(() => {
    if (isOpen) {
      setDraft(filters);
    } else {
      // Reset save view and any open dropdowns when popover closes
      setIsSaveView(false);
      setSaveName('');
      setOpenDropdown(null);
    }
  }, [isOpen, filters]);

  // Auto-focus save input when entering save view
  useEffect(() => {
    if (isSaveView) {
      const id = setTimeout(() => saveInputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isSaveView]);

  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const hasDraftFilters = hasActiveFilters(draft);
  const hasApplied = hasActiveFilters(filters);

  const handleApply = () => {
    onFiltersChange(draft);
    onClose();
  };

  const handleClear = () => {
    setDraft(DEFAULT_FILTER_STATE);
    onFiltersChange(DEFAULT_FILTER_STATE);
    setIsSaveView(false);
    setSaveName('');
  };

  const handleSave = async () => {
    const name = saveName.trim();
    if (!name || isSaving) return;

    try {
      setIsSaving(true);
      const newList = await createList({
        name,
        categoryNames: filters.category,
      });
      toast.success('Filtro salvo como lista');
      setIsSaveView(false);
      setSaveName('');
      onClose();
      onListSaved?.(newList.id);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar filtro');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && saveName.trim()) {
      void handleSave();
    }
    if (e.key === 'Escape') {
      setIsSaveView(false);
      setSaveName('');
    }
  };

  return (
    <Dropdown
      isOpen={isOpen}
      onClose={onClose}
      anchorRef={anchorRef}
      width={310}
      align="right"
    >
      {/* Neutralise the Dropdown's built-in content padding and render our own layout */}
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>Filtrar</span>
          <button
            type="button"
            className={[styles.clearBtn, !hasDraftFilters && styles.clearBtnDisabled]
              .filter(Boolean)
              .join(' ')}
            onClick={handleClear}
            disabled={!hasDraftFilters}
          >
            Limpar
          </button>
        </div>

        {/* Fields */}
        <div className={styles.fields}>
          <Select
            label="Prioridade"
            placeholder="Todas"
            value={draft.priority}
            options={PRIORITY_OPTIONS}
            onChange={(e) => set('priority', e.target.value)}
            isOpen={openDropdown === 'priority'}
            onIsOpenChange={handleDropdownOpenChange('priority')}
          />
          <TagInput
            label="Categoria"
            placeholder="Todas"
            tags={draft.category.map((c) => ({ id: c, label: c }))}
            onTagsChange={(tags) => set('category', tags.map((t) => t.label))}
            options={categoryOptions.map((o) => ({ id: o.value, label: o.label }))}
            optionIcon={Hash}
            showBadgePrefix={false}
          />
          <Select
            label="Aplicativos Conectados"
            placeholder="Todos"
            value={draft.connectedApp}
            options={CONNECTED_APP_OPTIONS}
            onChange={(e) => set('connectedApp', e.target.value)}
            isOpen={openDropdown === 'connectedApp'}
            onIsOpenChange={handleDropdownOpenChange('connectedApp')}
          />

          <div className={styles.switchRow}>
            <Switch
              checked={draft.showCompleted}
              onChange={(checked) => set('showCompleted', checked)}
              aria-labelledby="filter-show-completed-label"
            />
            <span id="filter-show-completed-label" className={styles.switchLabel}>
              Mostrar Tarefas Concluídas
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <Button
            type="button"
            variant="primary"
            size="medium"
            fullWidth
            disabled={!hasDraftFilters}
            onClick={handleApply}
          >
            Aplicar
          </Button>

          {hasApplied && !isSaveView && (
            <Button
              type="button"
              variant="ghost"
              size="medium"
              fullWidth
              onClick={() => setIsSaveView(true)}
            >
              Salvar como...
            </Button>
          )}

          {/* Inline "save as" form — same pattern as CategoryPicker create view */}
          {isSaveView && (
            <div className={styles.saveView}>
              <p className={styles.saveLabel}>Nome do filtro</p>
              <input
                ref={saveInputRef}
                type="text"
                className={styles.saveInput}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={handleSaveKeyDown}
                placeholder="Ex: Alta prioridade, Trabalho..."
                disabled={isSaving}
              />
              <div className={styles.saveActions}>
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  className={styles.saveCancel}
                  onClick={() => {
                    setIsSaveView(false);
                    setSaveName('');
                  }}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="small"
                  className={styles.saveConfirm}
                  disabled={!saveName.trim() || isSaving}
                  loading={isSaving}
                  onClick={() => void handleSave()}
                >
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dropdown>
  );
}
