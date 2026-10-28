import { ScrollView, StyleSheet } from 'react-native';

import { spacing } from '@/theme/tokens';
import { Chip } from '@/ui/chip';
import { HashIcon } from '@/ui/icons';
import { useTheme } from '@/theme/theme-provider';
import type { TaskList } from '@/types/models';
import type { TaskView } from './sections';

interface ViewPickerProps {
  view: TaskView;
  onChange: (view: TaskView) => void;
  categories: string[];
  lists: TaskList[];
}

const SMART_VIEWS: { kind: 'all' | 'inbox' | 'overdue' | 'recurring'; label: string }[] = [
  { kind: 'all', label: 'Todas' },
  { kind: 'inbox', label: 'Caixa de entrada' },
  { kind: 'overdue', label: 'Vencidas' },
  { kind: 'recurring', label: 'Recorrentes' },
];

/** Same entries as the web sidebar: smart lists, saved filters, then categories. */
export function ViewPicker({ view, onChange, categories, lists }: ViewPickerProps) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {SMART_VIEWS.map((option) => (
        <Chip
          key={option.kind}
          label={option.label}
          selected={view.kind === option.kind}
          onPress={() => onChange({ kind: option.kind })}
        />
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
            label={name}
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
