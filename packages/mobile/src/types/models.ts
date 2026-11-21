/**
 * API models as the backend returns them. Field names follow the JSON
 * (snake_case for rows, camelCase where the backend already uses it).
 * Mirrors the interfaces in packages/web/src/contexts.
 */
import type { RecurrenceType } from './recurrence';
import type { TaskReminderDraft } from './reminder';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  user_id: string;
  source?: string | null;
  title: string;
  /** Plain text or a serialized TipTap doc (see lib/description.ts). */
  description?: string | null;
  original_whatsapp_content?: string | null;
  media_attachments?: string | null;
  completed: boolean;
  priority?: TaskPriority | null;
  /** Category name (not id). */
  category?: string | null;
  important?: boolean;
  /** HH:mm */
  time?: string | null;
  /** YYYY-MM-DD, sometimes with a time suffix. */
  due_date?: string | null;
  recurrence_type?: RecurrenceType | null;
  recurrence_config?: string | null;
  recurrence_until?: string | null;
  recurrence_parent_id?: string | null;
  created_at: string;
  updated_at: string;
}

/** Response of PATCH /api/tasks/:id/toggle. */
export interface ToggleTaskResponse extends Task {
  next_occurrence?: Task | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  category?: string;
  important?: boolean;
  time?: string;
  dueDate?: string;
  recurrence_type?: RecurrenceType;
  recurrence_config?: string;
  recurrence_until?: string | null;
  reminders?: TaskReminderDraft[];
}

/**
 * Partial update: omitted fields keep their server value. Clear `dueDate` and
 * `time` with '' and `category`/`priority` with null.
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: TaskPriority | null;
  category?: string | null;
  important?: boolean;
  time?: string;
  dueDate?: string;
  recurrence_type?: RecurrenceType;
  recurrence_config?: string | null;
  recurrence_until?: string | null;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  position?: number | null;
  /** Hidden categories stay assignable but leave the filters. Defaults to true. */
  visible?: boolean | null;
  created_at: string;
  updated_at: string;
}

/** A saved filter ("Filtros" on the web). */
export interface TaskList {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  category_names: string[];
  priority?: string | null;
  connected_app?: string | null;
  show_completed?: boolean;
  filter_no_category?: boolean;
  created_at: string;
  updated_at: string;
}

export type AuthProvider = 'email' | 'google' | 'whatsapp';

export interface User {
  id: string;
  email: string;
  name: string;
  preferred_name?: string | null;
  avatar?: string | null;
  subscription_status?: SubscriptionStatus;
  authProvider?: AuthProvider;
  hasPassword?: boolean;
  onboardingCompletedAt?: string | null;
  whatsappVerified?: boolean;
  whatsappPhone?: string | null;
  emailVerified?: boolean;
  /** UI language saved on the account ('pt-BR' | 'en-US'). Missing on the old backend. */
  locale?: string | null;
}

export interface AuthSession {
  token: string;
  user: User;
  isNewUser?: boolean;
}

export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  isActive: boolean;
  trialExtended?: boolean;
  planType?: 'monthly' | 'annual' | 'lifetime' | null;
}

export interface NotificationSetting {
  enabled: boolean;
  /** HH:mm */
  sendTime: string;
  timezone: string;
}
