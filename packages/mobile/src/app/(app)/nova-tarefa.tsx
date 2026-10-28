import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/client';
import { createInput, emptyDraft, updateInput } from '@/features/tasks/task-draft';
import { TaskForm } from '@/features/tasks/task-form';
import { useConfirmDiscard } from '@/features/tasks/use-confirm-discard';
import { useCreateTask } from '@/features/tasks/use-tasks';
import { dateKeyOf } from '@/lib/dates';
import { useTheme } from '@/theme/theme-provider';
import { spacing } from '@/theme/tokens';
import { ModalHeader } from '@/ui/modal-header';

export default function NewTaskScreen() {
  const { colors } = useTheme();
  const { dueDate } = useLocalSearchParams<{ dueDate?: string }>();
  const create = useCreateTask();
  const [initial] = useState(() => emptyDraft({ dueDate: dateKeyOf(dueDate) }));
  const [draft, setDraft] = useState(initial);
  const dirty = Object.keys(updateInput(initial, draft)).length > 0 || draft.reminders.length > 0;
  const leave = useConfirmDiscard(dirty && !create.isPending);

  const save = async () => {
    try {
      await create.mutateAsync(createInput(draft));
      leave();
    } catch (error) {
      Alert.alert('Não foi possível criar a tarefa', errorMessage(error));
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.root, { backgroundColor: colors.surfaceGrouped }]}>
      <ModalHeader
        title="Nova tarefa"
        onCancel={() => router.back()}
        onConfirm={() => void save()}
        confirmLabel="Criar"
        confirmDisabled={!draft.title.trim()}
        busy={create.isPending}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={spacing.xl}
      >
        <TaskForm draft={draft} onChange={setDraft} autoFocusTitle />
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
  },
});
