import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { useFormat } from '@/i18n';
import { useToday } from '@/lib/use-today';
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

/**
 * Native date/time control: the compact iOS picker (opens the system popover)
 * or a button that opens the Android dialogs (date, then time).
 */
export function DateTimeField({ mode, value, onChange, accessibilityLabel, minimumDate }: DateTimeFieldProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('dates');
  const { locale, formatDate, formatTime, formatDateTime } = useFormat();
  const today = useToday();
  /** pt-BR uses a 24h clock, en-US 12h (matches `formatTime`). */
  const is24Hour = locale !== 'en-US';

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display="compact"
        locale={locale}
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
      is24Hour,
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

  const label =
    mode === 'time'
      ? formatTime(value)
      : mode === 'date'
        ? formatDate(value, 'dayMonthAuto', { now: today })
        : formatDateTime(value, 'dayMonthAuto', { now: today });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('field.valueA11y', { label: accessibilityLabel, value: label })}
      onPress={open}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text variant="label-md">{label}</Text>
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
