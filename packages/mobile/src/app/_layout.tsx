// First import: initialises i18n synchronously before any screen module runs.
import '@/i18n';

import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { AuthProvider, useAuth } from '@/auth/auth-provider';
import { ThemeProvider, useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme/tokens';
import { Screen } from '@/ui/screen';
import { ErrorState } from '@/ui/states';
import { ToastProvider } from '@/ui/toast';

void SplashScreen.preventAutoHideAsync();

// React Query refetches stale data when the app returns to the foreground.
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
  return () => subscription.remove();
});

function RootNavigator() {
  const { status, user, retry } = useAuth();
  const { scheme, colors } = useTheme();
  const { t } = useTranslation();

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;
  if (status === 'offline') {
    return (
      <Screen contentStyle={styles.centered}>
        <ErrorState message={t('errors.offline')} onRetry={retry} />
      </Screen>
    );
  }

  const signedIn = status === 'signedIn';
  const onboarded = !!user?.onboardingCompletedAt;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <NavigationThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.contentInfo,
          background: colors.surfacePrimary,
          card: colors.surfacePrimary,
          text: colors.contentPrimary,
          border: colors.borderPrimary,
        },
        fonts: {
          regular: { fontFamily: fontFamily.regular, fontWeight: '400' },
          medium: { fontFamily: fontFamily.medium, fontWeight: '500' },
          bold: { fontFamily: fontFamily.semibold, fontWeight: '600' },
          heavy: { fontFamily: fontFamily.bold, fontWeight: '700' },
        },
      }}
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  // Fall back to the system font rather than hang on the splash screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <KeyboardProvider>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: 'center',
  },
});
