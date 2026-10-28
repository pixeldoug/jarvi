import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { addDays, toDateKey } from '@/lib/dates';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { Chip } from '@/ui/chip';
import { PlusIcon, TrashIcon } from '@/ui/icons';
import { Text } from '@/ui/text';
import { FIRST_TASK_TOPICS, createDraftTask, type OnboardingDraftTask } from './onboarding';

interface FirstTasksStepProps {
  tasks: OnboardingDraftTask[];
  onChange: (tasks: OnboardingDraftTask[]) => void;
}

const today = () => toDateKey(new Date());
const tomorrow = () => toDateKey(addDays(new Date(), 1));

export function FirstTasksStep({ tasks, onChange }: FirstTasksStepProps) {
  const { colors } = useTheme();

  const update = (id: string, patch: Partial<OnboardingDraftTask>) =>
    onChange(tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)));

  const addIdea = (title: string) => {
    if (tasks.some((task) => task.title.trim().toLowerCase() === title.toLowerCase())) return;
    const empty = tasks.find((task) => !task.title.trim());
    onChange(empty ? tasks.map((t) => (t.id === empty.id ? { ...t, title } : t)) : [...tasks, createDraftTask(title)]);
  };

  return (
    <View style={styles.root}>
      <Text variant="body-md" color="contentSecondary">
        Escreva o que está na sua cabeça. A Jarvi organiza e te lembra no WhatsApp.
      </Text>

      <View style={styles.rows}>
        {tasks.map((task, index) => (
          <View key={task.id} style={[styles.row, { borderColor: colors.borderPrimary, backgroundColor: colors.surfacePrimary }]}>
            <View style={styles.rowTop}>
              <TextInput
                value={task.title}
                onChangeText={(title) => update(task.id, { title })}
                placeholder={index === 0 ? 'Ex.: Renovar CNH' : 'Outra tarefa'}
                placeholderTextColor={colors.contentTertiary}
                autoFocus={index === 0 && !task.title}
                returnKeyType="done"
                accessibilityLabel={`Tarefa ${index + 1}`}
                style={[typography['body-md'], styles.input, { color: colors.contentPrimary }]}
              />
              {tasks.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remover tarefa"
                  hitSlop={8}
                  onPress={() => onChange(tasks.filter((t) => t.id !== task.id))}
                >
                  <TrashIcon size={18} color={colors.contentTertiary} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.dates}>
              <Chip label="Sem data" selected={!task.dueDate} onPress={() => update(task.id, { dueDate: null })} />
              <Chip label="Hoje" selected={task.dueDate === today()} onPress={() => update(task.id, { dueDate: today() })} />
              <Chip
                label="Amanhã"
                selected={task.dueDate === tomorrow()}
                onPress={() => update(task.id, { dueDate: tomorrow() })}
              />
            </View>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange([...tasks, createDraftTask()])}
          style={styles.add}
          hitSlop={4}
        >
          <PlusIcon size={16} color={colors.contentInfo} weight="bold" />
          <Text variant="label-md" color="contentInfo">
            Adicionar tarefa
          </Text>
        </Pressable>
      </View>

      <View style={styles.ideas}>
        <Text variant="label-md">Sem ideias? Toque para adicionar</Text>
        {FIRST_TASK_TOPICS.map((topic) => (
          <View key={topic.id} style={styles.topic}>
            <Text variant="label-sm" color="contentSecondary">
              {topic.title}
            </Text>
            <View style={styles.chips}>
              {topic.examples.map((example) => (
                <Chip
                  key={example}
                  label={example}
                  selected={tasks.some((t) => t.title.trim() === example)}
                  onPress={() => addIdea(example)}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xl,
  },
  rows: {
    gap: spacing.sm,
  },
  row: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.xs,
  },
  dates: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  ideas: {
    gap: spacing.md,
  },
  topic: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
