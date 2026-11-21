import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatView } from '@/features/chat/chat-view';
import { useChatSession } from '@/features/chat/use-chat-session';
import { useNote } from '@/features/notes/use-notes';
import { useTheme } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { Text } from '@/ui/text';

/**
 * Same suggestions as the web note chat (AIChatPanel/SkillChips, note mode).
 * Ids only; the text is `notes:chat.suggestions.<id>` (sent to the agent as
 * typed, in the UI language).
 */
const SUGGESTIONS = ['nextStepTasks', 'decisions', 'summarize', 'openItems'] as const;

/** The agent with this note as extra context (POST /api/ai/chat, mode "note"). */
export default function NoteChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation(['notes', 'common']);
  const note = useNote(id);
  const session = useChatSession({ mode: 'note', noteId: id });

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.surfacePrimary }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderPrimary }]}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.side}>
          <Text variant="body-md" color="contentSecondary">
            {t('common:actions.close')}
          </Text>
        </Pressable>
        <Text variant="label-md" numberOfLines={1} accessibilityRole="header" style={styles.title}>
          {note.data?.title.trim() || t('untitled')}
        </Text>
        <View style={[styles.side, styles.right]}>
          {session.messages.length > 0 ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={session.reset} disabled={session.isStreaming}>
              <Text variant="label-md" color={session.isStreaming ? 'contentTertiary' : 'contentInfo'}>
                {t('chat.newConversation')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <ChatView
        session={session}
        emptyTitle={t('chat.emptyTitle')}
        emptyDescription={t('chat.emptyDescription')}
        suggestions={SUGGESTIONS.map((suggestion) => t(`chat.suggestions.${suggestion}`))}
        placeholder={t('chat.placeholder')}
      />
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
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: {
    minWidth: 96,
  },
  right: {
    alignItems: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
});
