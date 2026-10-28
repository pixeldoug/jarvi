import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/client';
import { draftFromTask, remindersChanged, updateInput, type TaskDraft } from '@/features/tasks/task-draft';
import { TaskForm } from '@/features/tasks/task-form';
import { displayTitle } from '@/features/tasks/task-row';
import {
  useDeleteTask,
  useReplaceReminders,
  useTaskReminders,
  useTasks,
  useUpdateTask,
} from '@/features/tasks/use-tasks';
import { useConfirmDiscard } from '@/features/tasks/use-confirm-discard';
import { useToggleWithFeedback } from '@/features/tasks/use-toggle-with-feedback';
import type { ConfiguredReminder } from '@/lib/reminders';
import { useTheme } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { TrashIcon } from '@/ui/icons';
import { ModalHeader } from '@/ui/modal-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { TaskCheckbox } from '@/ui/task-checkbox';
import { Text } from '@/ui/text';
import { useToast } from '@/ui/toast';
import type { Task } from '@/types/models';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const tasks = useTasks();
  const live = tasks.data?.find((t) => t.id === id);
  // Keep showing the task while the modal closes after a delete.
  const [lastSeen, setLastSeen] = useState(live);
  if (live && live !== lastSeen) setLastSeen(live);
  const task = live ?? lastSeen;
  const reminders = useTaskReminders(id);

  if (!task && tasks.isPending) return <LoadingState />;

  if (!task) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.surfaceGrouped }]}>
        <ModalHeader title="Tarefa" onCancel={() => router.back()} />
        <EmptyState title="Tarefa não encontrada" description="Ela pode ter sido excluída em outro aparelho." />
      </SafeAreaView>
    );
  }

  if (reminders.isPending) return <LoadingState />;

  // Saving replaces every reminder, so never start editing from a failed load.
  if (reminders.isError) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.surfaceGrouped }]}>
        <ModalHeader title="Tarefa" onCancel={() => router.back()} />
        <ErrorState message={errorMessage(reminders.error)} onRetry={() => void reminders.refetch()} />
      </SafeAreaView>
    );
  }

  return <TaskEditor task={task} reminders={reminders.data} />;
}

/**
 * Owns the draft from its first render. Later refetches (realtime, focus)
 * update `task` but never overwrite what the person is typing.
 */
function TaskEditor({ task, reminders }: { task: Task; reminders: ConfiguredReminder[] }) {
  const { colors } = useTheme();
  const update = useUpdateTask();
  const replaceReminders = useReplaceReminders(task.id);
  const { remove, restore } = useDeleteTask();
  const toggle = useToggleWithFeedback();
  const toast = useToast();
  const [original] = useState<TaskDraft>(() => draftFromTask(task, reminders));
  const [draft, setDraft] = useState<TaskDraft>(original);
  const [saving, setSaving] = useState(false);

  const input = updateInput(original, draft);
  const reminderChange = remindersChanged(original.reminders, draft.reminders);
  const dirty = Object.keys(input).length > 0 || reminderChange;
  const leave = useConfirmDiscard(dirty && !saving);

  const save = async () => {
    if (!draft.title.trim()) {
      Alert.alert('A tarefa precisa de um título');
      return;
    }
    setSaving(true);
    try {
      if (Object.keys(input).length > 0) await update.mutateAsync({ id: task.id, input });
      if (reminderChange) await replaceReminders.mutateAsync(draft.reminders);
      leave();
    } catch (error) {
      Alert.alert('Não foi possível salvar', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Excluir tarefa?', displayTitle(task.title), [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          // Failures are reported by the mutation itself: this screen is gone by then.
          remove.mutate(task);
          leave();
          toast({ message: 'Tarefa excluída.', actionLabel: 'Desfazer', onAction: () => restore.mutate(task) });
        },
      },
    ]);

  return (
    <SafeAreaView edges={['bottom']} style={[styles.root, { backgroundColor: colors.surfaceGrouped }]}>
      <ModalHeader title="Tarefa" onCancel={() => router.back()} onConfirm={() => void save()} confirmDisabled={!dirty} busy={saving} />
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={spacing.xl}
      >
        <TaskForm
          draft={draft}
          onChange={setDraft}
          leading={
            <View style={styles.checkbox}>
              <TaskCheckbox checked={task.completed} onToggle={() => toggle(task)} label={displayTitle(task.title)} />
            </View>
          }
        />
        {task.original_whatsapp_content ? (
          <View style={styles.origin}>
            <Text variant="label-sm" color="contentSecondary">
              MENSAGEM ORIGINAL NO WHATSAPP
            </Text>
            <Text variant="body-sm" color="contentSecondary">
              {task.original_whatsapp_content}
            </Text>
          </View>
        ) : null}
        <Button
          label="Excluir tarefa"
          variant="ghost"
          icon={<TrashIcon size={18} color={colors.contentNegative} />}
          onPress={confirmDelete}
          style={styles.delete}
        />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.xl,
  },
  checkbox: {
    paddingTop: 2,
  },
  origin: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  delete: {
    alignSelf: 'center',
  },
});
