/**
 * Onboarding completion outside the web wizard.
 *
 * The wizard (`onboardingController.completeOnboarding`) is the normal way an
 * account gets `onboarding_completed_at`. But a person rescued through
 * WhatsApp finishes the "primeiras tarefas" step by simply sending Jarvi what
 * they need to do. If we did not stamp completion here, they would keep
 * being a ghost in PostHog, keep getting rescue nudges, and the web app would
 * bounce them back to `/criar-conta` when they tried to "organize on the
 * computer".
 *
 * Only `onboarding_completed_at` is set. `onboarding_journey_completed_at`
 * stays null on purpose: the first time they open the web chat, the backend
 * still walks them through prazo/horário/lembrete of those first tasks.
 */
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { captureServer } from './posthogService';

export interface MarkOnboardingCompletedInput {
  userId: string;
  /** PostHog distinct_id (email). */
  email?: string | null;
  taskCount?: number;
  now?: Date;
}

/**
 * Stamps `onboarding_completed_at` when it is still null. Returns true only
 * for the call that actually flipped it, so telemetry fires once.
 */
export async function markOnboardingCompletedViaWhatsapp(
  input: MarkOnboardingCompletedInput,
): Promise<boolean> {
  const nowIso = (input.now ?? new Date()).toISOString();
  let changed = false;

  if (isPostgreSQL()) {
    const result = await getPool().query(
      `UPDATE users SET onboarding_completed_at = $1, updated_at = $1
       WHERE id = $2 AND onboarding_completed_at IS NULL`,
      [nowIso, input.userId],
    );
    changed = (result.rowCount ?? 0) > 0;
  } else {
    const result = await getDatabase().run(
      `UPDATE users SET onboarding_completed_at = ?, updated_at = ?
       WHERE id = ? AND onboarding_completed_at IS NULL`,
      [nowIso, nowIso, input.userId],
    );
    changed = (result.changes ?? 0) > 0;
  }

  if (!changed) return false;

  if (input.email) {
    // Same events the wizard emits, so the funnel in PostHog closes for
    // rescued accounts too (`step_index` 5 = first_tasks in ONBOARDING_STEPS).
    captureServer(input.email, 'onboarding_step_completed', {
      step: 'first_tasks',
      step_index: 5,
      step_count: 6,
      source: 'whatsapp',
    });
    captureServer(input.email, 'onboarding_completed', {
      task_count: input.taskCount ?? 1,
      d1_reminder_scheduled: false,
      source: 'whatsapp',
    });
  }

  return true;
}
