import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { displayTitle } from '@/features/tasks/task-row';
import { formatDueLabel } from '@/lib/dates';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { Chip } from '@/ui/chip';
import { CheckIcon, TrashIcon } from '@/ui/icons';
import { Text } from '@/ui/text';
import { resolveChoiceArtifact } from './choices';
import { RichText } from './rich-text';
import { splitTaskRefs } from './task-refs';
import type { ChatMessageData, ToolCallData } from './types';

const TASK_TOOL_LABELS: Record<string, string> = {
  create_task: 'Tarefa criada',
  update_task: 'Tarefa atualizada',
  complete_task: 'Tarefa concluída',
  delete_task: 'Tarefa excluída',
};

interface ChatMessageProps {
  message: ChatMessageData;
  /** Only the latest assistant message offers quick replies. */
  isLatest: boolean;
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
    if (!call.result?.success || !(call.toolName in TASK_TOOL_LABELS)) continue;
    const id = String(call.result.data?.id ?? '');
    if (!id || mentioned.has(id)) continue;
    byTask.set(id, call);
  }
  return [...byTask.values()];
}

function ChatMessageComponent({ message, isLatest, isStreaming, status, isWaiting, onReply, onOpenTask }: ChatMessageProps) {
  const { colors } = useTheme();

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
        const when = formatDueLabel(data.due_date as string | null, data.time as string | null);
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
                {TASK_TOOL_LABELS[call.toolName]}
              </Text>
              <Text variant="body-md" numberOfLines={2} style={deleted && styles.struck}>
                {displayTitle(String(data.title ?? call.toolArgs.title ?? 'Tarefa'))}
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
            {status ?? 'Pensando…'}
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
