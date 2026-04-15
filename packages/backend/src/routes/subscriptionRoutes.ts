import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createCustomerWithSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  extendTrial,
  createPortalSession,
} from '../services/stripeService';

const router = Router();

/**
 * POST /api/subscriptions/create
 * Create a new subscription and attach a payment method.
 *
 * If the user is currently in an internal trial, the trial end is mirrored into Stripe
 * (so we don't grant extra trial time).
 */
router.post('/create', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { paymentMethodId } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!paymentMethodId) {
      res.status(400).json({ error: 'Payment method ID is required' });
      return;
    }

    const result = await createCustomerWithSubscription({
      userId: user.id,
      email: user.email,
      name: user.name,
      paymentMethodId,
    });

    res.status(201).json({
      message: 'Subscription created successfully',
      subscription: {
        id: result.subscriptionId,
        status: result.status,
        trialEndsAt: result.trialEndsAt?.toISOString() || null,
      },
      clientSecret: result.clientSecret ?? null,
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({
      error: 'Failed to create subscription',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/subscriptions/cancel
 * Cancel the user's subscription
 */
router.post('/cancel', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    await cancelSubscription(user.id);

    res.json({
      message: 'Subscription cancelled successfully',
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      error: 'Failed to cancel subscription',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/subscriptions/status
 * Get the user's current subscription status
 */
router.get('/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const status = await getSubscriptionStatus(user.id);

    res.json({
      status: status.status,
      trialEndsAt: status.trialEndsAt?.toISOString() || null,
      currentPeriodEnd: status.currentPeriodEnd?.toISOString() || null,
      isActive: ['trialing', 'active'].includes(status.status),
      trialExtended: status.trialExtended,
      planType: status.planType,
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({
      error: 'Failed to get subscription status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/subscriptions/extend-trial
 * Extend the user's trial by 1 day (only once per user).
 */
router.post('/extend-trial', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const result = await extendTrial(user.id);

    if (!result.extended) {
      res.status(409).json({
        error: 'trial_already_extended',
        message: 'Trial extension has already been used',
      });
      return;
    }

    res.json({ message: 'Trial extended by 1 day' });
  } catch (error) {
    console.error('Extend trial error:', error);
    res.status(500).json({
      error: 'Failed to extend trial',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/subscriptions/portal
 * Create a Stripe Billing Portal session for the authenticated user.
 */
router.post('/portal', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const returnUrl = (req.body.returnUrl as string) || process.env.APP_URL || 'http://localhost:3000';
    const { url } = await createPortalSession(user.id, returnUrl);

    res.json({ url });
  } catch (error) {
    console.error('Create portal session error:', error);
    res.status(500).json({
      error: 'Failed to create portal session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
