import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { CheckIcon } from '@/ui/icons';
import { Text } from '@/ui/text';
import type { OnboardingOption } from './onboarding';

interface OptionListProps {
  options: OnboardingOption[];
  selected: string[];
  onToggle: (value: string) => void;
}

/** Multi-select answers for the interview steps. */
export function OptionList({ options, selected, onToggle }: OptionListProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.list}>
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={option.label}
            onPress={() => onToggle(option.value)}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: checked ? colors.controlBorderActive : colors.borderPrimary,
                backgroundColor: checked ? colors.surfaceAccentSubtle : colors.surfacePrimary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text variant="body-md" style={styles.label}>
              {option.label}
            </Text>
            <View
              style={[
                styles.check,
                checked
                  ? { backgroundColor: colors.contentInfo, borderColor: colors.contentInfo }
                  : { borderColor: colors.contentTertiary },
              ]}
            >
              {checked ? <CheckIcon size={12} color={colors.contentOnAccent} weight="bold" /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  label: {
    flex: 1,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
