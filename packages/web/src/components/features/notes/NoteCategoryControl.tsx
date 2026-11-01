/**
 * NoteCategoryControl — the "# Categoria" chip under the note title (as in the
 * task form; shows the category name once set) + the tasks' CategoryPicker,
 * over the same categories as tasks. Saves right away; owner only (the caller
 * decides when to render it).
 */

import { useRef, useState } from 'react';
import { Hash } from '@phosphor-icons/react';
import { Chip } from '../../ui';
import { toast } from '../../ui/Sonner';
import { CategoryPicker, type Category } from '../tasks/CategoryPicker';
import { useCategories } from '../../../contexts/CategoryContext';
import { useMergedTaskCategories } from '../../../hooks/useMergedTaskCategories';
import { useNoteMutations } from '../../../hooks/useNotes';

export interface NoteCategoryControlProps {
  noteId: string;
  category: string | null;
}

export function NoteCategoryControl({ noteId, category }: NoteCategoryControlProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const categories = useMergedTaskCategories();
  const { createCategory } = useCategories();
  const { updateNoteMeta } = useNoteMutations();

  const save = async (next: string | null) => {
    try {
      await updateNoteMeta(noteId, { category: next });
    } catch (error) {
      console.error('Failed to update note category:', error);
      toast.error('Não foi possível atualizar a categoria.');
    }
  };

  const handleCreate = async (name: string) => {
    try {
      const created = await createCategory({ name: name.trim() });
      await save(created.name);
    } catch (error) {
      console.error('Failed to create category:', error);
      toast.error('Não foi possível criar a categoria.');
    }
  };

  return (
    <div ref={anchorRef} style={{ display: 'inline-flex' }}>
      <Chip
        label={category || 'Categoria'}
        icon={<Hash size={16} weight="regular" />}
        size="medium"
        interactive
        active={!!category || isOpen}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        onClear={category ? () => void save(null) : undefined}
      />
      <CategoryPicker
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        categories={categories}
        selectedCategory={category ?? undefined}
        onSelectCategory={(selected: Category) => void save(selected.name)}
        onCreateCategory={(name) => void handleCreate(name)}
        onClearCategory={() => void save(null)}
        anchorRef={anchorRef}
      />
    </div>
  );
}
