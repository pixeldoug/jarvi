import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { useLocale } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { Chip } from '@/ui/chip';
import { HashIcon } from '@/ui/icons';
import { useTheme } from '@/theme/theme-provider';
import type { TaskList } from '@/types/models';
import { categoryLabel } from './category-label';
import type { TaskView } from './sections';

interface ViewPickerProps {
  view: TaskView;
  onChange: (view: TaskView) => void;
  categories: string[];
  lists: TaskList[];
}

/** Labels are `tasks:views.<kind>`, resolved while rendering. */
const SMART_VIEWS = ['all', 'inbox', 'overdue', 'recurring'] as const;

/** Same entries as the web sidebar: smart lists, saved filters, then categories. */
export function ViewPicker({ view, onChange, categories, lists }: ViewPickerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('tasks');
  const locale = useLocale();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {SMART_VIEWS.map((kind) => (
        <Chip key={kind} label={t(`views.${kind}`)} selected={view.kind === kind} onPress={() => onChange({ kind })} />
      ))}
      {lists.map((list) => (
        <Chip
          key={list.id}
          label={list.name}
          selected={view.kind === 'list' && view.list.id === list.id}
          onPress={() => onChange({ kind: 'list', list })}
        />
      ))}
      {categories.map((name) => {
        const selected = view.kind === 'category' && view.name === name;
        return (
          <Chip
            key={name}
            label={categoryLabel(name, { locale })}
            icon={<HashIcon size={12} color={selected ? colors.contentInfo : colors.contentSecondary} />}
            selected={selected}
            onPress={() => onChange({ kind: 'category', name })}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
});
