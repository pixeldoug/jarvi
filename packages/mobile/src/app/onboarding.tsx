import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { onboardingApi } from '@/api/endpoints';
import { useAuth, useCurrentUser } from '@/auth/auth-provider';
import { setPendingChatSeed } from '@/features/chat/pending-seed';
import { FirstTasksStep } from '@/features/onboarding/first-tasks-step';
import {
  INTERVIEW_PROMPTS,
  INTERVIEW_STEPS,
  PAIN_POINT_OPTIONS,
  TRACKING_METHOD_OPTIONS,
  buildMemorySeed,
  buildOnboardingChat,
  createDraftTask,
  serializeDraftTasks,
  stepError,
  type OnboardingAnswers,
} from '@/features/onboarding/onboarding';
import { OptionList } from '@/features/onboarding/option-list';
import { queryKeys } from '@/features/tasks/use-tasks';
import { useTheme } from '@/theme/theme-provider';
import { radius, spacing } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

/** Placeholder name the backend gives WhatsApp sign-ups. */
const PLACEHOLDER_NAME = 'Você';

export default function OnboardingScreen() {
  const user = useCurrentUser();
  const { updateUser, signOut } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const initialName = user.preferred_name || user.name;
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    name: initialName && initialName !== PLACEHOLDER_NAME && !initialName.includes('@') ? initialName : '',
    trackingMethods: [],
    trackingMethodsOther: '',
    painPoints: [],
    painPointsOther: '',
    idealOutcomeText: '',
    tasks: [createDraftTask()],
  });

  const step = INTERVIEW_STEPS[stepIndex]!;
  const isLast = stepIndex === INTERVIEW_STEPS.length - 1;
  const set = (patch: Partial<OnboardingAnswers>) => {
    setAnswers((current) => ({ ...current, ...patch }));
    if (error) setError(null);
  };
  const toggle = (field: 'trackingMethods' | 'painPoints', value: string) => {
    const current = answers[field];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    const otherField = field === 'trackingMethods' ? 'trackingMethodsOther' : 'painPointsOther';
    set({ [field]: next, ...(next.includes('other') ? {} : { [otherField]: '' }) });
  };

  const complete = async () => {
    setSubmitting(true);
    const tasks = answers.tasks.filter((task) => task.title.trim());
    try {
      const response = await onboardingApi.complete({
        name: answers.name.trim(),
        trackingMethods: answers.trackingMethods,
        painPoints: answers.painPoints,
        trackingMethodsOther: answers.trackingMethodsOther.trim(),
        painPointsOther: answers.painPointsOther.trim(),
        idealOutcomeText: answers.idealOutcomeText.trim(),
        firstTasksText: serializeDraftTasks(tasks),
        firstTasks: tasks.map((task) => ({ title: task.title.trim(), dueDate: task.dueDate, time: task.time })),
        memorySeedText: buildMemorySeed(answers),
      });
      const firstName = answers.name.trim().split(/\s+/)[0] || response.firstName?.trim() || undefined;
      setPendingChatSeed(buildOnboardingChat(response, firstName));
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      // Flips the root guard to the signed-in stack.
      updateUser({
        onboardingCompletedAt: response.onboardingCompletedAt ?? new Date().toISOString(),
        name: answers.name.trim(),
        preferred_name: answers.name.trim(),
      });
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível concluir agora.'));
      setSubmitting(false);
    }
  };

  const next = () => {
    const invalid = stepError(step, answers);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (isLast) {
      void complete();
      return;
    }
    // `first_tasks` is recorded by /onboarding/complete.
    void onboardingApi.recordStep(step).catch(() => undefined);
    setStepIndex((index) => index + 1);
  };

  if (submitting && !error) {
    return (
      <Screen contentStyle={styles.preparing}>
        <ActivityIndicator color={colors.contentInfo} size="large" />
        <Text variant="heading-sm" align="center">
          Preparando sua Jarvi…
        </Text>
        <Text variant="body-md" color="contentSecondary" align="center">
          Organizando suas primeiras tarefas.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      footer={
        <>
          {/* Pinned above the buttons so it stays visible on long steps. */}
          {error ? (
            <View style={[styles.error, { backgroundColor: colors.surfaceSecondary }]} accessibilityLiveRegion="polite">
              <Text variant="body-sm" color="contentNegative">
                {error}
              </Text>
            </View>
          ) : null}
          <Button label={isLast ? 'Criar minhas tarefas' : 'Continuar'} onPress={next} loading={submitting} />
          {stepIndex > 0 ? (
            <Button label="Voltar" variant="ghost" onPress={() => setStepIndex((index) => index - 1)} />
          ) : (
            <Button label="Sair" variant="ghost" onPress={() => void signOut()} />
          )}
        </>
      }
    >
      <View style={styles.progress} accessibilityLabel={`Passo ${stepIndex + 1} de ${INTERVIEW_STEPS.length}`}>
        {INTERVIEW_STEPS.map((id, index) => (
          <View
            key={id}
            style={[styles.progressBar, { backgroundColor: index <= stepIndex ? colors.contentInfo : colors.surfaceSecondary }]}
          />
        ))}
      </View>

      <Text variant="heading-lg">{INTERVIEW_PROMPTS[step]}</Text>

      {step === 'name' ? (
        <TextField
          value={answers.name}
          onChangeText={(name) => set({ name })}
          placeholder="Seu nome ou apelido"
          autoFocus
          autoCapitalize="words"
          textContentType="givenName"
          returnKeyType="next"
          onSubmitEditing={next}
          accessibilityLabel="Como você prefere ser chamado"
        />
      ) : null}

      {step === 'tracking' ? (
        <>
          <OptionList
            options={TRACKING_METHOD_OPTIONS}
            selected={answers.trackingMethods}
            onToggle={(value) => toggle('trackingMethods', value)}
          />
          {answers.trackingMethods.includes('other') ? (
            <TextField
              value={answers.trackingMethodsOther}
              onChangeText={(trackingMethodsOther) => set({ trackingMethodsOther })}
              placeholder="Conte como você faz"
              autoFocus
            />
          ) : null}
        </>
      ) : null}

      {step === 'pain' ? (
        <>
          <OptionList options={PAIN_POINT_OPTIONS} selected={answers.painPoints} onToggle={(value) => toggle('painPoints', value)} />
          {answers.painPoints.includes('other') ? (
            <TextField
              value={answers.painPointsOther}
              onChangeText={(painPointsOther) => set({ painPointsOther })}
              placeholder="Conte o que mais te atrapalha"
              autoFocus
            />
          ) : null}
        </>
      ) : null}

      {step === 'open' ? (
        <TextField
          value={answers.idealOutcomeText}
          onChangeText={(idealOutcomeText) => set({ idealOutcomeText })}
          placeholder="Ex.: me lembrar das contas e não deixar nada vencer"
          multiline
          autoFocus
          hint="Opcional"
          accessibilityLabel="Como seria a Jarvi ideal para você"
        />
      ) : null}

      {step === 'first_tasks' ? <FirstTasksStep tasks={answers.tasks} onChange={(tasks) => set({ tasks })} /> : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  preparing: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  progress: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: radius.round,
  },
  error: {
    padding: spacing.md,
    borderRadius: radius.sm,
  },
});
