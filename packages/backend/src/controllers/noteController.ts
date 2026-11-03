import { Request, Response } from 'express';
import * as noteService from '../services/noteService';
import { isValidStepId } from '../services/noteTasks';
import {
  NOTE_AUDIO_MAX_BYTES,
  NOTE_BODY_MAX_BYTES,
  NOTE_TASK_TEXT_MAX_CHARS,
  NOTE_TASKS_MAX_ITEMS,
  NOTE_TITLE_MAX_CHARS,
  type NoteAccessLevel,
  type NotePatch,
} from '../services/noteService';

// ---------------------------------------------------------------------------
// Notas — JSON contract in services/noteService.ts (mirrored by the web's
// lib/notesApi.ts). Errors are `{ error: <code> }`.
// ---------------------------------------------------------------------------

const MAX_NOTE_ID_LENGTH = 64;
/** A base64 string longer than this decodes to more than the audio limit. */
const MAX_AUDIO_BASE64_LENGTH = Math.ceil(NOTE_AUDIO_MAX_BYTES / 3) * 4 + 4;
const MAX_SEGMENT_DURATION_MS = 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FieldError = { status: number; error: string };

const isTooLarge = (value: string): boolean => Buffer.byteLength(value, 'utf8') > NOTE_BODY_MAX_BYTES;

function validateTitle(value: unknown): FieldError | null {
  if (typeof value !== 'string') return { status: 400, error: 'invalid_title' };
  if (value.length > NOTE_TITLE_MAX_CHARS) return { status: 400, error: 'title_too_long' };
  return null;
}

const NOTE_CATEGORY_MAX_CHARS = 100;

/** A category name (same values as `tasks.category`), or `null` to clear it */
function validateCategory(value: unknown): FieldError | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim() === '') return { status: 400, error: 'invalid_category' };
  if (value.trim().length > NOTE_CATEGORY_MAX_CHARS) return { status: 400, error: 'category_too_long' };
  return null;
}

/** A real calendar day as `YYYY-MM-DD`, or `null` to remove the note's date */
function validateNoteDate(value: unknown): FieldError | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { status: 400, error: 'invalid_note_date' };
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { status: 400, error: 'invalid_note_date' };
  }
  return null;
}

function validateContent(value: unknown): FieldError | null {
  if (typeof value !== 'string') return { status: 400, error: 'invalid_content' };
  if (isTooLarge(value)) return { status: 413, error: 'content_too_large' };
  return null;
}

function validateSummary(value: unknown): FieldError | null {
  if (value === null) return null;
  if (typeof value !== 'string') return { status: 400, error: 'invalid_summary' };
  if (isTooLarge(value)) return { status: 413, error: 'summary_too_large' };
  return null;
}

/** `[{ text }]` → the trimmed texts; `null` unless 1..30 items of 1..500 chars. */
/** `[{ step_id, text }]`: every next step names its stable id (`attrs.stepId`). */
function readTaskItems(value: unknown): Array<{ stepId: string; text: string }> | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > NOTE_TASKS_MAX_ITEMS) return null;
  const steps: Array<{ stepId: string; text: string }> = [];
  for (const item of value) {
    const { text, step_id: stepId } = (item && typeof item === 'object' ? item : {}) as {
      text?: unknown;
      step_id?: unknown;
    };
    if (typeof text !== 'string' || !isValidStepId(stepId)) return null;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > NOTE_TASK_TEXT_MAX_CHARS) return null;
    steps.push({ stepId, text: trimmed });
  }
  return steps;
}

const readNoteId = (req: Request): string | null => {
  const id = req.params.id;
  return typeof id === 'string' && id.length > 0 && id.length <= MAX_NOTE_ID_LENGTH ? id : null;
};

/**
 * Resolves the caller's access, answering 404/403 itself. `null` means the
 * response was already sent.
 */
async function requireNoteAccess(
  req: Request,
  res: Response,
  need: 'read' | 'write' | 'owner',
): Promise<{ noteId: string; userId: string; access: NoteAccessLevel } | null> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return null;
  }
  const noteId = readNoteId(req);
  const access = noteId ? await noteService.getNoteAccess(noteId, userId) : null;
  if (!noteId || !access) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  const allowed =
    need === 'read' ||
    (need === 'write' && noteService.canWriteNote(access)) ||
    (need === 'owner' && access === 'owner');
  if (!allowed) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return { noteId, userId, access };
}

const telemetryFor = (req: Request) => ({ email: req.user?.email, userId: req.user?.id });

export const getNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    res.json(await noteService.listNotes(userId));
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { title, content } = (req.body ?? {}) as { title?: unknown; content?: unknown };
    const invalid =
      (title !== undefined ? validateTitle(title) : null) ||
      (content !== undefined ? validateContent(content) : null);
    if (invalid) {
      res.status(invalid.status).json({ error: invalid.error });
      return;
    }

    const note = await noteService.createNote(userId, {
      title: title as string | undefined,
      content: content as string | undefined,
    });
    res.status(201).json(note);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
};

export const getNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = await requireNoteAccess(req, res, 'read');
    if (!ctx) return;
    const note = await noteService.getNoteDetail(ctx.noteId, ctx.access, ctx.userId);
    if (!note) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(note);
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const patchNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: NotePatch = {};
    let invalid: FieldError | null = null;

    if (body.title !== undefined) {
      invalid = validateTitle(body.title);
      patch.title = body.title as string;
    }
    if (!invalid && body.content !== undefined) {
      invalid = validateContent(body.content);
      patch.content = body.content as string;
    }
    if (!invalid && body.summary !== undefined) {
      invalid = validateSummary(body.summary);
      patch.summary = body.summary as string | null;
    }
    if (!invalid && body.category !== undefined) {
      invalid = validateCategory(body.category);
      patch.category = typeof body.category === 'string' ? body.category.trim() : null;
    }
    if (!invalid && body.note_date !== undefined) {
      invalid = validateNoteDate(body.note_date);
      patch.note_date = body.note_date as string | null;
    }
    if (invalid) {
      res.status(invalid.status).json({ error: invalid.error });
      return;
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'no_changes' });
      return;
    }

    // The category is the owner's (their categories, their task filters).
    const ctx = await requireNoteAccess(req, res, patch.category !== undefined ? 'owner' : 'write');
    if (!ctx) return;

    const result = await noteService.updateNote(ctx.noteId, patch);
    if (!result) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = await requireNoteAccess(req, res, 'owner');
    if (!ctx) return;
    await noteService.deleteNote(ctx.noteId);
    res.json({ id: ctx.noteId });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createNoteTranscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { audio, mimeType, recordedAt, durationMs, segmentId } = (req.body ?? {}) as Record<
      string,
      unknown
    >;

    // Optional client id of the segment: a retried upload reuses it, so the
    // server returns the stored segment instead of appending a duplicate.
    if (segmentId !== undefined && (typeof segmentId !== 'string' || !UUID_PATTERN.test(segmentId))) {
      res.status(400).json({ error: 'invalid_segment_id' });
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
    if (audio.length > MAX_AUDIO_BASE64_LENGTH) {
      res.status(413).json({ error: 'audio_too_large' });
      return;
    }
    const buffer = Buffer.from(audio, 'base64');
    if (buffer.length === 0) {
      res.status(400).json({ error: 'invalid_audio' });
      return;
    }
    if (buffer.length > NOTE_AUDIO_MAX_BYTES) {
      res.status(413).json({ error: 'audio_too_large' });
      return;
    }

    const ctx = await requireNoteAccess(req, res, 'write');
    if (!ctx) return;

    // Wall-clock start of the segment as the browser saw it; never lose the
    // audio over a bad timestamp.
    const parsedRecordedAt = typeof recordedAt === 'string' ? new Date(recordedAt) : null;
    const recordedAtIso =
      parsedRecordedAt && !Number.isNaN(parsedRecordedAt.getTime())
        ? parsedRecordedAt.toISOString()
        : new Date().toISOString();
    const rawDuration = Number(durationMs);
    const duration = Number.isFinite(rawDuration)
      ? Math.min(Math.max(Math.round(rawDuration), 0), MAX_SEGMENT_DURATION_MS)
      : 0;

    let segment: noteService.NoteTranscriptSegment | null;
    try {
      segment = await noteService.transcribeNoteSegment(
        ctx.noteId,
        ctx.userId,
        {
          segmentId: typeof segmentId === 'string' ? segmentId.toLowerCase() : undefined,
          audio: buffer,
          mimeType,
          recordedAt: recordedAtIso,
          durationMs: duration,
        },
        telemetryFor(req),
      );
    } catch (error) {
      console.error('Note transcription failed:', error);
      res.status(502).json({ error: 'transcription_failed' });
      return;
    }

    if (!segment) {
      res.status(200).json({ segment: null });
      return;
    }
    res.status(201).json({ segment });
  } catch (error) {
    console.error('Error saving note transcription:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createNoteSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = await requireNoteAccess(req, res, 'write');
    if (!ctx) return;

    let result: Awaited<ReturnType<typeof noteService.generateNoteSummary>>;
    try {
      result = await noteService.generateNoteSummary(ctx.noteId, telemetryFor(req));
    } catch (error) {
      console.error('Note summary failed:', error);
      res.status(502).json({ error: 'summary_failed' });
      return;
    }

    if (result === 'empty') {
      res.status(422).json({ error: 'empty_note' });
      return;
    }
    if (!result) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('Error generating note summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** The summary's next steps → tasks of the caller (`201 { tasks }`, same order). */
export const createNoteTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const steps = readTaskItems((req.body ?? {}).items);
    if (!steps) {
      res.status(400).json({ error: 'invalid_items' });
      return;
    }

    const ctx = await requireNoteAccess(req, res, 'write');
    if (!ctx) return;

    const tasks = await noteService.createTasksFromNote(ctx.noteId, ctx.userId, steps, req.user?.email ?? '');
    if (!tasks) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(201).json({ tasks });
  } catch (error) {
    console.error('Error creating tasks from note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** Pins the note to the top of the caller's list, or unpins it: `{ pinned }` → `200 { pinned_at }`. */
export const pinNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const pinned = (req.body ?? {}).pinned;
    if (typeof pinned !== 'boolean') {
      res.status(400).json({ error: 'invalid_pinned' });
      return;
    }
    // Any reader may pin: the pin is theirs.
    const ctx = await requireNoteAccess(req, res, 'read');
    if (!ctx) return;
    const pinnedAt = await noteService.setNotePinned(ctx.noteId, ctx.userId, pinned);
    res.json({ pinned_at: pinnedAt });
  } catch (error) {
    console.error('Error pinning a note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * The user's answer to a next step a regeneration could not tell apart from a
 * step with a task: `{ decision: 'same' | 'distinct' }` → `200 { status, summary }`.
 */
export const reviewNoteStep = async (req: Request, res: Response): Promise<void> => {
  try {
    const stepId = req.params.stepId;
    const decision = (req.body ?? {}).decision;
    if (!isValidStepId(stepId) || (decision !== 'same' && decision !== 'distinct')) {
      res.status(400).json({ error: 'invalid_review' });
      return;
    }

    const ctx = await requireNoteAccess(req, res, 'write');
    if (!ctx) return;

    const result = await noteService.resolveStepReview(ctx.noteId, ctx.userId, stepId, decision);
    if (!result) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('Error reviewing a note step:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
