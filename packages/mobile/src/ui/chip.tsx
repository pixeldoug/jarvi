import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { XIcon } from './icons';
import { Text } from './text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  icon?: ReactNode;
  onPress?: () => void;
  /** Shows a clear (×) affordance; tapping the chip still calls onPress. */
  onClear?: () => void;
  accessibilityLabel?: string;
}

export function Chip({ label, selected = false, icon, onPress, onClear, accessibilityLabel }: ChipProps) {
  const { t } = useTranslation('ui');
  const { colors } = useTheme();
  const tint = selected ? colors.contentInfo : colors.contentPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      // 32pt chip + 6pt on each side: the 44pt minimum touch target.
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.surfaceAccentSubtle : colors.surfaceSecondary,
          borderColor: selected ? colors.controlBorderActive : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text variant="label-sm" style={{ color: tint }} numberOfLines={1}>
        {label}
      </Text>
      {onClear ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chip.remove', { label })}
          onPress={onClear}
          // 12pt icon + 16pt on each side: 44pt.
          hitSlop={16}
        >
          <XIcon size={12} color={tint} weight="bold" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  icon: {
    marginLeft: -2,
  },
});
