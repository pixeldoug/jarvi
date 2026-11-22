/**
 * Typed wrappers for the backend routes the app uses (packages/backend/src/routes).
 * Requests that need no session (login, WhatsApp code) work with a null token.
 */
import type { TaskReminder } from '@/types/reminder';
import type {
  AuthSession,
  Category,
  CreateTaskInput,
  NotificationSetting,
  SubscriptionInfo,
  Task,
  TaskList,
  ToggleTaskResponse,
  UpdateTaskInput,
  User,
} from '@/types/models';
import type {
  NoteCreatedTask,
  NoteDetail,
  NoteListItem,
  NotePatch,
  NotePatchResponse,
  NoteStepDecision,
  NoteStepReviewResponse,
  NoteSummaryResponse,
  NoteTaskMatch,
  NoteTranscriptSegment,
  TranscriptionUpload,
} from '@/types/notes';
import { api } from './client';

export const authApi = {
  profile: () => api.get<User>('/api/auth/profile'),
  login: (email: string, password: string) => api.post<AuthSession>('/api/auth/login', { email, password }),
  google: (idToken: string) => api.post<AuthSession>('/api/auth/google', { idToken }),
  verifyEmailCode: (email: string, code: string) =>
    api.post<AuthSession>('/api/auth/verify-email-otp', { email, code }),
  resendVerification: (email: string) => api.post<{ message?: string }>('/api/auth/resend-verification', { email }),
};

export const onboardingApi = {
  /** `devCode` comes back outside production so the flow can be tested without WhatsApp. */
  requestWhatsAppCode: (phone: string) =>
    api.post<{ devCode?: string; message?: string }>('/api/onboarding/whatsapp/request', { phone }),
  verifyWhatsAppCode: (phone: string, code: string, context: 'login' | 'onboarding') =>
    api.post<AuthSession>('/api/onboarding/whatsapp/verify', { phone, code, context }),
  recordStep: (step: string) => api.post<unknown>('/api/onboarding/step', { step }),
  complete: (payload: OnboardingCompletePayload) =>
    api.post<OnboardingCompleteResponse>('/api/onboarding/complete', payload),
};

export interface OnboardingCompletePayload {
  name: string;
  trackingMethods: string[];
  painPoints: string[];
  trackingMethodsOther: string;
  painPointsOther: string;
  idealOutcomeText: string;
  firstTasksText: string;
  firstTasks: { title: string; dueDate: string | null; time: string | null }[];
  memorySeedText: string;
}

export interface OnboardingFollowUp {
  ack: string;
  question: string;
  choices: string[];
  taskTitle?: string;
  taskId?: string;
  field?: 'due_date' | 'time' | 'reminders';
  settled?: boolean;
}

export interface OnboardingCreatedTask {
  id: string;
  title: string;
  dueDate: string | null;
  time: string | null;
}

export interface OnboardingCompleteResponse {
  alreadyCompleted?: boolean;
  onboardingCompletedAt?: string;
  taskCount?: number;
  followUpMessage?: string;
  followUp?: OnboardingFollowUp;
  createdTasks?: OnboardingCreatedTask[];
  firstName?: string;
}

export const tasksApi = {
  list: () => api.get<Task[]>('/api/tasks'),
  create: (input: CreateTaskInput) => api.post<Task>('/api/tasks', { important: false, ...input }),
  update: (id: string, input: UpdateTaskInput) => api.put<Task>(`/api/tasks/${id}`, input),
  toggle: (id: string) => api.patch<ToggleTaskResponse>(`/api/tasks/${id}/toggle`),
  remove: (id: string) => api.delete<unknown>(`/api/tasks/${id}`),
  reminders: (id: string) => api.get<TaskReminder[]>(`/api/tasks/${id}/reminders`),
  replaceReminders: (id: string, reminders: Record<string, unknown>[]) =>
    api.put<TaskReminder[]>(`/api/tasks/${id}/reminders`, { reminders }),
};

export const categoriesApi = {
  list: () => api.get<Category[]>('/api/categories'),
  create: (name: string) => api.post<Category>('/api/categories', { name }),
  update: (id: string, input: { name?: string; visible?: boolean }) => api.put<Category>(`/api/categories/${id}`, input),
  remove: (id: string) => api.delete<unknown>(`/api/categories/${id}`),
};

export const listsApi = {
  list: () => api.get<TaskList[]>('/api/lists'),
};

export type NotificationEndpoint = 'daily-summary' | 'weekly-planning';

export const usersApi = {
  updateProfile: (input: { name?: string; preferred_name?: string }) => api.put<unknown>('/api/users/profile', input),
  timezone: () => api.get<{ timezone: string }>('/api/users/timezone'),
  setTimezone: (timezone: string) => api.put<{ timezone: string }>('/api/users/timezone', { timezone }),
  memory: () => api.get<{ memoryText?: string | null }>('/api/users/memory-profile'),
  setMemory: (memoryText: string) =>
    api.put<{ message?: string }>('/api/users/memory-profile', { memoryText, consentAiMemory: true }),
  notification: (endpoint: NotificationEndpoint) => api.get<NotificationSetting>(`/api/users/${endpoint}`),
  setNotification: (endpoint: NotificationEndpoint, patch: Partial<Pick<NotificationSetting, 'enabled' | 'sendTime'>>) =>
    api.put<NotificationSetting>(`/api/users/${endpoint}`, patch),
  deleteAccount: () => api.delete<unknown>('/api/users/me'),
};

export const subscriptionApi = {
  status: () => api.get<SubscriptionInfo>('/api/subscriptions/status'),
  extendTrial: () => api.post<unknown>('/api/subscriptions/extend-trial'),
};

const notePath = (id: string) => `/api/notes/${encodeURIComponent(id)}`;

export const notesApi = {
  list: () => api.get<NoteListItem[]>('/api/notes'),
  get: (id: string) => api.get<NoteDetail>(notePath(id)),
  create: () => api.post<NoteDetail>('/api/notes', {}),
  update: (id: string, patch: NotePatch) => api.patch<NotePatchResponse>(notePath(id), patch),
  remove: (id: string) => api.delete<{ id: string }>(notePath(id)),
  setPinned: (id: string, pinned: boolean) => api.put<{ pinned_at: string | null }>(`${notePath(id)}/pin`, { pinned }),
  /** `segment` is null when the audio had no speech. */
  transcribe: (id: string, body: TranscriptionUpload) =>
    api.post<{ segment: NoteTranscriptSegment | null }>(`${notePath(id)}/transcriptions`, body),
  generateSummary: (id: string) => api.post<NoteSummaryResponse>(`${notePath(id)}/summary`, {}),
  /** One task per item, answered in the order of `items`. */
  /** Open tasks the user already has that may be these next steps (at most one per step). */
  findTaskMatches: (id: string, texts: string[]) =>
    api.post<{ matches: NoteTaskMatch[] }>(`${notePath(id)}/task-matches`, { texts }),
  /** One task per item; an item with `link_task_id` is tied to that task of the user instead. */
  createTasks: (id: string, items: { text: string; step_id: string; link_task_id?: string }[]) =>
    api.post<{ tasks: NoteCreatedTask[] }>(`${notePath(id)}/tasks`, { items }),
  reviewStep: (id: string, stepId: string, decision: NoteStepDecision) =>
    api.post<NoteStepReviewResponse>(`${notePath(id)}/steps/${encodeURIComponent(stepId)}/review`, { decision }),
};
