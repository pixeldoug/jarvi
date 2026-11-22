import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { useFormat } from '@/i18n';
import { parseDescription } from '@/lib/description';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { ArrowClockwiseIcon, SparkleIcon } from '@/ui/icons';
import { EmptyState } from '@/ui/states';
import { TaskCheckbox } from '@/ui/task-checkbox';
import { Text } from '@/ui/text';
import { useToast } from '@/ui/toast';
import type { NoteDetail } from '@/types/notes';
import { DocView } from './doc-view';
import { isSummaryOutdated } from './note-text';
import { generateNoteSummary, useIsGeneratingSummary, type SummaryResult } from './summary-generation';
import type { SummaryStepReview } from './summary-steps';
import { useNextSteps, type NextStep } from './use-next-steps';

/** Label keys (`notes:` namespace) for a summary that did not come out. */
const SUMMARY_ERRORS = {
  empty: 'summary.needsSource',
  failed: 'summary.failed',
} as const satisfies Record<Exclude<SummaryResult, 'ok'>, string>;

export function NoteSummary({ note, canEdit }: { note: NoteDetail; canEdit: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation(['notes', 'common']);
  const { formatRelativeTime } = useFormat();
  const queryClient = useQueryClient();
  const toast = useToast();
  const isGenerating = useIsGeneratingSummary(note.id);
  const nextSteps = useNextSteps(note);

  const generate = async () => {
    const result = await generateNoteSummary(queryClient, note.id);
    if (result !== 'ok') toast({ message: t(SUMMARY_ERRORS[result]) });
  };

  const regenerate = () => {
    Alert.alert(t('summary.regenerateDialog.title'), t('summary.regenerateDialog.message'), [
      { text: t('common:actions.cancel'), style: 'cancel' },
      { text: t('summary.regenerate'), onPress: () => void generate() },
    ]);
  };

  const toggle = (step: NextStep) => {
    nextSteps.toggleStep(step).catch(() => toast({ message: t('nextSteps.saveFailed') }));
  };

  const review = (item: SummaryStepReview) => {
    const resolve = (decision: 'same' | 'distinct') =>
      nextSteps
        .resolveReview(item, decision)
        .then((status) => {
          if (status === 'not_under_review') toast({ message: t('stepReview.alreadyReviewed') });
        })
        .catch(() => toast({ message: t('stepReview.saveFailed') }));
    Alert.alert(
      t('stepReview.title'),
      t('stepReview.message', { text: item.text, existing: item.existingText ?? t('stepReview.existingFallback') }),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        { text: t('stepReview.distinct'), onPress: () => void resolve('distinct') },
        { text: t('stepReview.same'), onPress: () => void resolve('same') },
      ],
    );
  };

  if (!note.summary) {
    if (isGenerating) return <Generating />;
    const hasSource = parseDescription(note.content).text !== '' || note.segments.length > 0;
    return (
      <EmptyState
        icon={<SparkleIcon size={32} color={colors.contentInfo} />}
        title={t('summary.empty.title')}
        description={t('summary.empty.description')}
        actionLabel={canEdit && hasSource ? t('summary.generate') : undefined}
        onAction={canEdit && hasSource ? () => void generate() : undefined}
      />
    );
  }

  const outdated = isSummaryOutdated(note);

  return (
    <View style={styles.root}>
      <View style={styles.meta}>
        <Text variant="label-sm" color="contentTertiary" style={styles.metaText}>
          {note.summary_updated_at
            ? t('summary.generatedAt', { when: formatRelativeTime(note.summary_updated_at) })
            : t('tabs.summary')}
        </Text>
        {canEdit ? (
          isGenerating ? (
            <ActivityIndicator size="small" color={colors.contentInfo} />
          ) : (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={regenerate} style={styles.inline}>
              <ArrowClockwiseIcon size={14} color={colors.contentInfo} />
              <Text variant="label-sm" color="contentInfo">
                {t('summary.regenerate')}
              </Text>
            </Pressable>
          )
        ) : null}
      </View>

      {outdated && canEdit && !isGenerating ? (
        <View style={[styles.banner, { backgroundColor: colors.surfaceAccentSubtle }]}>
          <Text variant="body-sm" style={styles.metaText}>
            {t('summary.outdated')}
          </Text>
          <Button label={t('summary.update')} size="sm" variant="secondary" onPress={() => void generate()} />
        </View>
      ) : null}

      {nextSteps.body ? <DocView raw={nextSteps.body} /> : null}

      {nextSteps.steps.length > 0 ? (
        <View style={styles.steps}>
          <View style={styles.stepsHeader}>
            <Text variant="heading-sm" accessibilityRole="header" style={styles.metaText}>
              {t('nextSteps.title')}
            </Text>
            {canEdit && nextSteps.canSync ? (
              <Button
                label={t('nextSteps.addToTasks')}
                size="sm"
                variant="secondary"
                onPress={() => router.push({ pathname: '/nota/[id]/sincronizar', params: { id: note.id } })}
              />
            ) : null}
          </View>
          {nextSteps.steps.map((step) => {
            const pendingReview = step.reviewOf ? nextSteps.reviews.find((item) => item.stepId === step.stepId) : undefined;
            return (
              <View key={step.stepId ?? `${step.index}`} style={styles.step}>
                <TaskCheckbox checked={step.done} onToggle={() => toggle(step)} label={step.text} />
                <Text
                  variant="body-md"
                  color={step.done ? 'contentTertiary' : 'contentPrimary'}
                  style={[styles.stepText, step.done && styles.done]}
                >
                  {step.text}
                </Text>
                {step.taskId ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('nextSteps.openTask', { title: step.text })}
                    hitSlop={8}
                    onPress={() => router.push({ pathname: '/tarefa/[id]', params: { id: step.taskId! } })}
                    style={[styles.badge, { backgroundColor: colors.surfaceSecondary }]}
                  >
                    <Text variant="label-sm" color="contentSecondary">
                      {t('nextSteps.taskBadge')}
                    </Text>
                  </Pressable>
                ) : pendingReview && canEdit ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => review(pendingReview)}
                    style={[styles.badge, { backgroundColor: colors.surfaceAccentSubtle }]}
                  >
                    <Text variant="label-sm" color="contentInfo">
                      {t('nextSteps.isItATask')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Generating() {
  const { colors } = useTheme();
  const { t } = useTranslation('notes');
  return (
    <View style={styles.generating} accessibilityRole="progressbar" accessibilityLabel={t('summary.generating')}>
      <ActivityIndicator color={colors.contentInfo} />
      <Text variant="body-md" color="contentSecondary">
        {t('summary.generating')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  metaText: {
    flex: 1,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  steps: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  stepsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepText: {
    flex: 1,
  },
  done: {
    textDecorationLine: 'line-through',
  },
  badge: {
    borderRadius: radius.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  generating: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl * 2,
  },
});
