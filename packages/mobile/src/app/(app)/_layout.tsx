import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';

import { ChatProvider } from '@/features/chat/chat-provider';
import { takePendingChatSeed } from '@/features/chat/pending-seed';
import { TrialExpiredScreen } from '@/features/subscription/trial-expired-screen';
import { useSubscription } from '@/features/subscription/use-subscription';
import { useTaskRealtime } from '@/features/tasks/use-task-realtime';
import { useTheme } from '@/theme/theme-provider';

export default function SignedInLayout() {
  const { colors } = useTheme();
  const { trialExpired } = useSubscription();
  // Read once: the onboarding follow-up opens the chat on the first launch.
  const [initialChat] = useState(takePendingChatSeed);
  useTaskRealtime();

  useEffect(() => {
    if (initialChat) router.navigate('/jarvi');
  }, [initialChat]);

  if (trialExpired) return <TrialExpiredScreen />;

  return (
    <ChatProvider initialMessages={initialChat ?? undefined}>
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: colors.contentPrimary,
          headerStyle: { backgroundColor: colors.surfaceGrouped },
          contentStyle: { backgroundColor: colors.surfaceGrouped },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="tarefa/[id]" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="nova-tarefa" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="ajustes/perfil" options={{ title: 'Perfil' }} />
        <Stack.Screen name="ajustes/notificacoes" options={{ title: 'Notificações' }} />
        <Stack.Screen name="ajustes/memoria" options={{ title: 'Memória' }} />
        <Stack.Screen name="ajustes/categorias" options={{ title: 'Categorias' }} />
      </Stack>
    </ChatProvider>
  );
}
