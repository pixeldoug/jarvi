import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { Text } from './text';

interface ModalHeaderProps {
  title: string;
  onCancel: () => void;
  onConfirm?: () => void;
  /** Defaults to "Salvar" / "Save". */
  confirmLabel?: string;
  confirmDisabled?: boolean;
  busy?: boolean;
}

/** Cancel / title / confirm bar for modal screens (native headers are off there). */
export function ModalHeader({ title, onCancel, onConfirm, confirmLabel, confirmDisabled = false, busy = false }: ModalHeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.bar, { borderBottomColor: colors.borderPrimary }]}>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onCancel} style={styles.side}>
        <Text variant="body-md" color="contentSecondary">
          {t('actions.cancel')}
        </Text>
      </Pressable>
      <Text variant="label-md" style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>
        {onConfirm ? (
          busy ? (
            <ActivityIndicator color={colors.contentInfo} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: confirmDisabled }}
              hitSlop={8}
              disabled={confirmDisabled}
              onPress={onConfirm}
            >
              <Text variant="label-md" color={confirmDisabled ? 'contentTertiary' : 'contentInfo'}>
                {confirmLabel ?? t('actions.save')}
              </Text>
            </Pressable>
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: {
    minWidth: 72,
  },
  right: {
    alignItems: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
});
