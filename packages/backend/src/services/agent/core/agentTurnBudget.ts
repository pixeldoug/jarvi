/**
 * Soft monthly cap on premium-model agent turns.
 *
 * Counts only turns that actually called the configured AGENT_MODEL. Fast-path
 * chips and the fallback model do not increment. Eval users are skipped so
 * the suite cannot burn the cap (or get silently downgraded).
 */

import { getDatabase, getPool, isPostgreSQL } from '../../../database';
import { isEvalAnalyticsDistinctId } from '../../posthogService';
import {
  getAgentFallbackModel,
  getConfiguredAgentModel,
  getPremiumTurnLimit,
} from './models';

export function currentUtcMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function skipBudget(userId: string, email?: string): boolean {
  if (userId === 'eval-user') return true;
  if (email && isEvalAnalyticsDistinctId(email)) return true;
  return false;
}

export async function getPremiumTurnsThisMonth(userId: string): Promise<number> {
  const month = currentUtcMonth();
  try {
    if (isPostgreSQL()) {
      const result = await getPool().query<{ premium_turns: number | string }>(
        'SELECT premium_turns FROM agent_month_usage WHERE user_id = $1 AND month = $2',
        [userId, month],
      );
      return Number(result.rows[0]?.premium_turns ?? 0);
    }
    const row = await getDatabase().get<{ premium_turns: number }>(
      'SELECT premium_turns FROM agent_month_usage WHERE user_id = ? AND month = ?',
      [userId, month],
    );
    return Number(row?.premium_turns ?? 0);
  } catch (err) {
    console.warn('[agent] failed to read monthly usage, allowing premium:', err);
    return 0;
  }
}

export async function incrementPremiumTurns(userId: string): Promise<void> {
  const month = currentUtcMonth();
  const now = new Date().toISOString();
  try {
    if (isPostgreSQL()) {
      await getPool().query(
        `INSERT INTO agent_month_usage (user_id, month, premium_turns, updated_at)
         VALUES ($1, $2, 1, $3)
         ON CONFLICT (user_id, month)
         DO UPDATE SET premium_turns = agent_month_usage.premium_turns + 1, updated_at = $3`,
        [userId, month, now],
      );
      return;
    }
    await getDatabase().run(
      `INSERT INTO agent_month_usage (user_id, month, premium_turns, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT (user_id, month)
       DO UPDATE SET premium_turns = premium_turns + 1, updated_at = excluded.updated_at`,
      [userId, month, now],
    );
  } catch (err) {
    console.warn('[agent] failed to increment monthly usage:', err);
  }
}

export async function chooseAgentModelForUser(input: {
  userId: string;
  email?: string;
}): Promise<{ model: string; capped: boolean }> {
  const premium = getConfiguredAgentModel();
  const fallback = getAgentFallbackModel();
  const limit = getPremiumTurnLimit();
  if (!limit || premium === fallback || skipBudget(input.userId, input.email)) {
    return { model: premium, capped: false };
  }

  const used = await getPremiumTurnsThisMonth(input.userId);
  if (used >= limit) {
    console.warn(
      `[agent] premium cap reached userId=${input.userId} used=${used} limit=${limit} fallback=${fallback}`,
    );
    return { model: fallback, capped: true };
  }
  return { model: premium, capped: false };
}

export async function notePremiumTurn(input: {
  userId: string;
  email?: string;
  model: string;
  apiCalls: number;
}): Promise<void> {
  if (input.apiCalls < 1) return;
  if (skipBudget(input.userId, input.email)) return;
  if (input.model !== getConfiguredAgentModel()) return;
  await incrementPremiumTurns(input.userId);
}
