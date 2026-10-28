import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MONTHS_LONG_PT, monthGrid, toDateKey } from '@/lib/dates';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { CaretLeftIcon, CaretRightIcon } from '@/ui/icons';
import { Text } from '@/ui/text';

const WEEK_HEADER = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

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
  const days = monthGrid(month);
  const shift = (delta: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text variant="heading-sm" accessibilityRole="header">
          {`${MONTHS_LONG_PT[month.getMonth()]} ${month.getFullYear()}`}
        </Text>
        <View style={styles.arrows}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" hitSlop={8} onPress={() => shift(-1)} style={styles.arrow}>
            <CaretLeftIcon size={18} color={colors.contentPrimary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" hitSlop={8} onPress={() => shift(1)} style={styles.arrow}>
            <CaretRightIcon size={18} color={colors.contentPrimary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.week}>
        {WEEK_HEADER.map((label, index) => (
          <Text key={index} variant="label-sm" color="contentTertiary" style={styles.cell} align="center">
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day) => {
          const key = toDateKey(day);
          const inMonth = day.getMonth() === month.getMonth();
          const selected = key === selectedKey;
          const isToday = key === todayKey;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${day.getDate()} de ${MONTHS_LONG_PT[day.getMonth()]}${busyKeys.has(key) ? ', com tarefas' : ''}`}
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
