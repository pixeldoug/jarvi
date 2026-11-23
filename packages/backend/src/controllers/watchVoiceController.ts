import { Request, Response } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { recordTaskCreated } from '../services/taskTelemetry';
import {
  isClockTime,
  isDateKey,
  NoSpeechError,
  transcribeVoiceTask,
  VoiceTaskContext,
} from '../services/watchVoiceTaskService';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A spoken task is a few seconds; the watch stops recording at 60 s. */
const VOICE_AUDIO_MAX_BYTES = 5 * 1024 * 1024;
const VOICE_AUDIO_MAX_BASE64_LENGTH = Math.ceil(VOICE_AUDIO_MAX_BYTES / 3) * 4 + 4;

type TaskRow = Record<string, unknown>;

const findTask = async (id: string, userId: string): Promise<TaskRow | undefined> => {
  if (isPostgreSQL()) {
    const result = await getPool().query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [
      id,
      userId,
    ]);
    return result.rows[0];
  }
  return getDatabase().get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [id, userId]);
};

const idTaken = async (id: string): Promise<boolean> => {
  if (isPostgreSQL()) {
    const result = await getPool().query('SELECT 1 FROM tasks WHERE id = $1', [id]);
    return result.rows.length > 0;
  }
  return !!(await getDatabase().get('SELECT 1 FROM tasks WHERE id = ?', [id]));
};

const insertTask = async (
  id: string,
  userId: string,
  task: { title: string; dueDate: string; time: string | null },
): Promise<TaskRow | undefined> => {
  const now = new Date().toISOString();
  const values = [id, userId, task.title, false, task.time, task.dueDate, 'none', now, now];
  if (isPostgreSQL()) {
    await getPool().query(
      `INSERT INTO tasks (id, user_id, title, important, time, due_date, recurrence_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      values,
    );
  } else {
    await getDatabase().run(
      `INSERT INTO tasks (id, user_id, title, important, time, due_date, recurrence_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values,
    );
  }
  return findTask(id, userId);
};

/** Today and now in Brazil, for a client that did not send its own. */
const serverClock = (): { today: string; now: string } => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { today: `${get('year')}-${get('month')}-${get('day')}`, now: `${get('hour')}:${get('minute')}` };
};

/**
 * POST /api/tasks/voice — the Apple Watch's main action. Body:
 * `{ audio: base64, mimeType, clientId: uuid, today: YYYY-MM-DD, now: HH:mm }`.
 *
 * `clientId` becomes the task id, so an upload the watch retries (it keeps
 * recordings made offline and sends them later) returns the task it already
 * created instead of a second one. `today`/`now` are the watch's local clock:
 * "amanhã" and "sexta" are relative to where the person is.
 *
 * 201 `{ task, transcript }` · 200 the same for a retry · 422 `no_speech`.
 */
export const createTaskFromVoice = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  const { audio, mimeType, clientId, today, now } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof clientId !== 'string' || !UUID_PATTERN.test(clientId)) {
    res.status(400).json({ error: 'invalid_client_id' });
    return;
  }
  if (typeof mimeType !== 'string' || !mimeType.toLowerCase().startsWith('audio/')) {
    res.status(400).json({ error: 'invalid_mime_type' });
    return;
  }
  if (typeof audio !== 'string' || audio.length === 0) {
    res.status(400).json({ error: 'invalid_audio' });
    return;
  }
  if (audio.length > VOICE_AUDIO_MAX_BASE64_LENGTH) {
    res.status(413).json({ error: 'audio_too_large' });
    return;
  }
  const buffer = Buffer.from(audio, 'base64');
  if (buffer.length === 0) {
    res.status(400).json({ error: 'invalid_audio' });
    return;
  }

  const taskId = clientId.toLowerCase();
  try {
    const existing = await findTask(taskId, userId);
    if (existing) {
      res.status(200).json({ task: existing, transcript: null });
      return;
    }
    if (await idTaken(taskId)) {
      res.status(409).json({ error: 'client_id_taken' });
      return;
    }
  } catch (error) {
    console.error('Watch voice task: lookup failed', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  const fallback = serverClock();
  const context: VoiceTaskContext = {
    today: isDateKey(today) ? today : fallback.today,
    now: isClockTime(now) ? now : fallback.now,
    locale: req.get('X-Jarvi-Locale') === 'en-US' ? 'en-US' : 'pt-BR',
  };

  let result: Awaited<ReturnType<typeof transcribeVoiceTask>>;
  try {
    result = await transcribeVoiceTask(buffer, mimeType, context, {
      email: req.user?.email,
      userId,
    });
  } catch (error) {
    if (error instanceof NoSpeechError) {
      res.status(422).json({ error: 'no_speech' });
      return;
    }
    console.error('Watch voice task: transcription failed', error);
    res.status(502).json({ error: 'transcription_failed' });
    return;
  }

  try {
    const task = await insertTask(taskId, userId, result.task);
    recordTaskCreated({
      email: req.user?.email ?? '',
      source: 'watch',
      taskId,
      priority: null,
      hasDueDate: true,
      hasCategory: false,
      isImportant: false,
      hasRecurrence: false,
    });
    res.status(201).json({ task, transcript: result.transcript });
  } catch (error) {
    // Two uploads of the same recording at once: the other one created it.
    const created = await findTask(taskId, userId).catch(() => undefined);
    if (created) {
      res.status(200).json({ task: created, transcript: result.transcript });
      return;
    }
    console.error('Watch voice task: insert failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
