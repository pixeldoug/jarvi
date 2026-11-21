import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useLocale } from '@/i18n';
import { dateKeyOf, toDateKey } from '@/lib/dates';
import { formatRecurrence } from '@/lib/recurrence';
import { useTheme } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { FireSimpleIcon, HashIcon, RepeatIcon, WhatsappLogoIcon } from '@/ui/icons';
import { TaskCheckbox } from '@/ui/task-checkbox';
import { Text } from '@/ui/text';
import type { Task } from '@/types/models';
import { categoryLabel } from './category-label';
import { formatDueLabel } from './due-label';

/**
 * Web `capitalizeTaskTitle`: the AI and WhatsApp often send lowercase titles.
 * A fixed locale keeps casing stable (pt-BR and en-US case letters alike).
 */
export function displayTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.charAt(0).toLocaleUpperCase('pt-BR') + trimmed.slice(1);
}

interface TaskRowProps {
  task: Task;
  /** From useToday(), so memoized rows relabel when the day changes. */
  today: Date;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
}

function TaskRowComponent({ task, today, onToggle, onOpen }: TaskRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('tasks');
  const locale = useLocale();
  const dueLabel = formatDueLabel(task.due_date, task.time, { now: today, locale });
  const dueKey = dateKeyOf(task.due_date);
  const overdue = !task.completed && !!dueKey && dueKey < toDateKey(today);
  const recurrence = formatRecurrence(task.recurrence_type, task.recurrence_config, { locale });
  const fromWhatsApp = task.source === 'whatsapp' || !!task.original_whatsapp_content;
  const priorityColor =
    task.priority === 'high' || task.priority === 'urgent'
      ? colors.contentNegative
      : task.priority === 'medium'
        ? colors.contentWarning
        : colors.contentInfo;
  const title = displayTitle(task.title);
  const category = categoryLabel(task.category, { locale });
  const metaColor = task.completed ? colors.contentTertiary : colors.contentSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, dueLabel, recurrence, category, fromWhatsApp && t('row.viaWhatsApp')]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={t('row.openHint')}
      onPress={() => onOpen(task)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSecondary }]}
    >
      <View style={styles.checkbox}>
        <TaskCheckbox checked={task.completed} onToggle={() => onToggle(task)} label={title} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleLine}>
          {task.priority ? (
            <FireSimpleIcon size={14} weight="fill" color={task.completed ? colors.contentTertiary : priorityColor} />
          ) : null}
          <Text
            variant="body-md"
            color={task.completed ? 'contentTertiary' : 'contentPrimary'}
            style={[styles.title, task.completed && styles.completed]}
            numberOfLines={2}
          >
            {title}
          </Text>
        </View>
        {dueLabel || recurrence || category || fromWhatsApp ? (
          <View style={styles.meta}>
            {dueLabel ? (
              <Text variant="body-sm" style={{ color: overdue ? colors.contentNegative : metaColor }}>
                {dueLabel}
              </Text>
            ) : null}
            {recurrence ? (
              <View style={styles.metaItem}>
                <RepeatIcon size={12} color={metaColor} />
                <Text variant="body-sm" style={{ color: metaColor }} numberOfLines={1}>
                  {recurrence}
                </Text>
              </View>
            ) : null}
            {category ? (
              <View style={styles.metaItem}>
                <HashIcon size={12} color={metaColor} />
                <Text variant="body-sm" style={{ color: metaColor }} numberOfLines={1}>
                  {category}
                </Text>
              </View>
            ) : null}
            {fromWhatsApp ? <WhatsappLogoIcon size={13} color={metaColor} /> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export const TaskRow = memo(TaskRowComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  checkbox: {
    paddingTop: 1,
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    flexShrink: 1,
  },
  completed: {
    textDecorationLine: 'line-through',
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.md,
    rowGap: spacing.xxs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    maxWidth: 160,
  },
});
