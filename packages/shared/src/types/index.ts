// Base interfaces
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface User extends BaseEntity {
  email: string;
  name: string;
  avatar?: string;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: 'pt-BR' | 'en-US';
  notifications: {
    email: boolean;
    push: boolean;
    reminders: boolean;
  };
  currency: string;
  timezone: string;
}

// Task management
export interface Task extends BaseEntity {
  userId: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: TaskPriority;
  category: string;
  dueDate?: Date;
  tags: string[];
  estimatedTime?: number; // in minutes
  actualTime?: number; // in minutes
  parentTaskId?: string; // for subtasks
  subtasks?: Task[];
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskCategory {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

export interface TaskFilter {
  completed?: boolean;
  priority?: TaskPriority[];
  category?: string[];
  dueDate?: {
    from?: Date;
    to?: Date;
  };
  tags?: string[];
  search?: string;
}

// Notes management
export interface Note extends BaseEntity {
  userId: string;
  title: string;
  content: string;
  tags: string[];
  isFavorite: boolean;
  isArchived: boolean;
  color?: string;
  attachments?: NoteAttachment[];
  collaborators?: string[]; // user IDs
}

export interface NoteAttachment {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'document' | 'audio' | 'video';
  size: number;
}

// Financial management
export interface Transaction extends BaseEntity {
  userId: string;
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  date: Date;
  tags: string[];
  account?: string;
  recurring?: RecurringTransaction;
  attachments?: TransactionAttachment[];
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface TransactionCategory {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon?: string;
  parentId?: string;
}

export interface RecurringTransaction {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number; // every X days/weeks/months/years
  endDate?: Date;
  lastProcessed?: Date;
}

export interface TransactionAttachment {
  id: string;
  name: string;
  url: string;
  type: 'receipt' | 'invoice' | 'document';
}

// Habit tracking
export interface Habit extends BaseEntity {
  userId: string;
  name: string;
  description?: string;
  frequency: HabitFrequency;
  target: number;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  category: string;
  color?: string;
  icon?: string;
  reminders?: HabitReminder[];
  isActive: boolean;
}

export type HabitFrequency = 'daily' | 'weekly' | 'monthly';

export interface HabitLog extends BaseEntity {
  habitId: string;
  completed: boolean;
  date: Date;
  notes?: string;
  value?: number; // for habits with numeric values
}

export interface HabitReminder {
  id: string;
  time: string; // HH:mm format
  days: number[]; // 0-6 (Sunday-Saturday)
  enabled: boolean;
}

// Dashboard and analytics
export interface DashboardStats {
  tasks: {
    total: number;
    completed: number;
    overdue: number;
    dueToday: number;
  };
  habits: {
    total: number;
    active: number;
    completedToday: number;
    totalStreak: number;
  };
  finances: {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    monthlyTrend: number;
  };
  notes: {
    total: number;
    favorites: number;
  };
}

export interface AnalyticsData {
  period: 'week' | 'month' | 'year';
  tasks: {
    completed: number[];
    created: number[];
    labels: string[];
  };
  habits: {
    completions: number[];
    streaks: number[];
    labels: string[];
  };
  finances: {
    income: number[];
    expenses: number[];
    labels: string[];
  };
}

// API responses
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Search and filtering
export interface SearchParams extends PaginationParams {
  query?: string;
  filters?: Record<string, any>;
  dateRange?: {
    from?: Date;
    to?: Date;
  };
}

// Notifications
export interface Notification extends BaseEntity {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  data?: Record<string, any>;
  actionUrl?: string;
}

export type NotificationType =
  | 'task_due'
  | 'task_overdue'
  | 'habit_reminder'
  | 'goal_achieved'
  | 'system_update'
  | 'welcome';

// Settings and configuration
export interface AppSettings {
  version: string;
  features: {
    tasks: boolean;
    notes: boolean;
    finances: boolean;
    habits: boolean;
    analytics: boolean;
    notifications: boolean;
  };
  limits: {
    maxTasks: number;
    maxNotes: number;
    maxHabits: number;
    maxAttachments: number;
  };
}
