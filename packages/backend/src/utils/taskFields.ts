export const MAX_TASK_TITLE_LENGTH = 500;
export const VALID_TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

export type ParseTaskFieldsResult =
  | {
      ok: true;
      title?: string;
      priority?: string | null;
      dueDate?: string | null;
    }
  | { ok: false; error: string };

function isValidYmd(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function sanitizeTaskTitle(value: unknown, required: boolean): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    if (required) return { ok: false, error: 'Title is required' };
    return { ok: true };
  }

  if (typeof value !== 'string') {
    return { ok: false, error: 'Title must be a string' };
  }

  const normalized = value.replace(/[\r\n]+/g, ' ').trim();
  if (!normalized) {
    return { ok: false, error: 'Title is required' };
  }

  if (normalized.length > MAX_TASK_TITLE_LENGTH) {
    return { ok: false, error: `Title must be at most ${MAX_TASK_TITLE_LENGTH} characters` };
  }

  return { ok: true, value: normalized };
}

export function sanitizeTaskPriority(
  value: unknown
): { ok: true; value?: string | null } | { ok: false; error: string } {
  if (value === undefined) return { ok: true };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') {
    return { ok: false, error: 'Priority must be low, medium, high, or null' };
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'none' || normalized === 'null') {
    return { ok: true, value: null };
  }

  if ((VALID_TASK_PRIORITIES as readonly string[]).includes(normalized)) {
    return { ok: true, value: normalized };
  }

  return { ok: false, error: 'Priority must be low, medium, or high' };
}

export function sanitizeTaskDueDate(
  value: unknown
): { ok: true; value?: string | null } | { ok: false; error: string } {
  if (value === undefined) return { ok: true };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') {
    return { ok: false, error: 'dueDate must be a valid date (YYYY-MM-DD)' };
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
    return { ok: true, value: null };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    if (!isValidYmd(trimmed)) {
      return { ok: false, error: 'dueDate must be a valid date (YYYY-MM-DD)' };
    }
    return { ok: true, value: trimmed };
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const iso = new Date(parsed).toISOString();
    const ymd = iso.slice(0, 10);
    if (isValidYmd(ymd)) {
      return { ok: true, value: trimmed.includes('T') ? iso : ymd };
    }
  }

  return { ok: false, error: 'dueDate must be a valid date (YYYY-MM-DD)' };
}

export function parseTaskFields(
  input: { title?: unknown; priority?: unknown; dueDate?: unknown },
  opts: { titleRequired?: boolean } = {}
): ParseTaskFieldsResult {
  const title = sanitizeTaskTitle(input.title, Boolean(opts.titleRequired));
  if (!title.ok) return title;

  const priority = sanitizeTaskPriority(input.priority);
  if (!priority.ok) return priority;

  const dueDate = sanitizeTaskDueDate(input.dueDate);
  if (!dueDate.ok) return dueDate;

  return {
    ok: true,
    ...(title.value !== undefined ? { title: title.value } : {}),
    ...(priority.value !== undefined ? { priority: priority.value } : {}),
    ...(dueDate.value !== undefined ? { dueDate: dueDate.value } : {}),
  };
}
