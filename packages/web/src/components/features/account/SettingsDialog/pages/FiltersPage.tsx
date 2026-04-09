/**
 * FiltersPage - SettingsDialog
 *
 * Manage saved filters (custom lists) that appear in the sidebar.
 * New filters are created via "Salvar como..." in the FilterPopover.
 * Here users can rename and delete existing saved filters.
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
import { useLists } from '../../../../../contexts/ListContext';
import { CategoryRow } from '../../../../ui/CategoryRow';
import { toast } from '../../../../ui/Sonner';
import styles from './FiltersPage.module.css';

// ============================================================================
// COMPONENT
// ============================================================================

export function FiltersPage() {
  const { lists, isLoading, updateList, deleteList } = useLists();

  // Local order: updated optimistically on drag
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Derive final sorted list using local order
  const sortedLists = orderedIds.length
    ? [
        ...orderedIds
          .map((id) => lists.find((l) => l.id === id))
          .filter(Boolean) as typeof lists,
        ...lists.filter((l) => !orderedIds.includes(l.id)),
      ]
    : lists;

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
        await updateList(editingId, { name: trimmed });
      } catch {
        return;
      }
    }
    setEditingId(null);
    setEditValue('');
  }, [editingId, editValue, updateList]);

  const handleEditCancel = useCallback(() => {
    setEditingId(null);
    setEditValue('');
  }, []);

  // ── Delete ──────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteList(id);
        setOrderedIds((prev) => prev.filter((oid) => oid !== id));
      } catch {
        toast.error('Não foi possível excluir o filtro. Tente novamente.');
      }
    },
    [deleteList],
  );

  // ── DnD (visual reorder only) ────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const currentIds = sortedLists.map((l) => l.id);
      const oldIndex = currentIds.indexOf(String(active.id));
      const newIndex = currentIds.indexOf(String(over.id));
      setOrderedIds(arrayMove(currentIds, oldIndex, newIndex));
    },
    [sortedLists],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.headerText}>
        <h1 className={styles.title}>Filtros</h1>
        <p className={styles.subtitle}>
          Gerencie os filtros salvos que aparecem na sua barra lateral.
        </p>
      </div>

      {/* List */}
      <div className={styles.list}>
        {isLoading ? (
          <p className={styles.emptyText}>Carregando…</p>
        ) : sortedLists.length === 0 ? (
          <p className={styles.emptyText}>
            Nenhum filtro salvo ainda. Use o botão "Filtrar" na página de tarefas e clique em "Salvar como..." para criar um.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedLists.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {sortedLists.map((list) => (
                <CategoryRow
                  key={list.id}
                  id={list.id}
                  label={list.name}
                  showVisibility={false}
                  editLabel="Editar Filtro"
                  editing={editingId === list.id}
                  editValue={editValue}
                  onEditChange={setEditValue}
                  onEditSave={() => void handleEditSave()}
                  onEditCancel={handleEditCancel}
                  onEdit={() => handleEditStart(list.id, list.name)}
                  onDelete={() => void handleDelete(list.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
