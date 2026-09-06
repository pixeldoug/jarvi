import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { generateToken } from '../middleware/auth';
import { sendVerificationCode, sendOnboardingWelcomeTemplate } from '../services/whatsappService';
import {
  persistOnboardingLead,
  notifyNewAccountCreated,
} from './earlyAccessController';
import {
  syncOnboardingLeadWithUser,
  toPublicUser,
  getInternalTrialEndsAtIso,
} from './authController';
import { composeOnboardingFollowUp, extractOnboardingTasks } from '../services/openaiService';
import { capitalizeTaskTitle } from '../utils/taskTitle';
import { identifyServer, captureServer } from '../services/posthogService';
import { getUserTimezone } from '../services/reminderService';
import { recordTaskCreated } from '../services/taskTelemetry';
import { normalizeTaskDueDate } from '../services/agent/core/tasks';

const parseDbBoolean = (value: unknown): boolean =>
  value === true || value === 1 || value === '1';

const sanitizeString = (value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 16)
    )
  );
};

const formatTaskList = (titles: string[]): string => {
  if (titles.length === 0) return 'suas primeiras tarefas';
  if (titles.length === 1) return titles[0]!;
  if (titles.length === 2) return `${titles[0]} e ${titles[1]}`;
  return `${titles.slice(0, -1).join(', ')} e ${titles[titles.length - 1]}`;
};

interface OnboardingUserRow {
  id: string;
  email: string;
  name: string;
  whatsapp_phone?: string | null;
  whatsapp_verified?: boolean | number | null;
  onboarding_completed_at?: string | Date | null;
  timezone?: string | null;
}

const getUserForOnboarding = async (userId: string): Promise<OnboardingUserRow | null> => {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      `SELECT id, email, name, whatsapp_phone, whatsapp_verified, onboarding_completed_at, timezone
       FROM users WHERE id = $1`,
      [userId]
    );
    return (result.rows[0] as OnboardingUserRow | undefined) ?? null;
  }

  const row = await getDatabase().get(
    `SELECT id, email, name, whatsapp_phone, whatsapp_verified, onboarding_completed_at, timezone
     FROM users WHERE id = ?`,
    [userId]
  );
  return (row as OnboardingUserRow | undefined) ?? null;
};

const ONBOARDING_TASK_CAP = 16;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

type OnboardingDraftTask = {
  title: string;
  dueDate: string | null;
  time: string | null;
};

type CreatedOnboardingTask = OnboardingDraftTask & { id: string };

const parseOnboardingDraftTasks = (value: unknown): OnboardingDraftTask[] => {
  if (!Array.isArray(value)) return [];
  const tasks: OnboardingDraftTask[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const title = capitalizeTaskTitle(sanitizeString(row.title, 200));
    if (!title) continue;
    const dueRaw = typeof row.dueDate === 'string' ? row.dueDate.trim() : '';
    const timeRaw = typeof row.time === 'string' ? row.time.trim().slice(0, 5) : '';
    tasks.push({
      title,
      dueDate: DATE_KEY_RE.test(dueRaw) ? dueRaw : null,
      time: TIME_RE.test(timeRaw) ? timeRaw : null,
    });
    if (tasks.length >= ONBOARDING_TASK_CAP) break;
  }
  return tasks;
};

const normalizeTaskTitleKey = (title: string): string => title.trim().toLocaleLowerCase('pt-BR');

const toIsoCutoff = (value: string | Date, extraMs = 120_000): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return new Date(date.getTime() + extraMs).toISOString();
};

const mapOnboardingTaskRow = (row: {
  id: string;
  title: string;
  due_date?: string | Date | null;
  time?: string | null;
}): CreatedOnboardingTask => ({
  id: row.id,
  title: row.title,
  dueDate: normalizeTaskDueDate(row.due_date),
  time: typeof row.time === 'string' && TIME_RE.test(row.time.slice(0, 5)) ? row.time.slice(0, 5) : null,
});

const completedAtIso = (value: string | Date): string =>
  value instanceof Date ? value.toISOString() : String(value);

const listActiveOnboardingTasks = async (
  userId: string,
  createdBeforeIso?: string,
): Promise<CreatedOnboardingTask[]> => {
  if (isPostgreSQL()) {
    const result = createdBeforeIso
      ? await getPool().query(
          `SELECT id, title, due_date, time
           FROM tasks
           WHERE user_id = $1
             AND (completed = FALSE OR completed IS NULL)
             AND created_at <= $2
           ORDER BY created_at ASC
           LIMIT $3`,
          [userId, createdBeforeIso, ONBOARDING_TASK_CAP],
        )
      : await getPool().query(
          `SELECT id, title, due_date, time
           FROM tasks
           WHERE user_id = $1 AND (completed = FALSE OR completed IS NULL)
           ORDER BY created_at ASC`,
          [userId],
        );
    return (result.rows as Array<{
      id: string;
      title: string;
      due_date?: string | Date | null;
      time?: string | null;
    }>).map(mapOnboardingTaskRow);
  }

  const rows = createdBeforeIso
    ? await getDatabase().all(
        `SELECT id, title, due_date, time
         FROM tasks
         WHERE user_id = ?
           AND (completed = 0 OR completed IS NULL)
           AND created_at <= ?
         ORDER BY created_at ASC
         LIMIT ?`,
        [userId, createdBeforeIso, ONBOARDING_TASK_CAP],
      )
    : await getDatabase().all(
        `SELECT id, title, due_date, time
         FROM tasks
         WHERE user_id = ? AND (completed = 0 OR completed IS NULL)
         ORDER BY created_at ASC`,
        [userId],
      );
  return (
    (rows as Array<{
      id: string;
      title: string;
      due_date?: string | Date | null;
      time?: string | null;
    }>) || []
  ).map(mapOnboardingTaskRow);
};

const buildOnboardingCompletePayload = async (params: {
  user: OnboardingUserRow;
  createdTasks: CreatedOnboardingTask[];
  firstTasksText: string;
  completedAt: string | Date;
  alreadyCompleted: boolean;
  aiTelemetry: { email: string; userId: string; traceId: string };
}) => {
  const followUp = await composeOnboardingFollowUp(
    params.createdTasks,
    params.firstTasksText,
    params.aiTelemetry,
  );
  const rawFirstName = params.user.name.trim().split(/\s+/)[0] || params.user.name;
  const preferredName = rawFirstName === 'Você' ? '' : rawFirstName;
  const createdTitles = params.createdTasks.map((task) => task.title);
  return {
    success: true,
    alreadyCompleted: params.alreadyCompleted,
    onboardingCompletedAt:
      params.completedAt instanceof Date ? params.completedAt.toISOString() : params.completedAt,
    taskCount: createdTitles.length,
    taskTitles: createdTitles,
    createdTasks: params.createdTasks,
    followUp,
    followUpMessage: followUp.question,
    firstName: preferredName || undefined,
    d1ReminderScheduled: false,
  };
};

type FinalizeOnboardingResult = {
  claimed: boolean;
  completedAt: string;
  tasks: CreatedOnboardingTask[];
  insertedTasks: CreatedOnboardingTask[];
};

const insertTaskValues = (
  taskId: string,
  userId: string,
  task: OnboardingDraftTask,
  now: string,
  booleanFalse: boolean | number,
) => [
  taskId,
  userId,
  task.title,
  null,
  null,
  null,
  booleanFalse,
  task.time,
  task.dueDate,
  'none',
  now,
  now,
];

const reuseOrPlanInserts = (
  plannedTasks: OnboardingDraftTask[],
  existingTasks: CreatedOnboardingTask[],
): { tasks: CreatedOnboardingTask[]; toInsert: CreatedOnboardingTask[] } => {
  const existingByTitle = new Map(
    existingTasks.map((task) => [normalizeTaskTitleKey(task.title), task]),
  );
  const tasks: CreatedOnboardingTask[] = [];
  const toInsert: CreatedOnboardingTask[] = [];

  for (const task of plannedTasks) {
    const reused = existingByTitle.get(normalizeTaskTitleKey(task.title));
    if (reused) {
      tasks.push(reused);
      continue;
    }
    const created = {
      id: uuidv4(),
      title: task.title,
      dueDate: task.dueDate,
      time: task.time,
    };
    tasks.push(created);
    toInsert.push(created);
    existingByTitle.set(normalizeTaskTitleKey(task.title), created);
  }

  return { tasks, toInsert };
};

/**
 * Locks the user row, inserts missing first tasks, and stamps
 * onboarding_completed_at in the same transaction so concurrent completes
 * cannot duplicate work.
 */
const finalizeOnboardingTasks = async (params: {
  userId: string;
  plannedTasks: OnboardingDraftTask[];
  now: string;
}): Promise<FinalizeOnboardingResult> => {
  const taskInsertSql = `INSERT INTO tasks (id, user_id, title, description, priority, category, important, time, due_date, recurrence_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;

  if (isPostgreSQL()) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        `SELECT onboarding_completed_at FROM users WHERE id = $1 FOR UPDATE`,
        [params.userId],
      );
      const lockedUser = locked.rows[0] as { onboarding_completed_at?: string | Date | null } | undefined;
      if (!lockedUser) {
        await client.query('ROLLBACK');
        throw new Error('User not found');
      }

      if (lockedUser.onboarding_completed_at) {
        const completedAt = completedAtIso(lockedUser.onboarding_completed_at);
        const existing = await client.query(
          `SELECT id, title, due_date, time
           FROM tasks
           WHERE user_id = $1
             AND (completed = FALSE OR completed IS NULL)
             AND created_at <= $2
           ORDER BY created_at ASC
           LIMIT $3`,
          [params.userId, toIsoCutoff(lockedUser.onboarding_completed_at), ONBOARDING_TASK_CAP],
        );
        await client.query('COMMIT');
        return {
          claimed: false,
          completedAt,
          tasks: (existing.rows as Array<{
            id: string;
            title: string;
            due_date?: string | Date | null;
            time?: string | null;
          }>).map(mapOnboardingTaskRow),
          insertedTasks: [],
        };
      }

      const existing = await client.query(
        `SELECT id, title, due_date, time
         FROM tasks
         WHERE user_id = $1 AND (completed = FALSE OR completed IS NULL)
         ORDER BY created_at ASC`,
        [params.userId],
      );
      const { tasks, toInsert } = reuseOrPlanInserts(
        params.plannedTasks,
        (existing.rows as Array<{
          id: string;
          title: string;
          due_date?: string | Date | null;
          time?: string | null;
        }>).map(mapOnboardingTaskRow),
      );

      for (const task of toInsert) {
        await client.query(
          taskInsertSql,
          insertTaskValues(task.id, params.userId, task, params.now, false),
        );
      }

      await client.query(
        `UPDATE users SET onboarding_completed_at = $1, updated_at = $2 WHERE id = $3`,
        [params.now, params.now, params.userId],
      );
      await client.query('COMMIT');
      return { claimed: true, completedAt: params.now, tasks, insertedTasks: toInsert };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback failure
      }
      throw error;
    } finally {
      client.release();
    }
  }

  const db = getDatabase();
  await db.exec('PRAGMA busy_timeout = 5000');
  await db.exec('BEGIN IMMEDIATE');
  try {
    const lockedUser = (await db.get(
      `SELECT onboarding_completed_at FROM users WHERE id = ?`,
      [params.userId],
    )) as { onboarding_completed_at?: string | Date | null } | undefined;
    if (!lockedUser) {
      await db.exec('ROLLBACK');
      throw new Error('User not found');
    }

    if (lockedUser.onboarding_completed_at) {
      const completedAt = completedAtIso(lockedUser.onboarding_completed_at);
      const existing = ((await db.all(
        `SELECT id, title, due_date, time
         FROM tasks
         WHERE user_id = ?
           AND (completed = 0 OR completed IS NULL)
           AND created_at <= ?
         ORDER BY created_at ASC
         LIMIT ?`,
        [params.userId, toIsoCutoff(lockedUser.onboarding_completed_at), ONBOARDING_TASK_CAP],
      )) || []) as Array<{
        id: string;
        title: string;
        due_date?: string | Date | null;
        time?: string | null;
      }>;
      await db.exec('COMMIT');
      return {
        claimed: false,
        completedAt,
        tasks: existing.map(mapOnboardingTaskRow),
        insertedTasks: [],
      };
    }

    const existing = ((await db.all(
      `SELECT id, title, due_date, time
       FROM tasks
       WHERE user_id = ? AND (completed = 0 OR completed IS NULL)
       ORDER BY created_at ASC`,
      [params.userId],
    )) || []) as Array<{
      id: string;
      title: string;
      due_date?: string | Date | null;
      time?: string | null;
    }>;
    const { tasks, toInsert } = reuseOrPlanInserts(
      params.plannedTasks,
      existing.map(mapOnboardingTaskRow),
    );

    for (const task of toInsert) {
      await db.run(
        `INSERT INTO tasks (id, user_id, title, description, priority, category, important, time, due_date, recurrence_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        insertTaskValues(task.id, params.userId, task, params.now, 0),
      );
    }

    await db.run(
      `UPDATE users SET onboarding_completed_at = ?, updated_at = ? WHERE id = ?`,
      [params.now, params.now, params.userId],
    );
    await db.exec('COMMIT');
    return { claimed: true, completedAt: params.now, tasks, insertedTasks: toInsert };
  } catch (error) {
    try {
      await db.exec('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw error;
  }
};

const updateUserName = async (userId: string, name: string): Promise<void> => {
  const now = new Date().toISOString();
  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE users SET name = $1, preferred_name = $2, updated_at = $3 WHERE id = $4`,
      [name, name, now, userId],
    );
    return;
  }

  await getDatabase().run(
    `UPDATE users SET name = ?, preferred_name = ?, updated_at = ? WHERE id = ?`,
    [name, name, now, userId],
  );
};

export const completeOnboarding = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const user = await getUserForOnboarding(userId);
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    const aiTelemetry = { email: user.email, userId, traceId: uuidv4() };

    if (user.onboarding_completed_at) {
      const existingTasks = await listActiveOnboardingTasks(
        userId,
        toIsoCutoff(user.onboarding_completed_at),
      );
      const firstTasksText = sanitizeString(req.body?.firstTasksText, 2000)
        || existingTasks.map((task) => task.title).join('\n');
      res.json(
        await buildOnboardingCompletePayload({
          user,
          createdTasks: existingTasks,
          firstTasksText,
          completedAt: user.onboarding_completed_at,
          alreadyCompleted: true,
          aiTelemetry,
        }),
      );
      return;
    }

    const displayName = sanitizeString(req.body?.name, 80);
    const trackingMethods = parseStringArray(req.body?.trackingMethods);
    const painPoints = parseStringArray(req.body?.painPoints);
    const trackingMethodsOther = sanitizeString(req.body?.trackingMethodsOther, 500);
    const painPointsOther = sanitizeString(req.body?.painPointsOther, 500);
    const idealOutcomeText = sanitizeString(req.body?.idealOutcomeText, 2000);
    const firstTasksText = sanitizeString(req.body?.firstTasksText, 2000);
    const memorySeedText = sanitizeString(req.body?.memorySeedText, 4000);
    const draftTasks = parseOnboardingDraftTasks(req.body?.firstTasks);

    if (!displayName || displayName === 'Você') {
      res.status(400).json({ error: 'Diga como você prefere ser chamado.' });
      return;
    }
    if (trackingMethods.length === 0) {
      res.status(400).json({ error: 'Selecione ao menos uma forma de registro.' });
      return;
    }
    if (painPoints.length === 0) {
      res.status(400).json({ error: 'Selecione ao menos um desafio.' });
      return;
    }
    if (!firstTasksText) {
      res.status(400).json({ error: 'Conte o que você precisa fazer primeiro.' });
      return;
    }

    await updateUserName(userId, displayName);
    user.name = displayName;

    const timezone = user.timezone || (await getUserTimezone(userId));
    let plannedTasks = draftTasks;
    if (plannedTasks.length === 0) {
      const extracted = await extractOnboardingTasks(firstTasksText, {
        timezone,
        ...aiTelemetry,
      });
      plannedTasks = extracted.map((task) => ({
        title: task.title,
        dueDate: task.due_date,
        time: task.time,
      }));
    }
    if (plannedTasks.length === 0) {
      res.status(400).json({ error: 'Não consegui identificar tarefas. Tente listar 2 ou 3 ações.' });
      return;
    }

    const leadPayload: Record<string, unknown> = {
      flowVersion: 'web-onboarding-v3',
      source: 'web-onboarding',
      name: user.name,
      email: user.email,
      trackingMethods,
      painPoints,
      desiredCapabilities: [],
      otherDetails: {
        trackingMethods: trackingMethodsOther || undefined,
        painPoints: painPointsOther || undefined,
      },
      idealOutcomeText,
      interviewAvailability: 'no',
      contactValue: '',
      contactType: null,
      wantsBroadcastUpdates: false,
      memorySeedText:
        memorySeedText ||
        `Você se chama ${user.name}. Resultado ideal: ${idealOutcomeText}`.trim(),
      utmSource: sanitizeString(req.body?.utmSource, 200) || undefined,
      utmMedium: sanitizeString(req.body?.utmMedium, 200) || undefined,
      utmCampaign: sanitizeString(req.body?.utmCampaign, 200) || undefined,
      referringDomain: sanitizeString(req.body?.referringDomain, 200) || undefined,
    };

    const leadResult = await persistOnboardingLead(leadPayload, { emailOverride: user.email });
    if (!leadResult.ok) {
      res.status(400).json({ error: leadResult.error || 'Não foi possível salvar o onboarding.' });
      return;
    }

    try {
      await syncOnboardingLeadWithUser(user.email, userId);
    } catch (syncError) {
      console.error('Failed to sync onboarding memory:', syncError);
    }

    const now = new Date().toISOString();
    const finalized = await finalizeOnboardingTasks({
      userId,
      plannedTasks,
      now,
    });

    if (finalized.claimed) {
      for (const task of finalized.insertedTasks) {
        recordTaskCreated({
          email: user.email,
          source: 'web',
          taskId: task.id,
          hasDueDate: Boolean(task.dueDate),
          hasCategory: false,
          hasRecurrence: false,
        });
      }

      const rawFirstName = user.name.trim().split(/\s+/)[0] || user.name;
      const firstName = rawFirstName === 'Você' ? 'oi' : rawFirstName;
      const tasksLine = formatTaskList(finalized.tasks.map((task) => task.title));
      if (parseDbBoolean(user.whatsapp_verified) && user.whatsapp_phone) {
        try {
          await sendOnboardingWelcomeTemplate(user.whatsapp_phone, firstName, tasksLine);
        } catch (welcomeError) {
          console.error('Failed to send onboarding welcome WhatsApp:', welcomeError);
        }
      }

      captureServer(user.email, 'onboarding_completed', {
        task_count: finalized.tasks.length,
        d1_reminder_scheduled: false,
        source: 'backend',
      });
    }

    res.json(
      await buildOnboardingCompletePayload({
        user,
        createdTasks: finalized.tasks,
        firstTasksText,
        completedAt: finalized.completedAt,
        alreadyCompleted: !finalized.claimed,
        aiTelemetry,
      }),
    );
  } catch (error) {
    console.error('completeOnboarding error:', error);
    res.status(500).json({ error: 'Não foi possível concluir o onboarding.' });
  }
};

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const WHATSAPP_PLACEHOLDER_EMAIL_SUFFIX = '@users.jarvi.internal';
const WHATSAPP_AUTH_PASSWORD = 'whatsapp-auth';
const DEFAULT_WHATSAPP_NAME = 'Você';

const generateWhatsappLinkCode = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

const normalizeWhatsappPhone = (input: string): string => {
  const digits = input.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
};

const placeholderEmailForPhone = (phone: string): string =>
  `wa.${phone.replace(/\D/g, '')}${WHATSAPP_PLACEHOLDER_EMAIL_SUFFIX}`;

const readOptionalUserId = (req: Request): string | null => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as { id?: string };
    return decoded.id || null;
  } catch {
    return null;
  }
};

const upsertOnboardingOtp = async (phone: string, code: string, expiresAt: string): Promise<void> => {
  const now = new Date().toISOString();
  if (isPostgreSQL()) {
    await getPool().query(
      `INSERT INTO onboarding_whatsapp_otps (phone, code, expires_at, attempt_count, created_at, updated_at)
       VALUES ($1, $2, $3, 0, $4, $5)
       ON CONFLICT (phone) DO UPDATE SET
         code = EXCLUDED.code,
         expires_at = EXCLUDED.expires_at,
         attempt_count = 0,
         updated_at = EXCLUDED.updated_at`,
      [phone, code, expiresAt, now, now]
    );
    return;
  }

  const db = getDatabase();
  const existing = await db.get('SELECT phone FROM onboarding_whatsapp_otps WHERE phone = ?', [phone]);
  if (existing) {
    await db.run(
      `UPDATE onboarding_whatsapp_otps
       SET code = ?, expires_at = ?, attempt_count = 0, updated_at = ?
       WHERE phone = ?`,
      [code, expiresAt, now, phone]
    );
    return;
  }
  await db.run(
    `INSERT INTO onboarding_whatsapp_otps (phone, code, expires_at, attempt_count, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
    [phone, code, expiresAt, now, now]
  );
};

const getOnboardingOtp = async (phone: string) => {
  if (isPostgreSQL()) {
    const result = await getPool().query(
      `SELECT phone, code, expires_at, attempt_count FROM onboarding_whatsapp_otps WHERE phone = $1`,
      [phone]
    );
    return result.rows[0] as
      | { phone: string; code: string; expires_at: string | Date; attempt_count: number }
      | undefined;
  }
  return getDatabase().get(
    `SELECT phone, code, expires_at, attempt_count FROM onboarding_whatsapp_otps WHERE phone = ?`,
    [phone]
  ) as Promise<
    { phone: string; code: string; expires_at: string | Date; attempt_count: number } | undefined
  >;
};

const bumpOtpAttempts = async (phone: string, nextCount: number): Promise<void> => {
  const now = new Date().toISOString();
  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE onboarding_whatsapp_otps SET attempt_count = $1, updated_at = $2 WHERE phone = $3`,
      [nextCount, now, phone]
    );
    return;
  }
  await getDatabase().run(
    `UPDATE onboarding_whatsapp_otps SET attempt_count = ?, updated_at = ? WHERE phone = ?`,
    [nextCount, now, phone]
  );
};

const deleteOnboardingOtp = async (phone: string): Promise<void> => {
  if (isPostgreSQL()) {
    await getPool().query('DELETE FROM onboarding_whatsapp_otps WHERE phone = $1', [phone]);
    return;
  }
  await getDatabase().run('DELETE FROM onboarding_whatsapp_otps WHERE phone = ?', [phone]);
};

const getUserById = async (userId: string) => {
  if (isPostgreSQL()) {
    const result = await getPool().query('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows[0];
  }
  return getDatabase().get('SELECT * FROM users WHERE id = ?', [userId]);
};

const getUserByPhone = async (phone: string) => {
  if (isPostgreSQL()) {
    const result = await getPool().query('SELECT * FROM users WHERE whatsapp_phone = $1', [phone]);
    return result.rows[0];
  }
  return getDatabase().get('SELECT * FROM users WHERE whatsapp_phone = ?', [phone]);
};

const markUserWhatsappVerified = async (userId: string, phone: string): Promise<void> => {
  const now = new Date().toISOString();
  if (isPostgreSQL()) {
    await getPool().query(
      `UPDATE users
       SET whatsapp_phone = $1, whatsapp_verified = TRUE, whatsapp_link_code = NULL,
           whatsapp_link_code_expires_at = NULL, updated_at = $2
       WHERE id = $3`,
      [phone, now, userId]
    );
    return;
  }
  await getDatabase().run(
    `UPDATE users
     SET whatsapp_phone = ?, whatsapp_verified = 1, whatsapp_link_code = NULL,
         whatsapp_link_code_expires_at = NULL, updated_at = ?
     WHERE id = ?`,
    [phone, now, userId]
  );
};

const createWhatsappUser = async (phone: string) => {
  const now = new Date().toISOString();
  const userId = uuidv4();
  const trialEndsAt = getInternalTrialEndsAtIso();
  const email = placeholderEmailForPhone(phone);

  if (isPostgreSQL()) {
    await getPool().query(
      `INSERT INTO users (
         id, email, name, password, auth_provider, has_password, email_verified,
         subscription_status, trial_ends_at, whatsapp_phone, whatsapp_verified, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        userId,
        email,
        DEFAULT_WHATSAPP_NAME,
        WHATSAPP_AUTH_PASSWORD,
        'whatsapp',
        false,
        true,
        'trialing',
        trialEndsAt,
        phone,
        true,
        now,
        now,
      ]
    );
  } else {
    await getDatabase().run(
      `INSERT INTO users (
         id, email, name, password, auth_provider, has_password, email_verified,
         subscription_status, trial_ends_at, whatsapp_phone, whatsapp_verified, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        email,
        DEFAULT_WHATSAPP_NAME,
        WHATSAPP_AUTH_PASSWORD,
        'whatsapp',
        0,
        1,
        'trialing',
        trialEndsAt,
        phone,
        1,
        now,
        now,
      ]
    );
  }

  return getUserById(userId);
};

export const requestOnboardingWhatsapp = async (req: Request, res: Response): Promise<void> => {
  try {
    const phone = normalizeWhatsappPhone(typeof req.body?.phone === 'string' ? req.body.phone : '');
    if (!phone || phone.length < 12) {
      res.status(400).json({ error: 'Número de WhatsApp inválido. Use DDI e DDD.' });
      return;
    }

    const code = generateWhatsappLinkCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    await upsertOnboardingOtp(phone, code, expiresAt);

    const allowLocalOtpBypass = process.env.NODE_ENV !== 'production';
    let deliveredViaWhatsapp = false;

    if (allowLocalOtpBypass) {
      console.warn(`[onboarding] Local OTP for ${phone}: ${code}`);
    } else {
      await sendVerificationCode(phone, code);
      deliveredViaWhatsapp = true;
    }

    res.json({
      success: true,
      message: deliveredViaWhatsapp
        ? 'Código enviado via WhatsApp.'
        : 'WhatsApp indisponível neste ambiente. Use o código local para continuar.',
      expiresAt,
      phone,
      ...(!deliveredViaWhatsapp ? { delivery: 'local', devCode: code } : {}),
    });
  } catch (error) {
    console.error('requestOnboardingWhatsapp error:', error);
    res.status(500).json({ error: 'Erro ao enviar código de verificação' });
  }
};

export const verifyOnboardingWhatsapp = async (req: Request, res: Response): Promise<void> => {
  try {
    const phone = normalizeWhatsappPhone(typeof req.body?.phone === 'string' ? req.body.phone : '');
    const providedCode = String(req.body?.code || '').replace(/\D/g, '').slice(0, 6);
    if (!phone || phone.length < 12) {
      res.status(400).json({ error: 'Número de WhatsApp inválido.' });
      return;
    }
    if (providedCode.length !== 6) {
      res.status(400).json({ error: 'Código inválido' });
      return;
    }

    const otp = await getOnboardingOtp(phone);
    if (!otp) {
      res.status(400).json({ error: 'Peça um código novo para este número.' });
      return;
    }

    const expiresAt = new Date(otp.expires_at).getTime();
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      await deleteOnboardingOtp(phone);
      res.status(400).json({ error: 'Código expirado. Peça um novo.' });
      return;
    }

    const attempts = Number(otp.attempt_count || 0);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await deleteOnboardingOtp(phone);
      res.status(429).json({ error: 'Muitas tentativas. Peça um código novo.' });
      return;
    }

    if (String(otp.code) !== providedCode) {
      await bumpOtpAttempts(phone, attempts + 1);
      res.status(400).json({ error: 'Código inválido' });
      return;
    }

    await deleteOnboardingOtp(phone);

    const optionalUserId = readOptionalUserId(req);
    const existingByPhone = await getUserByPhone(phone);
    let user = existingByPhone;
    let isNewUser = false;

    if (optionalUserId) {
      if (existingByPhone && existingByPhone.id !== optionalUserId) {
        res.status(409).json({ error: 'Este número já está vinculado a outra conta.' });
        return;
      }
      await markUserWhatsappVerified(optionalUserId, phone);
      user = await getUserById(optionalUserId);
    } else if (existingByPhone) {
      await markUserWhatsappVerified(existingByPhone.id, phone);
      user = await getUserById(existingByPhone.id);
    } else {
      user = await createWhatsappUser(phone);
      isNewUser = true;
    }

    if (!user) {
      res.status(500).json({ error: 'Não foi possível criar sua sessão.' });
      return;
    }

    if (isNewUser) {
      identifyServer(user.email, {
        email: user.email,
        user_id: user.id,
        auth_provider: 'whatsapp',
        whatsapp_phone: phone,
        subscription_status: 'trialing',
      });
      captureServer(user.email, 'user_registered', {
        method: 'whatsapp',
        source: 'backend',
      });
      void notifyNewAccountCreated(user.email, user.id);
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    res.json({
      success: true,
      token,
      user: toPublicUser(user),
      isNewUser,
      phone,
    });
  } catch (error: unknown) {
    const errorMessage = String((error as { message?: string })?.message || '');
    const isUniqueViolation =
      (error as { code?: string })?.code === '23505' || errorMessage.includes('UNIQUE constraint failed');
    if (isUniqueViolation) {
      res.status(409).json({ error: 'Este número já está vinculado a outra conta.' });
      return;
    }
    console.error('verifyOnboardingWhatsapp error:', error);
    res.status(500).json({ error: 'Erro ao validar código' });
  }
};
