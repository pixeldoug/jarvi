import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatView } from '@/features/chat/chat-view';
import { useChatSession } from '@/features/chat/use-chat-session';
import { useNote } from '@/features/notes/use-notes';
import { useTheme } from '@/theme/theme-provider';
import { ModalHeader } from '@/ui/modal-header';

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
      <ModalHeader
        title={note.data?.title.trim() || t('untitled')}
        onCancel={() => router.back()}
        cancelLabel={t('common:actions.close')}
        onConfirm={session.messages.length > 0 ? session.reset : undefined}
        confirmLabel={t('chat.newConversation')}
        confirmDisabled={session.isStreaming}
      />
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
});
