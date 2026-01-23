import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import {
  verifyWebhookSignature,
  updateUserSubscription,
  getUserByStripeCustomerId,
} from '../services/stripeService';

const router = Router();

/**
 * POST /webhooks/stripe
 * Handle Stripe webhook events
 * NOTE: This route must use express.raw() middleware, not express.json()
 */
router.post('/stripe', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'];

  if (!signature || typeof signature !== 'string') {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  let event: Stripe.Event;

  try {
    event = verifyWebhookSignature(req.body, signature);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    res.status(400).json({
      error: 'Webhook signature verification failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return;
  }

  console.log(`📩 Received Stripe webhook: ${event.type}`);

  try {
    switch (event.type) {
      case 'customer.subscription.trial_will_end': {
        // Trial will end in 3 days - send notification to user
        const subscription = event.data.object as Stripe.Subscription;
        await handleTrialWillEnd(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        // Payment successful - update subscription status
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        // Payment failed - notify user and update status
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      case 'customer.subscription.updated': {
        // Subscription updated - sync status
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        // Subscription cancelled/deleted
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      error: 'Error processing webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Handle trial_will_end event - 3 days before trial expires
 */
async function handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;
  const user = await getUserByStripeCustomerId(customerId);

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  console.log(`⏰ Trial ending soon for user ${user.email}`);

  // TODO: Implement email notification
  // await sendEmail({
  //   to: user.email,
  //   subject: 'Your Jarvi trial ends in 3 days',
  //   template: 'trial-ending',
  //   data: {
  //     trialEndDate: new Date(subscription.trial_end! * 1000),
  //   },
  // });

  // For now, just log the notification
  console.log(`📧 Would send trial ending email to ${user.email}`);
  console.log(`   Trial ends: ${new Date(subscription.trial_end! * 1000).toISOString()}`);
}

/**
 * Handle payment_succeeded event
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  const user = await getUserByStripeCustomerId(customerId);

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  console.log(`💰 Payment succeeded for user ${user.email}`);

  // Update subscription status to active
  await updateUserSubscription(user.id, {
    subscriptionStatus: 'active',
  });

  // TODO: Send payment confirmation email
  console.log(`📧 Would send payment confirmation email to ${user.email}`);
}

/**
 * Handle payment_failed event
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  const user = await getUserByStripeCustomerId(customerId);

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  console.log(`❌ Payment failed for user ${user.email}`);

  // Update subscription status to past_due
  await updateUserSubscription(user.id, {
    subscriptionStatus: 'past_due',
  });

  // TODO: Send payment failed email
  console.log(`📧 Would send payment failed email to ${user.email}`);
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;
  const user = await getUserByStripeCustomerId(customerId);

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  console.log(`🔄 Subscription updated for user ${user.email}: ${subscription.status}`);

  // Sync subscription status
  await updateUserSubscription(user.id, {
    subscriptionStatus: subscription.status,
    trialEndsAt: subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : undefined,
  });
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;
  const user = await getUserByStripeCustomerId(customerId);

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  console.log(`🗑️ Subscription cancelled for user ${user.email}`);

  // Update subscription status to canceled
  await updateUserSubscription(user.id, {
    subscriptionStatus: 'canceled',
  });

  // TODO: Send cancellation confirmation email
  console.log(`📧 Would send cancellation email to ${user.email}`);
}

export default router;
