import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNote } from '@/features/notes/use-notes';
import { useTaskSync, type ExistingTask, type SyncStep } from '@/features/notes/use-task-sync';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { ModalHeader } from '@/ui/modal-header';
import { EmptyState } from '@/ui/states';
import { TaskCheckbox } from '@/ui/task-checkbox';
import { Text } from '@/ui/text';
import { useToast } from '@/ui/toast';

/** Same words, ignoring case, accents and punctuation. */
function sameWords(a: string, b: string): boolean {
  const fold = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return fold(a) === fold(b);
}

/**
 * "Sincronizar com tarefas" (the web's ConvertToTasksDialog): pick the next
 * steps that go to Tarefas. A step the user already has as an open task is
 * tied to that task instead of repeating it; "Criar nova" opts out.
 */
export default function SyncTasksScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['notes', 'common']);
  const { colors } = useTheme();
  const toast = useToast();
  const note = useNote(id);
  const { steps, matches, prepareFailed, isSyncing, sync } = useTaskSync(note.data);
  // Steps the user flipped from the default (picked: still open, without a task).
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set());
  const [createNew, setCreateNew] = useState<ReadonlySet<string>>(() => new Set());
  const isMatching = steps !== null && matches === null;

  const isPicked = (step: SyncStep) => !step.taskId && (!step.checked) !== flipped.has(step.stepId);
  const existingFor = (step: SyncStep): ExistingTask | null =>
    (!step.taskId && !createNew.has(step.stepId) && matches?.get(step.stepId)) || null;

  const flip = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const picked = (steps ?? []).filter(isPicked);
  const useExisting = new Map(
    picked.flatMap((step) => {
      const existing = existingFor(step);
      return existing ? [[step.stepId, existing.id] as const] : [];
    }),
  );

  const confirm = async () => {
    const { created, linked, skipped, failed } = await sync(picked, useExisting);
    if (failed) toast({ message: t('tasksSync.failed') });
    else if (skipped > 0) toast({ message: t('tasksSync.skipped', { count: skipped }) });
    else if (created + linked > 0) {
      const synced = t('tasksSync.synced', { count: created + linked });
      toast({
        message:
          created === 0
            ? t('tasksSync.linked', { count: linked })
            : linked === 0
              ? synced
              : t('tasksSync.syncedWithExisting', { synced, count: linked }),
        actionLabel: t('toast.view'),
        onAction: () => router.navigate('/'),
      });
    }
    // Kept open for a retry only when nothing went through.
    if (!failed || created + linked > 0) router.back();
  };

  const matchNote = (step: SyncStep, match: ExistingTask): string => {
    const renamed = !sameWords(match.title, step.text);
    if (!isPicked(step)) return renamed ? t('tasksSync.inListAs', { title: match.title }) : t('tasksSync.inList');
    if (!existingFor(step)) return t('tasksSync.willCreate');
    return renamed ? t('tasksSync.willUseAs', { title: match.title }) : t('tasksSync.willUse');
  };

  let body;
  if (prepareFailed) {
    body = <EmptyState title={t('tasksSync.prepareFailed')} />;
  } else if (steps === null) {
    body = (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.contentInfo} />
      </View>
    );
  } else if (steps.length === 0) {
    body = <EmptyState title={t('tasksSync.empty')} />;
  } else {
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.description} accessibilityLiveRegion="polite">
          {isMatching ? <ActivityIndicator size="small" color={colors.contentInfo} /> : null}
          <Text variant="body-md" color="contentSecondary" style={styles.flex}>
            {isMatching
              ? t('tasksSync.checking')
              : matches && matches.size > 0
                ? t('tasksSync.descriptionMatches')
                : t('tasksSync.description')}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surfaceCard, borderColor: colors.borderPrimary }]}>
          {steps.map((step, index) => {
            const isLinked = !!step.taskId;
            const selected = isLinked || isPicked(step);
            const match = !isLinked ? (matches?.get(step.stepId) ?? null) : null;
            const toggle = () => {
              if (!isLinked && !isSyncing) setFlipped((prev) => flip(prev, step.stepId));
            };
            return (
              <Pressable
                key={step.stepId}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: isLinked }}
                accessibilityLabel={step.text}
                disabled={isLinked || isSyncing}
                onPress={toggle}
                style={[
                  styles.row,
                  index < steps.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
                ]}
              >
                <TaskCheckbox checked={selected} onToggle={toggle} label={step.text} />
                <View style={styles.flex}>
                  <Text variant="body-md" color={isLinked ? 'contentTertiary' : 'contentPrimary'}>
                    {step.text}
                  </Text>
                  {match ? (
                    <Text variant="body-sm" color="contentSecondary">
                      {matchNote(step, match)}
                    </Text>
                  ) : null}
                </View>
                {isLinked ? (
                  <View style={[styles.badge, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text variant="label-sm" color="contentSecondary">
                      {t('tasksSync.alreadyTask')}
                    </Text>
                  </View>
                ) : match ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    disabled={isSyncing}
                    onPress={() => setCreateNew((prev) => flip(prev, step.stepId))}
                  >
                    <Text variant="label-sm" color="contentInfo">
                      {existingFor(step) ? t('tasksSync.createNew') : t('tasksSync.useExisting')}
                    </Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.root, { backgroundColor: colors.surfaceGrouped }]}>
      <ModalHeader
        title={t('tasksSync.title')}
        onCancel={() => router.back()}
        onConfirm={() => void confirm()}
        confirmLabel={t('tasksSync.confirm')}
        confirmDisabled={picked.length === 0 || isMatching}
        busy={isSyncing}
      />
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  description: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  badge: {
    borderRadius: radius.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
});
