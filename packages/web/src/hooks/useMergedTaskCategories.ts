import { useMemo } from 'react';
import { useCategories, type Category } from '../contexts/CategoryContext';
import { useTasks } from '../contexts/TaskContext';

export interface MergedTaskCategory extends Category {
  count: number;
}

const normalizeCategoryName = (value: string): string => value.trim().toLowerCase();

/**
 * Merges category catalog with task-derived category strings.
 * - Known categories always remain available (including zero-count entries)
 * - Unknown task categories are exposed as synthetic categories
 */
export function useMergedTaskCategories(): MergedTaskCategory[] {
  const { categories } = useCategories();
  const { tasks } = useTasks();

  return useMemo(() => {
    const knownByNormalized = new Map<string, Category>();
    const countsByKnownId = new Map<string, number>();
    const unknownByNormalized = new Map<string, { id: string; name: string; count: number }>();

    for (const category of categories) {
      knownByNormalized.set(normalizeCategoryName(category.name), category);
      countsByKnownId.set(category.id, 0);
    }

    for (const task of tasks) {
      const rawCategory = task.category?.trim();
      if (!rawCategory) continue;

      const normalized = normalizeCategoryName(rawCategory);
      const knownCategory = knownByNormalized.get(normalized);

      if (knownCategory) {
        countsByKnownId.set(
          knownCategory.id,
          (countsByKnownId.get(knownCategory.id) || 0) + 1
        );
        continue;
      }

      const existingUnknown = unknownByNormalized.get(normalized);
      if (existingUnknown) {
        existingUnknown.count += 1;
      } else {
        unknownByNormalized.set(normalized, {
          id: `name:${rawCategory}`,
          name: rawCategory,
          count: 1,
        });
      }
    }

    const knownCategories: MergedTaskCategory[] = categories.map((category) => ({
      ...category,
      count: countsByKnownId.get(category.id) || 0,
    }));

    const unknownCategories: MergedTaskCategory[] = Array.from(unknownByNormalized.values()).map(
      (unknownCategory) => ({
        id: unknownCategory.id,
        user_id: '',
        name: unknownCategory.name,
        color: undefined,
        icon: undefined,
        created_at: '',
        updated_at: '',
        count: unknownCategory.count,
      })
    );

    return [...knownCategories, ...unknownCategories].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, tasks]);
}
