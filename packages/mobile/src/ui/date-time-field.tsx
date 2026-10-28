import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { formatShortDate, toTimeString } from '@/lib/dates';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { Text } from './text';

interface DateTimeFieldProps {
  mode: 'date' | 'time' | 'datetime';
  value: Date;
  onChange: (value: Date) => void;
  accessibilityLabel: string;
  minimumDate?: Date;
}

function formatValue(mode: DateTimeFieldProps['mode'], value: Date): string {
  if (mode === 'time') return toTimeString(value);
  if (mode === 'date') return formatShortDate(value);
  return `${formatShortDate(value)}, ${toTimeString(value)}`;
}

/**
 * Native date/time control: the compact iOS picker (opens the system popover)
 * or a button that opens the Android dialogs (date, then time).
 */
export function DateTimeField({ mode, value, onChange, accessibilityLabel, minimumDate }: DateTimeFieldProps) {
  const { colors } = useTheme();

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display="compact"
        locale="pt-BR"
        accentColor={colors.contentInfo}
        minimumDate={minimumDate}
        onValueChange={(_event, date) => onChange(date)}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  const openTime = (base: Date) =>
    DateTimePickerAndroid.open({
      value: base,
      mode: 'time',
      is24Hour: true,
      onValueChange: (_event, date) => onChange(date),
    });

  const open = () => {
    if (mode === 'time') {
      openTime(value);
      return;
    }
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      onValueChange: (_event, date) => {
        const merged = new Date(date.getFullYear(), date.getMonth(), date.getDate(), value.getHours(), value.getMinutes());
        if (mode === 'datetime') openTime(merged);
        else onChange(merged);
      },
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}: ${formatValue(mode, value)}`}
      onPress={open}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text variant="label-md">{formatValue(mode, value)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
});
