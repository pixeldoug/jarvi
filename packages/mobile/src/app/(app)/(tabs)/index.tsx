import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useFormat } from '@/i18n';
import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { CaretDownIcon, CaretRightIcon, PlusIcon, SparkleIcon } from '@/ui/icons';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { Text } from '@/ui/text';
import type { Task } from '@/types/models';

export default function TasksScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation('tasks');
  const { formatDate } = useFormat();
  const tasks = useTasks();
  const lists = useLists();
  const categories = useCategoryNames();
  const toggle = useToggleWithFeedback();
  const [view, setView] = useState<TaskView>({ kind: 'all' });
  const [collapsed, setCollapsed] = useState<ReadonlySet<SectionId>>(COLLAPSED_BY_DEFAULT);
  const [refreshing, setRefreshing] = useState(false);
  const today = useToday();

  const sections = useMemo(() => sectionsForView(tasks.data ?? [], view, today), [tasks.data, view, today]);
  // Smart views are a single list with no header to expand; only date-sectioned views collapse.
  const collapsible = view.kind === 'all' || view.kind === 'category' || view.kind === 'list';
  const visibleSections = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        count: section.data.length,
        data: collapsible && collapsed.has(section.id) ? [] : section.data,
      })),
    [sections, collapsed, collapsible],
  );

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
          <Text variant="heading-lg">{t('screen.title')}</Text>
          <Text variant="body-sm" color="contentSecondary">
            {formatDate(today, 'weekdayDayMonthLong', { now: today })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('screen.newTask')}
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
        renderSectionHeader={({ section }) => {
          if (!collapsible) return null;
          const title = t(`sections.${section.titleKey}`);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: !collapsed.has(section.id) }}
              accessibilityLabel={t('screen.sectionA11y', { title, count: section.count })}
              onPress={() => toggleSection(section.id)}
              style={[styles.sectionHeader, { backgroundColor: colors.surfacePrimary }]}
            >
              {collapsed.has(section.id) ? (
                <CaretRightIcon size={14} color={colors.contentSecondary} weight="bold" />
              ) : (
                <CaretDownIcon size={14} color={colors.contentSecondary} weight="bold" />
              )}
              <Text variant="label-md" color={section.id === 'overdue' ? 'contentNegative' : 'contentPrimary'}>
                {title}
              </Text>
              <Text variant="label-sm" color="contentTertiary">
                {section.count}
              </Text>
            </Pressable>
          );
        }}
        stickySectionHeadersEnabled={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={visibleSections.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon={<SparkleIcon size={32} color={colors.contentInfo} />}
            title={t(`empty.${view.kind}.title`)}
            description={t(`empty.${view.kind}.description`)}
            actionLabel={view.kind === 'all' ? t('screen.talkToJarvi') : undefined}
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
