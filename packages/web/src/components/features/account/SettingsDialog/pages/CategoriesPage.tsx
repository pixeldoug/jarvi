/**
 * CategoriesPage - SettingsDialog
 *
 * Manage categories that appear in the sidebar.
 * Features: create, rename (inline), delete, toggle sidebar visibility, drag-to-reorder.
 *
 * Figma: https://figma.com/design/TM2wS5y3DkyW9bvfP7xzHK/JarviDS-App
 * Node: 40001329-122264
 */

import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useCategories } from '../../../../../contexts/CategoryContext';
import { CategoryRow } from '../../../../ui/CategoryRow';
import { PrimaryButton } from '../../../../ui';
import { toast } from '../../../../ui/Sonner';
import styles from './CategoriesPage.module.css';

// ============================================================================
// COMPONENT
// ============================================================================

export function CategoriesPage() {
  const { categories, createCategory, updateCategory, deleteCategory, reorderCategories, isLoading } = useCategories();

  // Local order: mirrors the server order; updated optimistically on drag
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Inline creation
  const [isCreating, setIsCreating] = useState(false);
  const [createValue, setCreateValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Derive final sorted list: orderedIds first, then any new items appended
  const sortedCategories = orderedIds.length
    ? [
        ...orderedIds
          .map((id) => categories.find((c) => c.id === id))
          .filter(Boolean) as typeof categories,
        ...categories.filter((c) => !orderedIds.includes(c.id)),
      ]
    : categories;

  // ── Visibility ──────────────────────────────────────────────────────────

  const isVisible = useCallback(
    (category: typeof categories[number]) => category.visible !== false,
    [],
  );

  const handleToggleVisibility = useCallback((id: string, currentVisible: boolean) => {
    void updateCategory(id, { visible: !currentVisible });
  }, [updateCategory]);

  // ── Edit ────────────────────────────────────────────────────────────────

  const handleEditStart = useCallback((id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editingId) return;
    const trimmed = editValue.trim();
    if (trimmed) {
      try {
        await updateCategory(editingId, { name: trimmed });
      } catch {
        // Keep editing state on error
        return;
      }
    }
    setEditingId(null);
    setEditValue('');
  }, [editingId, editValue, updateCategory]);

  const handleEditCancel = useCallback(() => {
    setEditingId(null);
    setEditValue('');
  }, []);

  // ── Delete ──────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteCategory(id);
        setOrderedIds((prev) => prev.filter((oid) => oid !== id));
      } catch {
        toast.error('Não foi possível excluir a categoria. Tente novamente.');
      }
    },
    [deleteCategory],
  );

  // ── Create ──────────────────────────────────────────────────────────────

  const handleCreateSave = useCallback(async () => {
    const trimmed = createValue.trim();
    if (!trimmed) {
      setIsCreating(false);
      setCreateValue('');
      return;
    }
    setIsSaving(true);
    try {
      await createCategory({ name: trimmed });
    } finally {
      setIsSaving(false);
      setIsCreating(false);
      setCreateValue('');
    }
  }, [createValue, createCategory]);

  const handleCreateCancel = useCallback(() => {
    setIsCreating(false);
    setCreateValue('');
  }, []);

  // ── DnD ─────────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const currentIds = sortedCategories.map((c) => c.id);
      const oldIndex = currentIds.indexOf(String(active.id));
      const newIndex = currentIds.indexOf(String(over.id));
      const newIds = arrayMove(currentIds, oldIndex, newIndex);

      // Optimistic local update
      setOrderedIds(newIds);
      // Persist to server (context also updates cache optimistically)
      void reorderCategories(newIds);
    },
    [sortedCategories, reorderCategories],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Categorias</h1>
          <p className={styles.subtitle}>
            Gerencie as categorias que aparecem na sua barra lateral.
          </p>
        </div>
        <PrimaryButton
          onClick={() => {
            setIsCreating(true);
            setCreateValue('');
          }}
          disabled={isCreating}
        >
          Nova Categoria
        </PrimaryButton>
      </div>

      {/* List */}
      <div className={styles.list}>
        {/* Inline creation row */}
        {isCreating && (
          <div className={`${styles.newRow} ${isSaving ? styles.saving : ''}`}>
            <span className={styles.newRowHash}>#</span>
            <input
              type="text"
              autoFocus
              placeholder="Nome da categoria"
              value={createValue}
              onChange={(e) => setCreateValue(e.target.value)}
              onBlur={() => void handleCreateSave()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void handleCreateSave(); }
                if (e.key === 'Escape') { e.preventDefault(); handleCreateCancel(); }
                e.stopPropagation();
              }}
              className={styles.newRowInput}
              disabled={isSaving}
            />
          </div>
        )}

        {/* Sortable category rows */}
        {isLoading ? (
          <p className={styles.emptyText}>Carregando…</p>
        ) : sortedCategories.length === 0 && !isCreating ? (
          <p className={styles.emptyText}>
            Nenhuma categoria ainda. Clique em "Nova Categoria" para começar.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedCategories.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {sortedCategories.map((category) => (
                <CategoryRow
                  key={category.id}
                  id={category.id}
                  label={category.name}
                  visible={isVisible(category)}
                  editing={editingId === category.id}
                  editValue={editValue}
                  onEditChange={setEditValue}
                  onEditSave={() => void handleEditSave()}
                  onEditCancel={handleEditCancel}
                  onEdit={() => handleEditStart(category.id, category.name)}
                  onDelete={() => void handleDelete(category.id)}
                  onToggleVisibility={() => handleToggleVisibility(category.id, isVisible(category))}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
