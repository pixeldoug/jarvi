import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { displayTitle } from '@/features/tasks/task-row';
import { useFormat } from '@/i18n';
import { dateKeyOf } from '@/lib/dates';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { Chip } from '@/ui/chip';
import { CheckIcon, TrashIcon } from '@/ui/icons';
import { Text } from '@/ui/text';
import { resolveChoiceArtifact } from './choices';
import { RichText } from './rich-text';
import { splitTaskRefs } from './task-refs';
import type { ChatMessageData, ToolCallData } from './types';

/** Task tools that get a card, and the `chat:taskCard.*` label each one shows. */
const TASK_TOOL_LABEL_KEYS = {
  create_task: 'created',
  update_task: 'updated',
  complete_task: 'completed',
  delete_task: 'deleted',
} as const;

type TaskToolName = keyof typeof TASK_TOOL_LABEL_KEYS;

const isTaskTool = (name: string): name is TaskToolName => Object.prototype.hasOwnProperty.call(TASK_TOOL_LABEL_KEYS, name);

interface ChatMessageProps {
  message: ChatMessageData;
  /** Only the latest assistant message offers quick replies. */
  isLatest: boolean;
  /** From useToday(), so memoized messages relabel task dates when the day changes. */
  today: Date;
  isStreaming: boolean;
  status: string | null;
  isWaiting: boolean;
  onReply: (text: string) => void;
  onOpenTask: (taskId: string) => void;
}

/** One card per task the turn touched, unless the text already mentions it. */
function taskCards(message: ChatMessageData, text: string): ToolCallData[] {
  const mentioned = new Set(
    splitTaskRefs(text).flatMap((segment) => (segment.type === 'task' ? [segment.id] : [])),
  );
  const byTask = new Map<string, ToolCallData>();
  for (const call of message.toolCalls ?? []) {
    if (!call.result?.success || !isTaskTool(call.toolName)) continue;
    const id = String(call.result.data?.id ?? '');
    if (!id || mentioned.has(id)) continue;
    byTask.set(id, call);
  }
  return [...byTask.values()];
}

function ChatMessageComponent({ message, isLatest, today, isStreaming, status, isWaiting, onReply, onOpenTask }: ChatMessageProps) {
  const { t } = useTranslation(['chat', 'common']);
  const { colors } = useTheme();
  const { formatRelativeDay, formatTime } = useFormat();

  /** "Hoje", "Amanhã", "Quarta", "7 Jan", plus ", 09:00" when timed (pt) / "Today, 9:00 AM" (en). */
  const dueLabel = (dueDate: unknown, time: unknown): string | null => {
    // Day only: a stored "2026-10-28T00:00:00Z" is that calendar day, not UTC midnight.
    const key = typeof dueDate === 'string' ? dateKeyOf(dueDate) : null;
    const date = key ? formatRelativeDay(key, { now: today, weekdayThisWeek: true }) : '';
    if (!date) return null;
    const clock = typeof time === 'string' ? formatTime(time) : '';
    return clock ? t('common:time.dateWithTime', { date, time: clock }) : date;
  };

  if (message.role === 'user') {
    return (
      <View style={[styles.userBubble, { backgroundColor: colors.surfaceAccent }]}>
        <Text variant="body-md" style={{ color: colors.contentOnAccent }} selectable>
          {message.content}
        </Text>
      </View>
    );
  }

  const artifact = resolveChoiceArtifact(message);
  const text = [artifact.content, artifact.contentAfter].filter(Boolean).join('\n\n');
  const cards = taskCards(message, text);
  const live = isLatest && isStreaming;
  const showChoices = isLatest && !isStreaming && artifact.choices.length > 0;

  return (
    <View style={styles.assistant}>
      {text ? <RichText text={text} onOpenTask={onOpenTask} /> : null}

      {cards.map((call) => {
        const data = call.result?.data ?? {};
        const id = String(data.id);
        const deleted = call.toolName === 'delete_task';
        const when = dueLabel(data.due_date, data.time);
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            disabled={deleted}
            onPress={() => onOpenTask(id)}
            style={({ pressed }) => [
              styles.card,
              { borderColor: colors.borderPrimary, backgroundColor: colors.surfacePrimary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            {deleted ? (
              <TrashIcon size={16} color={colors.contentTertiary} />
            ) : (
              <CheckIcon size={16} color={colors.contentPositive} weight="bold" />
            )}
            <View style={styles.cardBody}>
              <Text variant="label-sm" color="contentSecondary">
                {isTaskTool(call.toolName) ? t(`taskCard.${TASK_TOOL_LABEL_KEYS[call.toolName]}`) : null}
              </Text>
              <Text variant="body-md" numberOfLines={2} style={deleted && styles.struck}>
                {displayTitle(String(data.title ?? call.toolArgs.title ?? t('taskCard.untitled')))}
              </Text>
              {when && !deleted ? (
                <Text variant="body-sm" color="contentSecondary">
                  {when}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}

      {live && isWaiting ? (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.contentInfo} />
          <Text variant="body-sm" color="contentSecondary">
            {status ?? t('thinking.live')}
          </Text>
        </View>
      ) : null}

      {showChoices ? (
        <View style={styles.choices}>
          {artifact.question ? <Text variant="label-md">{artifact.question}</Text> : null}
          <View style={styles.chips}>
            {artifact.choices.map((choice) => (
              <Chip key={choice} label={choice} onPress={() => onReply(choice)} />
            ))}
          </View>
        </View>
      ) : null}

      {message.journeyNudge ? (
        <View style={styles.choices}>
          <Text variant="body-sm" color="contentSecondary">
            {message.journeyNudge.text}
          </Text>
          {isLatest && !isStreaming ? (
            <View style={styles.chips}>
              <Chip label={message.journeyNudge.resumeLabel} selected onPress={() => onReply(message.journeyNudge!.resumeLabel)} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const ChatMessage = memo(ChatMessageComponent);

const styles = StyleSheet.create({
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm / 2,
  },
  assistant: {
    gap: spacing.md,
    paddingRight: spacing.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  cardBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  choices: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
