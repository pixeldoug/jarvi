import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MonthCalendar } from '@/features/tasks/month-calendar';
import { sortTasks } from '@/features/tasks/sections';
import { TaskRow } from '@/features/tasks/task-row';
import { useTasks } from '@/features/tasks/use-tasks';
import { useToggleWithFeedback } from '@/features/tasks/use-toggle-with-feedback';
import { dateKeyOf, formatLongDate, parseDateKey, toDateKey } from '@/lib/dates';
import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { PlusIcon } from '@/ui/icons';
import { EmptyState } from '@/ui/states';
import { Text } from '@/ui/text';
import type { Task } from '@/types/models';

export default function CalendarScreen() {
  const { colors } = useTheme();
  const { data: tasks = [] } = useTasks();
  const toggle = useToggleWithFeedback();
  const today = useToday();
  const [selectedKey, setSelectedKey] = useState(() => toDateKey(today));
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const busyKeys = useMemo(
    () =>
      new Set(
        tasks
          .filter((task) => !task.completed)
          .map((task) => dateKeyOf(task.due_date))
          .filter((key): key is string => !!key),
      ),
    [tasks],
  );
  const dayTasks = useMemo(() => {
    const onDay = tasks.filter((task) => dateKeyOf(task.due_date) === selectedKey);
    const sorted = sortTasks(onDay);
    return [...sorted.filter((t) => !t.completed), ...sorted.filter((t) => t.completed)];
  }, [tasks, selectedKey]);

  const openTask = useCallback((task: Task) => router.push({ pathname: '/tarefa/[id]', params: { id: task.id } }), []);
  const selectedDate = parseDateKey(selectedKey) ?? today;

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.surfacePrimary }]}>
      <FlatList
        data={dayTasks}
        keyExtractor={(task) => task.id}
        renderItem={({ item }) => <TaskRow task={item} today={today} onToggle={toggle} onOpen={openTask} />}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <MonthCalendar
              month={month}
              todayKey={toDateKey(today)}
              selectedKey={selectedKey}
              busyKeys={busyKeys}
              onSelect={(key) => {
                setSelectedKey(key);
                const date = parseDateKey(key);
                if (date && date.getMonth() !== month.getMonth()) setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
              }}
              onMonthChange={setMonth}
            />
            <View style={[styles.dayHeader, { borderTopColor: colors.borderPrimary }]}>
              <Text variant="label-md">{formatLongDate(selectedDate)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Nova tarefa em ${formatLongDate(selectedDate)}`}
                hitSlop={8}
                onPress={() => router.push({ pathname: '/nova-tarefa', params: { dueDate: selectedKey } })}
              >
                <PlusIcon size={20} color={colors.contentInfo} weight="bold" />
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState title="Dia livre" description="Nenhuma tarefa para este dia." />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl * 2,
  },
  header: {
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
