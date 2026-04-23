import { Request, Response, NextFunction } from 'express';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { syncSubscriptionFromStripe } from '../services/stripeService';

interface UserWithSubscription {
  id: string;
  subscription_status: string;
  trial_ends_at: string | null;
  stripe_subscription_id: string | null;
}

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

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

    let user = await getUserSubscriptionStatus(userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    let isActive = computeIsActive(user);

    // Auto-heal: if DB says not-active but we have a Stripe subscription ID, our DB
    // may be stale (e.g. webhooks arrived out of order or an invoice event was missed).
    // Pull live state from Stripe and re-check before rejecting the request.
    if (!isActive && user.stripe_subscription_id) {
      const syncedStatus = await syncSubscriptionFromStripe(
        userId,
        user.stripe_subscription_id
      );
      if (syncedStatus && ACTIVE_STATUSES.has(syncedStatus)) {
        user = await getUserSubscriptionStatus(userId);
        if (user) {
          isActive = computeIsActive(user);
        }
      }
    }

    if (!isActive) {
      res.status(403).json({
        error: 'subscription_required',
        message: 'An active subscription is required to access this resource',
        subscriptionStatus: user?.subscription_status,
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ error: 'Failed to verify subscription status' });
  }
}

function computeIsActive(user: UserWithSubscription): boolean {
  return (
    user.subscription_status === 'active' ||
    (user.subscription_status === 'trialing' &&
      isTrialStillActive(user.trial_ends_at))
  );
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

    let user = await getUserSubscriptionStatus(userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    let hasSubscription = computeHasSubscription(user);

    // Same auto-heal path as requireActiveSubscription (see rationale there).
    if (!hasSubscription && user.stripe_subscription_id) {
      const syncedStatus = await syncSubscriptionFromStripe(
        userId,
        user.stripe_subscription_id
      );
      if (syncedStatus) {
        user = await getUserSubscriptionStatus(userId);
        if (user) {
          hasSubscription = computeHasSubscription(user);
        }
      }
    }

    if (!hasSubscription) {
      res.status(403).json({
        error: 'subscription_required',
        message: 'A subscription is required to access this resource',
        subscriptionStatus: user?.subscription_status,
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ error: 'Failed to verify subscription status' });
  }
}

function computeHasSubscription(user: UserWithSubscription): boolean {
  const hasValidTrial =
    user.subscription_status === 'trialing' &&
    isTrialStillActive(user.trial_ends_at);

  return (
    user.subscription_status !== 'none' &&
    (user.subscription_status !== 'trialing' || hasValidTrial)
  );
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
        'SELECT id, subscription_status, trial_ends_at, stripe_subscription_id FROM users WHERE id = $1',
        [userId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    const result = await db.get<UserWithSubscription>(
      'SELECT id, subscription_status, trial_ends_at, stripe_subscription_id FROM users WHERE id = ?',
      [userId]
    );
    return result ?? null;
  }
}
