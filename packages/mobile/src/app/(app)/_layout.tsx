import { useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChatProvider } from '@/features/chat/chat-provider';
import { takePendingChatSeed } from '@/features/chat/pending-seed';
import { transcriptionQueue } from '@/features/notes/transcription-queue';
import { TrialExpiredScreen } from '@/features/subscription/trial-expired-screen';
import { useSubscription } from '@/features/subscription/use-subscription';
import { useTaskRealtime } from '@/features/tasks/use-task-realtime';
import { useTheme } from '@/theme/theme-provider';

export default function SignedInLayout() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const { trialExpired } = useSubscription();
  // Read once: the onboarding follow-up opens the chat on the first launch.
  const [initialChat] = useState(takePendingChatSeed);
  useTaskRealtime();
  // Transcribed segments land in the note caches even after the note screen closed.
  const queryClient = useQueryClient();
  useEffect(() => transcriptionQueue.setQueryClient(queryClient), [queryClient]);

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
        <Stack.Screen name="nota/[id]/index" options={{ headerShown: false }} />
        <Stack.Screen name="nota/[id]/chat" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="nota/[id]/sincronizar" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="ajustes/perfil" options={{ title: t('screens.profile') }} />
        <Stack.Screen name="ajustes/notificacoes" options={{ title: t('screens.notifications') }} />
        <Stack.Screen name="ajustes/memoria" options={{ title: t('screens.memory') }} />
        <Stack.Screen name="ajustes/categorias" options={{ title: t('screens.categories') }} />
      </Stack>
    </ChatProvider>
  );
}
