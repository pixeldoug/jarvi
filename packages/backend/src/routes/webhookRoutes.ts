import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import {
  verifyWebhookSignature,
  updateUserSubscription,
  getUserByStripeCustomerId,
  getUserByEmail,
  getUserById,
  syncSubscriptionFromStripe,
} from '../services/stripeService';
import { getDatabase, getPool, isPostgreSQL } from '../database';
import { handleSlackApprovalInteraction } from '../controllers/earlyAccessController';

/**
 * Record a Stripe webhook `event.id` so we don't double-apply side-effects when
 * Stripe retries the same event. Returns true on first-seen, false on duplicate.
 */
async function recordWebhookEvent(
  eventId: string,
  eventType: string
): Promise<boolean> {
  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO processed_webhook_events (event_id, event_type)
         VALUES ($1, $2)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [eventId, eventType]
      );
      return result.rowCount ? result.rowCount > 0 : false;
    } finally {
      client.release();
    }
  }

  const db = getDatabase();
  try {
    await db.run(
      `INSERT INTO processed_webhook_events (event_id, event_type) VALUES (?, ?)`,
      [eventId, eventType]
    );
    return true;
  } catch {
    // UNIQUE constraint violation = already processed.
    return false;
  }
}

/**
 * Remove an event_id marker so Stripe's retry will actually re-run the handler.
 * Used when a handler fails with a retryable error (e.g. user not linked yet).
 */
async function forgetWebhookEvent(eventId: string): Promise<void> {
  try {
    if (isPostgreSQL()) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query('DELETE FROM processed_webhook_events WHERE event_id = $1', [eventId]);
      } finally {
        client.release();
      }
    } else {
      const db = getDatabase();
      await db.run('DELETE FROM processed_webhook_events WHERE event_id = ?', [eventId]);
    }
  } catch (error) {
    console.error('Failed to forget webhook event id:', eventId, error);
  }
}

/**
 * Thrown when a webhook cannot link a Stripe event to a Jarvi user yet.
 *
 * We surface this as a 500 to Stripe so the event is retried — otherwise Stripe
 * marks it as delivered and stale DB state persists forever (happens when
 * `invoice.payment_succeeded` races ahead of `checkout.session.completed`).
 */
class WebhookRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookRetryableError';
  }
}

const router = Router();

/**
 * POST /webhooks/slack/interactions
 * Handle Slack interactive message actions (approve/reject early access)
 */
router.post('/slack/interactions', handleSlackApprovalInteraction);

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

  console.log(`📩 Received Stripe webhook: ${event.type} (id=${event.id})`);

  // Idempotency guard: if we've already processed this exact event_id, ack and skip.
  // We record BEFORE running handlers so concurrent deliveries can't both run. Retries
  // after an error still re-run because `WebhookRetryableError` returns 500 and we
  // delete the marker below; other errors also bubble up as 500.
  let firstDelivery = false;
  try {
    firstDelivery = await recordWebhookEvent(event.id, event.type);
  } catch (error) {
    console.error('Failed to record webhook event id:', error);
    // Fail-open: still process the event so we don't stall if the idempotency table
    // has issues. Worst case is a duplicate apply, which handlers should tolerate.
    firstDelivery = true;
  }

  if (!firstDelivery) {
    console.log(`↩️ Duplicate webhook ${event.id} (${event.type}) – skipping`);
    res.json({ received: true, duplicate: true });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // Payment Link / Checkout completed - map Stripe customer/subscription to user
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        // Subscription created/updated - link and sync status
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpserted(subscription);
        break;
      }

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
    // On failure, drop the idempotency marker so Stripe's retry will actually re-run.
    await forgetWebhookEvent(event.id);

    if (error instanceof WebhookRetryableError) {
      // Return 500 so Stripe retries (up to ~3 days). Happens when an event for
      // a user arrives before the linking event (e.g. checkout.session.completed).
      console.warn(`🔁 Webhook ${event.type} will be retried: ${error.message}`);
      res.status(500).json({
        error: 'Webhook not ready to be processed, will retry',
        message: error.message,
      });
      return;
    }
    console.error('Error processing webhook:', error);
    res.status(500).json({
      error: 'Error processing webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Handle checkout.session.completed event
 * This is used for Stripe Payment Links / Checkout to link the Stripe customer/subscription
 * back to our user record.
 *
 * Lookup order:
 *  1. session.client_reference_id  — set by frontend via ?client_reference_id=<userId>
 *     This is the most reliable method since it uses the Jarvi user ID directly.
 *  2. session.customer_details.email / session.customer_email — fallback for sessions
 *     where the frontend did not pass client_reference_id (e.g. direct link visits).
 */
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as any)?.id;

  if (!customerId) {
    console.error('checkout.session.completed missing customer id', {
      id: session.id,
      subscription: session.subscription,
    });
    return;
  }

  if (!subscriptionId) {
    console.error('checkout.session.completed missing subscription id', {
      id: session.id,
      customer: session.customer,
    });
    return;
  }

  // 1. Try client_reference_id (most reliable — Jarvi user ID passed via payment link URL)
  let user: { id: string; email: string } | null = session.client_reference_id
    ? await getUserById(session.client_reference_id)
    : null;

  if (user) {
    console.log(`🔗 [client_reference_id] Linking Stripe subscription for ${user.email}`);
  } else {
    // 2. Fallback: look up by email from the checkout session
    const email = session.customer_details?.email || session.customer_email || undefined;
    if (!email) {
      console.error('checkout.session.completed: no client_reference_id and no email', {
        id: session.id,
        customer: session.customer,
      });
      return;
    }
    user = await getUserByEmail(email);
    if (!user) {
      console.error('checkout.session.completed: user not found by email', {
        email,
        sessionId: session.id,
      });
      return;
    }
    console.log(`🔗 [email fallback] Linking Stripe subscription for ${user.email}`);
  }

  await updateUserSubscription(user.id, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });

  // Pull the current subscription state from Stripe so `subscription_status` in DB is
  // accurate immediately — otherwise the `requireActiveSubscription` middleware (which
  // reads only from DB) will return 403 until another event updates the row.
  await syncSubscriptionFromStripe(user.id, subscriptionId);
}

/**
 * Handle customer.subscription.created / customer.subscription.updated events.
 *
 * Keeps DB `subscription_status` in sync with Stripe. Also acts as a safety net if
 * `checkout.session.completed` is delayed — if we can find the user via subscription
 * metadata or an already-linked customer, we link the subscription ID here too.
 */
async function handleSubscriptionUpserted(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  // 1. metadata.userId — set by our direct API flow (`createCustomerWithSubscription`).
  const metadataUserId = subscription.metadata?.userId;
  let user: { id: string; email: string } | null = metadataUserId
    ? await getUserById(metadataUserId)
    : null;

  // 2. Already-linked customer (most common path for Payment Link after checkout.session.completed).
  if (!user) {
    user = await getUserByStripeCustomerId(customerId);
  }

  if (!user) {
    // Linking event hasn't landed yet — ask Stripe to retry.
    throw new WebhookRetryableError(
      `customer.subscription.${subscription.id} received before user was linked to ${customerId}`
    );
  }

  const trialEndsAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : undefined;

  console.log(
    `🔄 Subscription sync for ${user.email}: status=${subscription.status}`
  );

  await updateUserSubscription(user.id, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    trialEndsAt,
  });
}

/**
 * Handle trial_will_end event - 3 days before trial expires
 */
async function handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;
  const user = await getUserByStripeCustomerId(customerId);

  if (!user) {
    throw new WebhookRetryableError(
      `trial_will_end received before customer ${customerId} was linked`
    );
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
    throw new WebhookRetryableError(
      `invoice.payment_succeeded received before customer ${customerId} was linked`
    );
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
    throw new WebhookRetryableError(
      `invoice.payment_failed received before customer ${customerId} was linked`
    );
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
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;
  const user = await getUserByStripeCustomerId(customerId);

  if (!user) {
    throw new WebhookRetryableError(
      `customer.subscription.deleted received before customer ${customerId} was linked`
    );
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
