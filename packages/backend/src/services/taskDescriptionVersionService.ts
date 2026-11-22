/**
 * Versions of a task description — so a rewrite by the AI can be undone.
 *
 * Before the AI changes a description (the agent on web / WhatsApp, an MCP
 * client), the text that was there is kept here. The user can read the kept
 * versions in the task and restore one; a restore keeps the text it replaces
 * too (even "no text"), so it can be undone the same way. What the user types
 * by hand is not versioned: the editor autosaves, and every pause would become
 * a version.
 *
 * A version is the stored doc WITHOUT its `_attachments` (files are base64,
 * megabytes each, and the AI can never remove them): a restore brings the
 * text back and leaves the task's current files where they are.
 *
 * API types are mirrored by packages/web/src/lib/taskDescriptionVersionsApi.ts.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { markdownToTiptapDoc } from '../utils/markdownToTiptapDoc';
import { tiptapDocToMarkdown, tiptapDocToPlainText } from '../utils/tiptapDoc';

/** Who replaced the text this version holds. */
export type TaskDescriptionVersionSource = 'agent_web' | 'agent_whatsapp' | 'mcp' | 'restore';

export interface TaskDescriptionVersion {
  id: string;
  /** When this text was replaced (ISO). */
  created_at: string;
  source: TaskDescriptionVersionSource;
  /** The description as it was: a serialized doc, without files. */
  description: string;
  /** Its first words, for the list. */
  preview: string;
  /**
   * What tells this version from the text that replaced it: a line it had
   * that is gone there (`had`), else a line that only came after (`lacked`).
   * null when the two say the same lines.
   */
  change: { kind: 'had' | 'lacked'; line: string; more: number } | null;
}

/** Versions kept per task: the oldest go when a new one is added. */
export const TASK_DESCRIPTION_VERSIONS_MAX = 20;
const PREVIEW_MAX_CHARS = 180;
const CHANGE_LINE_MAX_CHARS = 140;
/** A description that says nothing, as the editor stores it. */
const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
/** Tries of a restore when the description is saved elsewhere while it runs. */
const RESTORE_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// SQL helpers — `$N` placeholders, in order, on both drivers
// ---------------------------------------------------------------------------

function sql(text: string): string {
  return isPostgreSQL() ? text : text.replace(/\$\d+/g, '?');
}

async function many<T>(text: string, params: unknown[]): Promise<T[]> {
  if (isPostgreSQL()) return (await getPool().query(text, params)).rows as T[];
  return (await getDatabase().all<T[]>(sql(text), params)) ?? [];
}

/** Runs a write. Resolves to how many rows it changed. */
async function exec(text: string, params: unknown[]): Promise<number> {
  if (isPostgreSQL()) return (await getPool().query(text, params)).rowCount ?? 0;
  return (await getDatabase().run(sql(text), params)).changes ?? 0;
}

/** `column = $n`, true for two NULLs as well. */
function sameAs(column: string, placeholder: string): string {
  return isPostgreSQL() ? `${column} IS NOT DISTINCT FROM ${placeholder}` : `${column} IS ${placeholder}`;
}

/** PG returns `Date` for TIMESTAMP columns holding our UTC ISO writes (see chatHistoryService). */
function toIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(
      Date.UTC(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        value.getHours(),
        value.getMinutes(),
        value.getSeconds(),
        value.getMilliseconds(),
      ),
    ).toISOString();
  }
  return String(value ?? '');
}

// ---------------------------------------------------------------------------
// The description, with and without its files
// ---------------------------------------------------------------------------

interface StoredDoc {
  type: 'doc';
  content?: unknown[];
  _attachments?: unknown[];
  [key: string]: unknown;
}

function parseDoc(raw: string | null | undefined): StoredDoc | null {
  const trimmed = raw?.trim();
  if (!trimmed?.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && parsed.type === 'doc' ? (parsed as StoredDoc) : null;
  } catch {
    return null;
  }
}

/** The text of a stored description, as a doc without files ('' when it says nothing). */
function textOnly(raw: string | null | undefined): string {
  if (!tiptapDocToPlainText(raw)) return '';
  const doc = parseDoc(raw);
  if (!doc) return JSON.stringify(markdownToTiptapDoc(raw!.trim()));
  const { _attachments: _files, ...text } = doc;
  return JSON.stringify(text);
}

/** A version's text with the files the task has now. */
function withAttachmentsOf(versionText: string, currentRaw: string | null | undefined): string {
  const attachments = parseDoc(currentRaw)?._attachments;
  if (!Array.isArray(attachments) || attachments.length === 0) return versionText;
  return JSON.stringify({ ...(parseDoc(versionText) ?? markdownToTiptapDoc(versionText)), _attachments: attachments });
}

/** The description's lines, without list / heading / checkbox markers. */
function linesOf(raw: string | null | undefined): string[] {
  return tiptapDocToMarkdown(raw)
    .split('\n')
    .map((line) => line.replace(/^\s*(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/, '').trim())
    .filter(Boolean);
}

function changeBetween(version: string, replacedBy: string | null | undefined): TaskDescriptionVersion['change'] {
  const before = linesOf(version);
  const after = linesOf(replacedBy);
  const afterSet = new Set(after);
  const beforeSet = new Set(before);
  const had = before.filter((line) => !afterSet.has(line));
  const lacked = after.filter((line) => !beforeSet.has(line));
  const [kind, lines] = had.length > 0 ? (['had', had] as const) : (['lacked', lacked] as const);
  if (lines.length === 0) return null;
  const line = lines[0].length > CHANGE_LINE_MAX_CHARS ? `${lines[0].slice(0, CHANGE_LINE_MAX_CHARS - 1).trimEnd()}…` : lines[0];
  return { kind, line, more: lines.length - 1 };
}

// ---------------------------------------------------------------------------
// Keep / list / restore
// ---------------------------------------------------------------------------

interface VersionRow {
  id: string;
  description: string;
  source: string;
  created_at: unknown;
}

/**
 * Keeps `previous` (the description about to be replaced by `next`) as a
 * version of the task. Nothing is kept when the text did not change, or when
 * there was no text (unless `keepEmpty`: a restore over an empty description
 * keeps "it was empty", so it can be undone like any other). Returns the
 * version's id, or null. Never throws: a failed snapshot must not fail the
 * write it protects.
 */
export async function keepTaskDescriptionVersion(input: {
  taskId: string;
  userId: string;
  previous: string | null | undefined;
  next: string | null | undefined;
  source: TaskDescriptionVersionSource;
  keepEmpty?: boolean;
}): Promise<string | null> {
  try {
    const previous = textOnly(input.previous) || (input.keepEmpty ? EMPTY_DOC : '');
    if (!previous || previous === (textOnly(input.next) || EMPTY_DOC)) return null;

    // The same text kept before (a restore undone, then redone): one row, now the newest.
    await exec('DELETE FROM task_description_versions WHERE task_id = $1 AND description = $2', [
      input.taskId,
      previous,
    ]);
    const id = uuidv4();
    await exec(
      `INSERT INTO task_description_versions (id, task_id, user_id, description, source, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, input.taskId, input.userId, previous, input.source, new Date().toISOString()],
    );
    // Over the cap: the oldest go.
    await exec(
      `DELETE FROM task_description_versions
       WHERE task_id = $1 AND id NOT IN (
         SELECT id FROM task_description_versions WHERE task_id = $2 ORDER BY created_at DESC, id DESC LIMIT ${TASK_DESCRIPTION_VERSIONS_MAX}
       )`,
      [input.taskId, input.taskId],
    );
    return id;
  } catch (err) {
    console.error('[task-versions] failed to keep a description version:', err);
    return null;
  }
}

async function ownedTask(taskId: string, userId: string): Promise<{ id: string; description: string | null } | null> {
  const [task] = await many<{ id: string; description: string | null }>(
    'SELECT id, description FROM tasks WHERE id = $1 AND user_id = $2',
    [taskId, userId],
  );
  return task ?? null;
}

/** The task's kept versions, newest first. null: not the user's task. */
export async function listTaskDescriptionVersions(
  taskId: string,
  userId: string,
): Promise<TaskDescriptionVersion[] | null> {
  const task = await ownedTask(taskId, userId);
  if (!task) return null;
  const rows = await many<VersionRow>(
    `SELECT id, description, source, created_at FROM task_description_versions
     WHERE task_id = $1 AND user_id = $2 ORDER BY created_at DESC, id DESC`,
    [taskId, userId],
  );
  return rows.map((row, index) => ({
    id: row.id,
    created_at: toIso(row.created_at),
    source: row.source as TaskDescriptionVersionSource,
    description: row.description,
    preview: tiptapDocToPlainText(row.description, PREVIEW_MAX_CHARS),
    // Replaced by the next newer version's text, or by what the task says now.
    change: changeBetween(row.description, index === 0 ? task.description : rows[index - 1].description),
  }));
}

export interface RestoredTaskDescription {
  /** The task row after the restore. */
  task: Record<string, unknown>;
  /** The version that now holds the text the restore replaced (to undo it), if it had any. */
  replaced_version_id: string | null;
}

/**
 * Puts a kept version back as the task's description, with the files the task
 * has now. The text it replaces is kept as a version first. null: the task or
 * the version is not the user's.
 *
 * The description is only replaced while it is still the one that was read
 * and kept: if it was saved in between (another tab, the AI), the restore
 * starts over from that newer one, so its text is kept and its files stay.
 */
export async function restoreTaskDescriptionVersion(
  taskId: string,
  versionId: string,
  userId: string,
): Promise<RestoredTaskDescription | null> {
  for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
    const task = await ownedTask(taskId, userId);
    if (!task) return null;
    const [version] = await many<VersionRow>(
      'SELECT id, description FROM task_description_versions WHERE id = $1 AND task_id = $2 AND user_id = $3',
      [versionId, taskId, userId],
    );
    if (!version) return null;

    const restored = withAttachmentsOf(version.description, task.description);
    const replacedVersionId = await keepTaskDescriptionVersion({
      taskId,
      userId,
      previous: task.description,
      next: restored,
      source: 'restore',
      keepEmpty: true,
    });
    const replaced = await exec(
      `UPDATE tasks SET description = $1, updated_at = $2
       WHERE id = $3 AND user_id = $4 AND ${sameAs('description', '$5')}`,
      [restored, new Date().toISOString(), taskId, userId, task.description],
    );
    if (replaced === 0) continue;

    // Its text is the description again: it is no longer a "previous" version.
    await exec('DELETE FROM task_description_versions WHERE id = $1', [versionId]);
    const [row] = await many<Record<string, unknown>>('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
    return { task: row, replaced_version_id: replacedVersionId };
  }
  throw new Error(`task ${taskId}: the description kept changing while a version was being restored`);
}
