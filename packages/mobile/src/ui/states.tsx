import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { Button } from './button';
import { Text } from './text';

export function LoadingState() {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.surfacePrimary }]}>
      <ActivityIndicator color={colors.contentInfo} />
    </View>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      {icon}
      <Text variant="heading-sm" align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="body-md" color="contentSecondary" align="center">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" size="sm" style={styles.action} />
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <EmptyState title="Não deu para carregar" description={message} actionLabel="Tentar de novo" onAction={onRetry} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxl * 2,
  },
  action: {
    marginTop: spacing.sm,
  },
});
