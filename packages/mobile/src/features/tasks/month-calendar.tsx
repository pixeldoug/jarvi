import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useFormat } from '@/i18n';
import { monthGrid, toDateKey } from '@/lib/dates';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { CaretLeftIcon, CaretRightIcon } from '@/ui/icons';
import { Text } from '@/ui/text';

/** Weekday ids by `Date#getDay()`; the header letters are read at render time. */
const WEEKDAY_IDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

interface MonthCalendarProps {
  month: Date;
  todayKey: string;
  selectedKey: string;
  /** Days with open tasks get a dot. */
  busyKeys: ReadonlySet<string>;
  onSelect: (key: string) => void;
  onMonthChange: (month: Date) => void;
}

function MonthCalendarComponent({ month, todayKey, selectedKey, busyKeys, onSelect, onMonthChange }: MonthCalendarProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('dates');
  const { formatDate, weekStartsOn } = useFormat();
  const days = monthGrid(month, weekStartsOn);
  const weekHeader = Array.from({ length: 7 }, (_, i) => WEEKDAY_IDS[(weekStartsOn + i) % 7]!);
  const shift = (delta: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text variant="heading-sm" accessibilityRole="header">
          {formatDate(month, 'monthYear')}
        </Text>
        <View style={styles.arrows}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.previousMonth')} hitSlop={8} onPress={() => shift(-1)} style={styles.arrow}>
            <CaretLeftIcon size={18} color={colors.contentPrimary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.nextMonth')} hitSlop={8} onPress={() => shift(1)} style={styles.arrow}>
            <CaretRightIcon size={18} color={colors.contentPrimary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.week}>
        {weekHeader.map((id) => (
          <Text key={id} variant="label-sm" color="contentTertiary" style={styles.cell} align="center">
            {t(`calendar.weekdaysNarrow.${id}`)}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day) => {
          const key = toDateKey(day);
          const inMonth = day.getMonth() === month.getMonth();
          const selected = key === selectedKey;
          const isToday = key === todayKey;
          const dayLabel = formatDate(day, 'dayMonthLong');
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={busyKeys.has(key) ? t('calendar.dayWithTasks', { date: dayLabel }) : dayLabel}
              onPress={() => onSelect(key)}
              style={styles.cell}
            >
              <View
                style={[
                  styles.day,
                  selected && { backgroundColor: colors.contentInfo },
                  !selected && isToday && { backgroundColor: colors.surfaceSecondary },
                ]}
              >
                <Text
                  variant="label-md"
                  style={{
                    color: selected ? colors.contentOnAccent : inMonth ? colors.contentPrimary : colors.contentTertiary,
                  }}
                >
                  {day.getDate()}
                </Text>
              </View>
              <View style={[styles.dot, { backgroundColor: busyKeys.has(key) ? colors.contentInfo : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const MonthCalendar = memo(MonthCalendarComponent);

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  arrows: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  arrow: {
    padding: spacing.sm,
  },
  week: {
    flexDirection: 'row',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 2,
  },
  day: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
});
