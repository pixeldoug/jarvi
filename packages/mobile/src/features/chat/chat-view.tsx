import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { Chip } from '@/ui/chip';
import { ArrowUpIcon, StopIcon } from '@/ui/icons';
import { Logo } from '@/ui/logo';
import { Text } from '@/ui/text';
import { ChatMessage } from './chat-message';
import type { ChatSession } from './use-chat-session';

interface ChatViewProps {
  session: ChatSession;
  emptyTitle: string;
  emptyDescription: string;
  suggestions: string[];
  /** Defaults to `chat:composer.placeholder` ("Fale com a Jarvi"). */
  placeholder?: string;
}

/** Message list + composer for one chat session (the Jarvi tab and a note's chat). */
export function ChatView({ session, emptyTitle, emptyDescription, suggestions, placeholder }: ChatViewProps) {
  const { t } = useTranslation(['chat', 'common']);
  const { colors } = useTheme();
  const today = useToday();
  const { messages, isStreaming, isWaiting, status, send, stop } = session;
  const [input, setInput] = useState('');
  // Inverted list: newest message at the bottom, next to the composer.
  const reversed = useMemo(() => [...messages].reverse(), [messages]);
  const latestAssistantId = messages.findLast((m) => m.role === 'assistant')?.id;

  const openTask = useCallback((taskId: string) => router.push({ pathname: '/tarefa/[id]', params: { id: taskId } }), []);
  const reply = useCallback((text: string) => void send(text), [send]);

  const submit = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    void send(text);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      {messages.length === 0 ? (
        <View style={styles.empty}>
          <Logo size={40} />
          <Text variant="heading-md" align="center">
            {emptyTitle}
          </Text>
          <Text variant="body-md" color="contentSecondary" align="center">
            {emptyDescription}
          </Text>
          <View style={styles.suggestions}>
            {suggestions.map((suggestion) => (
              <Chip key={suggestion} label={suggestion} onPress={() => reply(suggestion)} />
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          inverted
          data={reversed}
          keyExtractor={(message) => message.id}
          renderItem={({ item }) => {
            // Streaming state only reaches the newest message, so older ones stay memoized.
            const isLatest = item.id === latestAssistantId && item.id === messages[messages.length - 1]?.id;
            return (
              <ChatMessage
                message={item}
                isLatest={isLatest}
                today={today}
                isStreaming={isLatest && isStreaming}
                status={isLatest ? status : null}
                isWaiting={isLatest && isWaiting}
                onReply={reply}
                onOpenTask={openTask}
              />
            );
          }}
          contentContainerStyle={styles.messages}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />
      )}

      <SafeAreaView edges={['bottom']} style={[styles.composer, { borderTopColor: colors.borderPrimary }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={placeholder ?? t('composer.placeholder')}
          placeholderTextColor={colors.contentTertiary}
          multiline
          accessibilityLabel={t('composer.inputLabel')}
          style={[
            typography['body-md'],
            styles.input,
            { color: colors.contentPrimary, backgroundColor: colors.surfaceSecondary },
          ]}
        />
        {isStreaming ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('composer.stop')}
            onPress={stop}
            style={[styles.send, { backgroundColor: colors.contentPrimary }]}
          >
            <StopIcon size={16} color={colors.surfacePrimary} weight="fill" />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.send')}
            accessibilityState={{ disabled: !input.trim() }}
            disabled={!input.trim()}
            onPress={submit}
            style={[styles.send, { backgroundColor: input.trim() ? colors.surfaceAccent : colors.surfaceSecondary }]}
          >
            <ArrowUpIcon size={18} color={input.trim() ? colors.contentOnAccent : colors.contentTertiary} weight="bold" />
          </Pressable>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  messages: {
    padding: spacing.xl,
    gap: spacing.xl,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
