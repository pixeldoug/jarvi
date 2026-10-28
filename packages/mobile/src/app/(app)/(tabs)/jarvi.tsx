import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useChat } from '@/features/chat/chat-provider';
import { ChatMessage } from '@/features/chat/chat-message';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { Chip } from '@/ui/chip';
import { ArrowUpIcon, StopIcon } from '@/ui/icons';
import { Logo } from '@/ui/logo';
import { Text } from '@/ui/text';

/** Same suggestions as the web chat (AIChatPanel/SkillChips, general mode). */
const SUGGESTIONS = ['Planejar meu dia', 'O que fazer agora?', 'Capturar ideia', 'Estou atrasado?', 'Resumir minha semana'];

export default function ChatScreen() {
  const { colors } = useTheme();
  const { messages, isStreaming, isWaiting, status, send, stop, reset } = useChat();
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
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.surfacePrimary }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderPrimary }]}>
        <Text variant="heading-sm">Jarvi</Text>
        {messages.length > 0 ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={reset} disabled={isStreaming}>
            <Text variant="label-md" color={isStreaming ? 'contentTertiary' : 'contentInfo'}>
              Nova conversa
            </Text>
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView style={styles.root} behavior="padding">
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Logo size={40} />
            <Text variant="heading-md" align="center">
              Como posso ajudar?
            </Text>
            <Text variant="body-md" color="contentSecondary" align="center">
              Conte o que você precisa fazer. A Jarvi cria e organiza suas tarefas.
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
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
            placeholder="Fale com a Jarvi"
            placeholderTextColor={colors.contentTertiary}
            multiline
            accessibilityLabel="Mensagem para a Jarvi"
            style={[
              typography['body-md'],
              styles.input,
              { color: colors.contentPrimary, backgroundColor: colors.surfaceSecondary },
            ]}
          />
          {isStreaming ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Parar resposta"
              onPress={stop}
              style={[styles.send, { backgroundColor: colors.contentPrimary }]}
            >
              <StopIcon size={16} color={colors.surfacePrimary} weight="fill" />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enviar"
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
