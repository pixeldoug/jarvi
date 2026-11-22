import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { CaretLeftIcon } from '@/ui/icons';
import { Text } from '@/ui/text';

// Same painting as the web login (packages/web/src/assets/login-background.png).
// `require` keeps typecheck working where Expo's generated asset types are absent (CI).
const loginBackground: ImageSourcePropType = require('../../../assets/images/login-background.png');

/** Where the sheet starts on a 874pt-tall phone; smaller phones get less sky. */
const SHEET_TOP = 268;
/** Room for the submit button under a field. */
const KEYBOARD_OFFSET = 96;
/** Room for everything under the code boxes (message, "Abrir o WhatsApp", links). */
export const CODE_KEYBOARD_OFFSET = 230;

interface AuthBackdropProps {
  children: ReactNode;
  /** Shows a back button at the top of the sheet. */
  onBack?: () => void;
  /**
   * Space kept between the focused field and the keyboard, so what follows it
   * (the submit button, the code screen's links) stays in view while typing.
   */
  keyboardOffset?: number;
}

function useSheetTop() {
  const { height } = useWindowDimensions();
  return Math.round(Math.min(SHEET_TOP, height * 0.3));
}

/**
 * The painting and an empty sheet, drawn once by the (auth) layout behind every
 * sign-in screen. Screens cross-fade on top of it, so moving between them only
 * changes what is on the sheet; the sky and the sheet itself never move.
 */
export function AuthScenery() {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const sheetTop = useSheetTop();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <StatusBar style="light" />
      <Image
        source={loginBackground}
        resizeMode="cover"
        style={[styles.sky, { width, height: sheetTop + radius.sheet * 4 }]}
        accessibilityIgnoresInvertColors
      />
      <View style={[styles.sheet, styles.restingSheet, { top: sheetTop, minHeight: height - sheetTop, backgroundColor: colors.surfacePrimary }]} />
    </View>
  );
}

/**
 * One sign-in screen: its content on a sheet that lines up with the resting
 * sheet of `AuthScenery`. The whole thing scrolls, so the keyboard slides the
 * sheet over the sky.
 */
export function AuthBackdrop({ children, onBack, keyboardOffset = KEYBOARD_OFFSET }: AuthBackdropProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetTop = useSheetTop();

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={keyboardOffset}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: sheetTop }} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfacePrimary,
              minHeight: height - sheetTop,
              paddingBottom: insets.bottom + spacing.xl,
            },
          ]}
        >
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('actions.back')}
              onPress={onBack}
              hitSlop={8}
              style={({ pressed }) => [
                styles.back,
                { borderColor: colors.borderPrimary, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <CaretLeftIcon size={20} color={colors.contentPrimary} weight="bold" />
            </Pressable>
          ) : null}
          {children}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

/** "ou" between the main action and the other ways in. */
export function OrDivider({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.divider}>
      <View style={[styles.line, { backgroundColor: colors.borderPrimary }]} />
      <Text variant="body-sm" color="contentTertiary">
        {label}
      </Text>
      <View style={[styles.line, { backgroundColor: colors.borderPrimary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  sky: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  scroll: {
    flexGrow: 1,
  },
  sheet: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingTop: spacing.xxl + spacing.xl,
    paddingHorizontal: spacing.xl,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderCurve: 'continuous',
  },
  restingSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -spacing.xs,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth * 2,
  },
});
