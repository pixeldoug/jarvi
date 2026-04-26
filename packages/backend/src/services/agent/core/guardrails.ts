/**
 * Cross-channel safety nets:
 *
 * - Anti-hallucination: detect "I created/updated the task" claims that
 *   weren't backed by an actual tool call, and force a retry.
 * - Dedup: short-window check that prevents identical-titled task suggestions
 *   from being inserted twice (e.g. when the model double-fires create_task).
 */

import { getDatabase, getPool, isPostgreSQL } from '../../../database';
import { CREATION_TOOL_NAMES, UPDATE_TOOL_NAMES } from './tools';
import type { ChannelProfile, ToolName } from './types';

const DEDUP_WINDOW_SECONDS = 120;

/**
 * Heuristic: matches assistant text that confirms a creation/edit. Any of these
 * phrases without a matching tool call is treated as hallucination.
 */
export const CREATION_CLAIM_REGEX =
  /(^|\s)(➕|📋|sugerida\b|sugeri\b|criada\b|criei\b|anotei\b|agendei\b|registrei\b)/i;

export const UPDATE_CLAIM_REGEX =
  /\b(atualizei|alterei|ajustei|corrigi|mudei|deixei|ficou com|ficou para|ficou pra|defini|marquei|coloquei|salvei|adicionei)\b/i;

export function shouldRetryWithForcedTool(
  responseText: string,
  toolCallNames: string[],
): boolean {
  const claimedCreation = CREATION_CLAIM_REGEX.test(responseText);
  const calledCreationTool = toolCallNames.some((name) =>
    CREATION_TOOL_NAMES.has(name as ToolName),
  );
  const claimedUpdate = UPDATE_CLAIM_REGEX.test(responseText);
  const calledUpdateTool = toolCallNames.some((name) =>
    UPDATE_TOOL_NAMES.has(name as ToolName),
  );
  return (claimedCreation && !calledCreationTool) || (claimedUpdate && !calledUpdateTool);
}

/**
 * Find an identical-titled task created within the dedup window.
 *
 * For WhatsApp (`pending_tasks`) we look at status='awaiting_confirmation' so
 * already-rejected suggestions don't suppress legitimate retries.
 * For web (`tasks`) we look at non-completed tasks.
 */
export async function findRecentDuplicateTitle(
  userId: string,
  title: string,
  profile: ChannelProfile,
): Promise<string | null> {
  if (!profile.enableDedup || !title.trim()) return null;

  const cutoff = new Date(Date.now() - DEDUP_WINDOW_SECONDS * 1000).toISOString();

  if (profile.taskCreationTarget === 'pending_tasks') {
    if (isPostgreSQL()) {
      const { rows } = await getPool().query<{ id: string }>(
        `SELECT id FROM pending_tasks
         WHERE user_id = $1
           AND status = 'awaiting_confirmation'
           AND LOWER(suggested_title) = LOWER($2)
           AND created_at >= $3
         ORDER BY created_at DESC LIMIT 1`,
        [userId, title, cutoff],
      );
      return rows[0]?.id ?? null;
    }
    const row = await getDatabase().get<{ id: string }>(
      `SELECT id FROM pending_tasks
       WHERE user_id = ?
         AND status = 'awaiting_confirmation'
         AND LOWER(suggested_title) = LOWER(?)
         AND created_at >= ?
       ORDER BY created_at DESC LIMIT 1`,
      [userId, title, cutoff],
    );
    return row?.id ?? null;
  }

  // taskCreationTarget === 'tasks' (web)
  if (isPostgreSQL()) {
    const { rows } = await getPool().query<{ id: string }>(
      `SELECT id FROM tasks
       WHERE user_id = $1
         AND completed = FALSE
         AND LOWER(title) = LOWER($2)
         AND created_at >= $3
       ORDER BY created_at DESC LIMIT 1`,
      [userId, title, cutoff],
    );
    return rows[0]?.id ?? null;
  }
  const row = await getDatabase().get<{ id: string }>(
    `SELECT id FROM tasks
     WHERE user_id = ?
       AND completed = 0
       AND LOWER(title) = LOWER(?)
       AND created_at >= ?
     ORDER BY created_at DESC LIMIT 1`,
    [userId, title, cutoff],
  );
  return row?.id ?? null;
}
