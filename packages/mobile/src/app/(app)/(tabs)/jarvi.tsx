import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useChat } from '@/features/chat/chat-provider';
import { ChatView } from '@/features/chat/chat-view';
import { useTheme } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { Text } from '@/ui/text';

/** Same suggestions as the web chat (AIChatPanel/SkillChips, general mode): `chat:skills.general.*`. */
const SUGGESTION_KEYS = ['planDay', 'whatNow', 'captureIdea', 'amILate', 'summarizeWeek'] as const;

export default function ChatScreen() {
  const { t } = useTranslation(['chat', 'common']);
  const { colors } = useTheme();
  const session = useChat();
  const { messages, isStreaming, reset } = session;

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.surfacePrimary }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderPrimary }]}>
        <Text variant="heading-sm">{t('common:app.name')}</Text>
        {messages.length > 0 ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={reset} disabled={isStreaming}>
            <Text variant="label-md" color={isStreaming ? 'contentTertiary' : 'contentInfo'}>
              {t('screen.newConversation')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <ChatView
        session={session}
        emptyTitle={t('screen.emptyTitle')}
        emptyDescription={t('screen.emptyDescription')}
        suggestions={SUGGESTION_KEYS.map((key) => t(`skills.general.${key}`))}
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
