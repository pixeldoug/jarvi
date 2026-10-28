import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/client';
import {
  COLLAPSED_BY_DEFAULT,
  sectionsForView,
  type SectionId,
  type TaskView,
} from '@/features/tasks/sections';
import { TaskRow } from '@/features/tasks/task-row';
import { useCategoryNames, useLists, useTasks } from '@/features/tasks/use-tasks';
import { useToggleWithFeedback } from '@/features/tasks/use-toggle-with-feedback';
import { ViewPicker } from '@/features/tasks/view-picker';
import { formatLongDate } from '@/lib/dates';
import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { CaretDownIcon, CaretRightIcon, PlusIcon, SparkleIcon } from '@/ui/icons';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { Text } from '@/ui/text';
import type { Task } from '@/types/models';

const EMPTY_COPY: Record<TaskView['kind'], { title: string; description: string }> = {
  all: { title: 'Nada por aqui', description: 'Crie uma tarefa ou conte para a Jarvi o que você precisa fazer.' },
  inbox: { title: 'Caixa de entrada vazia', description: 'Tarefas sem data aparecem aqui.' },
  overdue: { title: 'Nada vencido', description: 'Você está em dia.' },
  recurring: { title: 'Nenhuma tarefa recorrente', description: 'Tarefas que se repetem aparecem aqui.' },
  category: { title: 'Nada nesta categoria', description: 'Tarefas desta categoria aparecem aqui.' },
  list: { title: 'Nada neste filtro', description: 'Tarefas que combinam com este filtro aparecem aqui.' },
};

export default function TasksScreen() {
  const { colors } = useTheme();
  const tasks = useTasks();
  const lists = useLists();
  const categories = useCategoryNames();
  const toggle = useToggleWithFeedback();
  const [view, setView] = useState<TaskView>({ kind: 'all' });
  const [collapsed, setCollapsed] = useState<ReadonlySet<SectionId>>(COLLAPSED_BY_DEFAULT);
  const [refreshing, setRefreshing] = useState(false);
  const today = useToday();

  const sections = useMemo(() => sectionsForView(tasks.data ?? [], view, today), [tasks.data, view, today]);
  const visibleSections = useMemo(
    () => sections.map((section) => ({ ...section, count: section.data.length, data: collapsed.has(section.id) ? [] : section.data })),
    [sections, collapsed],
  );
  // Smart views are a single list; only date-sectioned views collapse.
  const collapsible = view.kind === 'all' || view.kind === 'category' || view.kind === 'list';

  const openTask = useCallback((task: Task) => router.push({ pathname: '/tarefa/[id]', params: { id: task.id } }), []);

  const toggleSection = (id: SectionId) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([tasks.refetch(), lists.refetch()]);
    setRefreshing(false);
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <Text variant="heading-lg">Tarefas</Text>
          <Text variant="body-sm" color="contentSecondary">
            {formatLongDate(today)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nova tarefa"
          hitSlop={8}
          onPress={() => router.push('/nova-tarefa')}
          style={({ pressed }) => [styles.addButton, { backgroundColor: colors.surfaceAccent, opacity: pressed ? 0.8 : 1 }]}
        >
          <PlusIcon size={20} color={colors.contentOnAccent} weight="bold" />
        </Pressable>
      </View>
      <ViewPicker view={view} onChange={setView} categories={categories} lists={lists.data ?? []} />
    </View>
  );

  let body;
  if (tasks.isPending) {
    body = <LoadingState />;
  } else if (tasks.isError && !tasks.data) {
    body = <ErrorState message={errorMessage(tasks.error)} onRetry={() => void tasks.refetch()} />;
  } else {
    body = (
      <SectionList
        sections={visibleSections}
        keyExtractor={(task) => task.id}
        renderItem={({ item }) => <TaskRow task={item} today={today} onToggle={toggle} onOpen={openTask} />}
        renderSectionHeader={({ section }) =>
          collapsible ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: !collapsed.has(section.id) }}
              accessibilityLabel={`${section.title}, ${section.count} tarefas`}
              onPress={() => toggleSection(section.id)}
              style={[styles.sectionHeader, { backgroundColor: colors.surfacePrimary }]}
            >
              {collapsed.has(section.id) ? (
                <CaretRightIcon size={14} color={colors.contentSecondary} weight="bold" />
              ) : (
                <CaretDownIcon size={14} color={colors.contentSecondary} weight="bold" />
              )}
              <Text variant="label-md" color={section.id === 'overdue' ? 'contentNegative' : 'contentPrimary'}>
                {section.title}
              </Text>
              <Text variant="label-sm" color="contentTertiary">
                {section.count}
              </Text>
            </Pressable>
          ) : null
        }
        stickySectionHeadersEnabled={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={visibleSections.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon={<SparkleIcon size={32} color={colors.contentInfo} />}
            title={EMPTY_COPY[view.kind].title}
            description={EMPTY_COPY[view.kind].description}
            actionLabel={view.kind === 'all' ? 'Falar com a Jarvi' : undefined}
            onAction={view.kind === 'all' ? () => router.navigate('/jarvi') : undefined}
          />
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.contentInfo} />}
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.surfacePrimary }]}>
      {header}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingTop: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  titleBlock: {
    flex: 1,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.xxl * 2,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
