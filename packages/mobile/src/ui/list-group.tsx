import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { CaretRightIcon } from './icons';
import { Text } from './text';

/** Grouped rows, the settings-style list used across Ajustes and the task editor. */
export function ListGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      {title ? (
        <Text variant="label-sm" color="contentSecondary" style={styles.groupTitle}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.surfaceCard, borderColor: colors.borderPrimary }]}>
        {children}
      </View>
      {footer ? (
        <Text variant="body-sm" color="contentTertiary" style={styles.groupTitle}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export interface ListRowProps {
  label: string;
  value?: string | null;
  icon?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  /** Renders a switch instead of a chevron. */
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  disabled?: boolean;
  accessory?: ReactNode;
  last?: boolean;
}

export function ListRow({
  label,
  value,
  icon,
  onPress,
  destructive = false,
  switchValue,
  onSwitchChange,
  disabled = false,
  accessory,
  last = false,
}: ListRowProps) {
  const { colors } = useTheme();
  const hasSwitch = switchValue !== undefined;

  const content = (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text
        variant="body-md"
        color={destructive ? 'contentNegative' : 'contentPrimary'}
        style={value ? styles.labelWithValue : styles.label}
      >
        {label}
      </Text>
      {value ? (
        <Text variant="body-md" color="contentSecondary" numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {accessory}
      {hasSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          disabled={disabled}
          trackColor={{ true: colors.contentInfo }}
          accessibilityLabel={label}
        />
      ) : onPress ? (
        <CaretRightIcon size={16} color={colors.contentTertiary} />
      ) : null}
    </View>
  );

  if (!onPress || hasSwitch) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [{ opacity: disabled ? 0.5 : 1 }, pressed && { backgroundColor: colors.surfaceSecondary }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  groupTitle: {
    paddingHorizontal: spacing.lg,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  icon: {
    width: 22,
    alignItems: 'center',
  },
  label: {
    flex: 1,
  },
  labelWithValue: {
    flexShrink: 0,
    maxWidth: '55%',
  },
  value: {
    flex: 1,
    textAlign: 'right',
  },
});
