import { Request, Response, NextFunction } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';

interface UserWithSubscription {
  id: string;
  subscription_status: string;
  trial_ends_at: string | null;
}

function isTrialStillActive(trialEndsAtIso: string | null): boolean {
  if (!trialEndsAtIso) return false;
  const trialEnd = new Date(trialEndsAtIso);
  if (Number.isNaN(trialEnd.getTime())) return false;
  return trialEnd.getTime() > Date.now();
}

/**
 * Middleware to require an active subscription (trialing or active)
 * Use this middleware on routes that require a paid subscription
 */
export async function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const user = await getUserSubscriptionStatus(userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const isActive =
      user.subscription_status === 'active' ||
      (user.subscription_status === 'trialing' &&
        isTrialStillActive(user.trial_ends_at));

    if (!isActive) {
      res.status(403).json({
        error: 'subscription_required',
        message: 'An active subscription is required to access this resource',
        subscriptionStatus: user.subscription_status,
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ error: 'Failed to verify subscription status' });
  }
}

/**
 * Middleware to require a subscription (any status except 'none')
 * Use this to check if user has ever subscribed
 */
export async function requireSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const user = await getUserSubscriptionStatus(userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const hasValidTrial =
      user.subscription_status === 'trialing' &&
      isTrialStillActive(user.trial_ends_at);

    const hasSubscription =
      user.subscription_status !== 'none' &&
      (user.subscription_status !== 'trialing' || hasValidTrial);

    if (!hasSubscription) {
      res.status(403).json({
        error: 'subscription_required',
        message: 'A subscription is required to access this resource',
        subscriptionStatus: user.subscription_status,
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ error: 'Failed to verify subscription status' });
  }
}

/**
 * Helper function to get user's subscription status
 */
async function getUserSubscriptionStatus(
  userId: string
): Promise<UserWithSubscription | null> {
  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, subscription_status, trial_ends_at FROM users WHERE id = $1',
        [userId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    const result = await db.get<UserWithSubscription>(
      'SELECT id, subscription_status, trial_ends_at FROM users WHERE id = ?',
      [userId]
    );
    return result ?? null;
  }
}
