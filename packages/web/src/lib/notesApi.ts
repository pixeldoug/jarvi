/**
 * Notes API — typed fetchers for `/api/notes` (mirrors the backend contract).
 *
 * `content` and `summary` are TipTap doc JSON strings (the format
 * RichTextEditor emits). Legacy rows may hold plain text in `content`.
 */

import { apiClient } from './apiClient';

export type NoteAccessLevel = 'owner' | 'write' | 'read';

export interface NoteListItem {
  id: string;
  /** '' when untitled (UI shows "Nova nota") */
  title: string;
  /** '' when empty */
  preview: string;
  has_summary: boolean;
  has_transcript: boolean;
  /** Owner's category name (same values as a task's category) */
  category: string | null;
  /** User-chosen day, `YYYY-MM-DD`; null = the creation day */
  note_date: string | null;
  /** The user removed the date: the note shows none (the creation day still orders the list) */
  date_removed: boolean;
  /** false for notes shared with the user */
  is_owner: boolean;
  /** When the user pinned it to the top of the list (null: not pinned) */
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
  /** notesFingerprint of the notes the summary came from (null: unknown, older summary) */
  summary_notes_fingerprint: string | null;
  /** When the user pinned it to the top of the list (null: not pinned) */
  pinned_at: string | null;
  category: string | null;
  note_date: string | null;
  /** The user removed the date: the note shows none */
  date_removed: boolean;
  created_at: string;
  updated_at: string;
  access_level: NoteAccessLevel;
  /** Ordered by recorded_at ASC, seq ASC */
  segments: NoteTranscriptSegment[];
}

export interface NotePatch {
  title?: string;
  content?: string;
  summary?: string | null;
  /** Owner only */
  category?: string | null;
  /** A day, or `null` to remove the date */
  note_date?: string | null;
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
  /**
   * Client id of the segment (uuid), the same on every retry: the server
   * returns the stored segment instead of appending a duplicate.
   */
  segmentId?: string;
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

/** A task created from one of the summary's next steps. */
/**
 * One requested next step, in request order: `created` now, `existing` (the
 * step already had a task), `needs_review` (may repeat a step with a task;
 * the user has not answered) or `stale` (not in the saved summary anymore).
 * No task for the last two (`id` null).
 */
export interface NoteCreatedTask {
  step_id: string;
  status: 'created' | 'existing' | 'needs_review' | 'stale';
  id: string | null;
  title: string;
  /** `YYYY-MM-DD` when the text named a concrete day */
  due_date: string | null;
  /** `HH:MM` */
  time: string | null;
  category: string | null;
}

/** The user's answer to "is this next step the one that already has a task?" */
export type NoteStepDecision = 'same' | 'distinct';

export interface NoteStepReviewResponse {
  /** `not_under_review`: answered already (another tab) or gone */
  status: 'resolved' | 'not_under_review';
  /** The saved summary after the answer */
  summary: string | null;
}

/** Items per `createTasksFromNote` request (server limit). */
export const NOTE_TASKS_MAX_ITEMS = 30;
/** Characters per item text (server limit). */
export const NOTE_TASK_TEXT_MAX_LENGTH = 500;

export const notesApi = {
  list(): Promise<NoteListItem[]> {
    return apiClient.get<NoteListItem[]>('/api/notes');
  },

  get(id: string): Promise<NoteDetail> {
    return apiClient.get<NoteDetail>(`/api/notes/${encodeURIComponent(id)}`);
  },

  create(body: { title?: string; content?: string } = {}): Promise<NoteDetail> {
    return apiClient.post<NoteDetail>('/api/notes', body);
  },

  update(id: string, patch: NotePatch): Promise<NotePatchResponse> {
    return apiClient.patch<NotePatchResponse>(`/api/notes/${encodeURIComponent(id)}`, patch);
  },

  remove(id: string): Promise<{ id: string }> {
    return apiClient.delete<{ id: string }>(`/api/notes/${encodeURIComponent(id)}`);
  },

  /** `segment` is null when the audio contained no speech */
  transcribe(id: string, body: TranscriptionUpload): Promise<{ segment: NoteTranscriptSegment | null }> {
    return apiClient.post<{ segment: NoteTranscriptSegment | null }>(
      `/api/notes/${encodeURIComponent(id)}/transcriptions`,
      body,
    );
  },

  generateSummary(id: string): Promise<NoteSummaryResponse> {
    return apiClient.post<NoteSummaryResponse>(`/api/notes/${encodeURIComponent(id)}/summary`, {});
  },

  /**
   * Creates one task per item (1..NOTE_TASKS_MAX_ITEMS) for the current user.
   * `tasks` come back in the order of `items`.
   */
  createTasksFromNote(
    id: string,
    items: Array<{ text: string; step_id: string }>,
  ): Promise<{ tasks: NoteCreatedTask[] }> {
    return apiClient.post<{ tasks: NoteCreatedTask[] }>(
      `/api/notes/${encodeURIComponent(id)}/tasks`,
      { items },
    );
  },

  /** Pins the note to the top of the user's list (per user), or unpins it. */
  setPinned(id: string, pinned: boolean): Promise<{ pinned_at: string | null }> {
    return apiClient.put<{ pinned_at: string | null }>(`/api/notes/${encodeURIComponent(id)}/pin`, { pinned });
  },

  reviewStep(id: string, stepId: string, decision: NoteStepDecision): Promise<NoteStepReviewResponse> {
    return apiClient.post<NoteStepReviewResponse>(
      `/api/notes/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}/review`,
      { decision },
    );
  },
};
