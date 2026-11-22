import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';

interface ScreenProps {
  children: ReactNode;
  /** Wraps content in a ScrollView that dismisses the keyboard on drag. */
  scroll?: boolean;
  /** Grouped background for settings-style screens. */
  grouped?: boolean;
  edges?: Edge[];
  /** Pinned below the content (primary actions), kept above the keyboard. */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({ children, scroll = false, grouped = false, edges = ['top', 'bottom'], footer, contentStyle }: ScreenProps) {
  const { colors } = useTheme();
  const background = grouped ? colors.surfaceGrouped : colors.surfacePrimary;

  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: background }]}>
      {/* Keeps the pinned footer above the keyboard; the scroll view keeps the focused field visible. */}
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        {scroll ? (
          <KeyboardAwareScrollView
            contentContainerStyle={[styles.content, contentStyle]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            bottomOffset={spacing.xl}
          >
            {children}
          </KeyboardAwareScrollView>
        ) : (
          <View style={[styles.root, contentStyle]}>{children}</View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
});
