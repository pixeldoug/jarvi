import { Stack, ThemeProvider, useTheme as useNavigationTheme } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AuthScenery } from '@/features/auth/auth-backdrop';
import { useTheme } from '@/theme/theme-provider';

/**
 * The sky and the sheet stay put while the sign-in screens fade over them, so
 * going from the number to the code only swaps what is on the sheet. Each screen
 * draws its own back button (see AuthBackdrop).
 */
export default function AuthLayout() {
  const { colors } = useTheme();
  const navigationTheme = useNavigationTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.surfacePrimary }]}>
      <AuthScenery />
      {/* The native stack paints `colors.background` behind its screens; clear it so the scenery shows. */}
      <ThemeProvider value={{ ...navigationTheme, colors: { ...navigationTheme.colors, background: 'transparent' } }}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            animationDuration: 220,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </ThemeProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
