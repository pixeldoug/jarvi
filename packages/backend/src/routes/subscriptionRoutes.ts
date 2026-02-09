import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createCustomerWithSubscription,
  cancelSubscription,
  getSubscriptionStatus,
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
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({
      error: 'Failed to get subscription status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
