import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useFormat } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { MicrophoneIcon, WarningIcon } from '@/ui/icons';
import { EmptyState } from '@/ui/states';
import { Text } from '@/ui/text';
import type { NoteTranscriptSegment } from '@/types/notes';
import { transcriptionQueue } from './transcription-queue';

export function useTranscriptionQueue(noteId: string) {
  return useSyncExternalStore(transcriptionQueue.subscribe, () => transcriptionQueue.snapshot(noteId));
}

/** The note's transcript, segment by segment, with the upload state. */
export function NoteTranscript({
  noteId,
  segments,
  isRecording,
}: {
  noteId: string;
  segments: NoteTranscriptSegment[];
  isRecording: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation(['notes', 'common']);
  const { formatTime } = useFormat();
  const queue = useTranscriptionQueue(noteId);
  const visible = segments.filter((segment) => segment.text.trim() !== '');

  return (
    <View style={styles.root}>
      {queue.pending > 0 ? (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.contentInfo} />
          <Text variant="body-sm" color="contentSecondary">
            {t('transcript.transcribing')}
          </Text>
        </View>
      ) : null}
      {queue.failed > 0 ? (
        <View style={styles.status}>
          <WarningIcon size={16} color={colors.contentWarning} />
          <Text variant="body-sm" color="contentSecondary" style={styles.statusText}>
            {t('transcript.failed', { count: queue.failed })}
          </Text>
          <Button label={t('common:actions.tryAgain')} size="sm" variant="secondary" onPress={() => transcriptionQueue.retryFailed(noteId)} />
        </View>
      ) : null}

      {visible.length === 0 && queue.pending === 0 ? (
        <EmptyState
          icon={<MicrophoneIcon size={32} color={colors.contentInfo} />}
          title={isRecording ? t('transcript.recording') : t('transcript.empty.title')}
          description={isRecording ? t('transcript.empty.recording') : t('transcript.empty.idle')}
        />
      ) : (
        visible.map((segment) => (
          <View key={segment.id} style={styles.segment}>
            <Text variant="label-sm" color="contentTertiary">
              {formatTime(segment.recorded_at)}
            </Text>
            <Text variant="body-md" selectable>
              {segment.text.trim()}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: {
    flex: 1,
  },
  segment: {
    gap: spacing.xxs,
  },
});
