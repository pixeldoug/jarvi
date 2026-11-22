/**
 * Notas models as /api/notes returns them. Mirrors packages/web/src/lib/notesApi.ts.
 * `content` and `summary` are TipTap doc JSON strings (legacy rows may hold plain text).
 */

export interface NoteListItem {
  id: string;
  /** '' when untitled (shown as `notes:untitled`, "Nova nota" / "New note") */
  title: string;
  /** '' when empty */
  preview: string;
  has_summary: boolean;
  has_transcript: boolean;
  category: string | null;
  /** User-chosen day, `YYYY-MM-DD`; null = the creation day */
  note_date: string | null;
  /** The user removed the date (the creation day still orders the list) */
  date_removed: boolean;
  /** false for notes shared with the user */
  is_owner: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteTranscriptSegment {
  id: string;
  seq: number;
  text: string;
  /** Wall-clock start of the audio segment (client-provided) */
  recorded_at: string;
  duration_ms: number;
  created_at: string;
}

export interface NoteDetail {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  summary_updated_at: string | null;
  /** notesFingerprint of the notes the summary came from (null: unknown) */
  summary_notes_fingerprint: string | null;
  pinned_at: string | null;
  category: string | null;
  note_date: string | null;
  date_removed: boolean;
  created_at: string;
  updated_at: string;
  access_level: 'owner' | 'write' | 'read';
  /** Ordered by recorded_at, seq */
  segments: NoteTranscriptSegment[];
}

export interface NotePatch {
  title?: string;
  content?: string;
  summary?: string | null;
}

export interface NotePatchResponse {
  id: string;
  title: string;
  preview: string;
  category: string | null;
  note_date: string | null;
  date_removed: boolean;
  updated_at: string;
  summary_updated_at: string | null;
}

export interface TranscriptionUpload {
  /** Client uuid of the segment, the same on every retry (the server dedupes). */
  segmentId: string;
  /** Base64 audio, without the `data:` prefix */
  audio: string;
  mimeType: string;
  /** ISO start of the segment */
  recordedAt: string;
  durationMs: number;
}

export interface NoteSummaryResponse {
  summary: string;
  summary_updated_at: string;
  summary_notes_fingerprint: string;
  title: string;
  preview: string;
}

/**
 * One requested next step, in request order: `created` now, `linked` (tied to
 * the task the user already had, as they chose), `existing` (it already had a
 * task), `needs_review` (may repeat a step with a task) or `stale` (not in the
 * saved summary anymore, or the chosen task is gone). No task for the last two.
 */
export interface NoteCreatedTask {
  step_id: string;
  status: 'created' | 'linked' | 'existing' | 'needs_review' | 'stale';
  id: string | null;
  title: string;
}

/** An open task the user already has that may be one of the next steps sent. */
export interface NoteTaskMatch {
  /** Position of the step's text in the request */
  index: number;
  task: {
    id: string;
    title: string;
    /** `YYYY-MM-DD` */
    due_date: string | null;
    /** `HH:MM` */
    time: string | null;
    category: string | null;
  };
}

/** The user's answer to "is this next step the one that already has a task?" */
export type NoteStepDecision = 'same' | 'distinct';

export interface NoteStepReviewResponse {
  /** `not_under_review`: answered already (another device) or gone */
  status: 'resolved' | 'not_under_review';
  summary: string | null;
}

/** Items per createTasks request (server limit). */
export const NOTE_TASKS_MAX_ITEMS = 30;
/** Characters per item text (server limit). */
export const NOTE_TASK_TEXT_MAX_LENGTH = 500;
