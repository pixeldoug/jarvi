import { Stack } from 'expo-router';

import { useTheme } from '@/theme/theme-provider';

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTitle: '',
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: colors.contentPrimary,
        headerStyle: { backgroundColor: colors.surfacePrimary },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
