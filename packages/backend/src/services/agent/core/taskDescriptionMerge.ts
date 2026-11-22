/**
 * Safe merge rules when the AI agent updates a task description.
 *
 * Task descriptions may be a serialized ProseMirror doc with `_attachments`
 * carrying binary previews. The agent only sees extracted text — we must
 * preserve attachments at the code level even when the agent rewrites context.
 */

import { markdownToTiptapDoc } from '../../../utils/markdownToTiptapDoc';
import { hasDescriptionHistory, keepDescriptionHistory } from './descriptionHistory';
import { prepareDescriptionForStorage } from './prepareDescriptionForStorage';
import { parseTaskDescription } from './taskDescription';

function hasProtectedAttachments(raw: string | null | undefined): boolean {
  const { images, otherAttachmentLabels } = parseTaskDescription(raw);
  return images.length > 0 || otherAttachmentLabels.length > 0;
}

function extractAttachments(raw: string | null | undefined): unknown[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as { _attachments?: unknown[] };
    return Array.isArray(parsed._attachments) ? parsed._attachments : [];
  } catch {
    return [];
  }
}

export interface DescriptionMergeResult {
  /** Final value to persist, or `null` to clear the description field. */
  value: string | null;
  /** When true, skip updating the description column entirely. */
  skip: boolean;
  /** Why a clear was refused. */
  held?: 'attachments' | 'history';
  /** Lines the new text had left out, put back under `## Histórico`. */
  preserved?: string[];
}

export interface DescriptionMergeOptions {
  /**
   * The user asked for something to be removed or rewritten: the new text is
   * stored as sent. Otherwise nothing the description already says is lost
   * (see descriptionHistory.ts).
   */
  allowRemoval?: boolean;
}

/**
 * Apply an agent-provided description update.
 * - Replaces the text content with the agent's Markdown (rendered as structured nodes).
 * - Preserves `_attachments` always — agents cannot delete files.
 * - Blocks clearing when attachments exist.
 * - Keeps what the description already said, unless `allowRemoval`: lines the
 *   new text leaves out go to `## Histórico`, and a clear is refused.
 */
export function mergeAgentDescriptionUpdate(
  existingRaw: string | null | undefined,
  incomingRaw: unknown,
  timezone = 'America/Sao_Paulo',
  options: DescriptionMergeOptions = {},
): DescriptionMergeResult {
  if (incomingRaw === undefined) return { value: null, skip: true };

  if (incomingRaw === null) {
    if (hasProtectedAttachments(existingRaw)) {
      return { value: null, skip: true, held: 'attachments' };
    }
    if (!options.allowRemoval && hasDescriptionHistory(existingRaw)) {
      return { value: null, skip: true, held: 'history' };
    }
    return { value: null, skip: false };
  }

  const incoming = prepareDescriptionForStorage(String(incomingRaw).trim(), timezone);
  if (!incoming) return { value: null, skip: true };

  const attachments = extractAttachments(existingRaw);
  const incomingDoc = markdownToTiptapDoc(incoming);

  const merged: Record<string, unknown> = {
    type: 'doc',
    content: incomingDoc.content,
  };
  if (attachments.length > 0) merged._attachments = attachments;

  const value = JSON.stringify(merged);
  if (options.allowRemoval) return { value, skip: false };
  const kept = keepDescriptionHistory(existingRaw, value);
  return { value: kept.value, skip: false, preserved: kept.preserved };
}
