import Stripe from 'stripe';
import { getDatabase, getPool, isPostgreSQL } from '../database';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️ STRIPE_SECRET_KEY not set - Stripe features will not work');
}

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const TRIAL_PERIOD_DAYS = 14;

interface CreateSubscriptionParams {
  userId: string;
  email: string;
  name: string;
  paymentMethodId: string;
}

interface SubscriptionResult {
  customerId: string;
  subscriptionId: string;
  status: string;
  trialEndsAt: Date;
}

/**
 * Create a Stripe customer and subscription with a 14-day trial
 */
export async function createCustomerWithSubscription(
  params: CreateSubscriptionParams
): Promise<SubscriptionResult> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw new Error('STRIPE_PRICE_ID not configured');
  }

  // 1. Create Stripe Customer
  const customer = await stripe.customers.create({
    email: params.email,
    name: params.name,
    payment_method: params.paymentMethodId,
    invoice_settings: {
      default_payment_method: params.paymentMethodId,
    },
    metadata: {
      userId: params.userId,
    },
  });

  // 2. Create Subscription with trial
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    trial_period_days: TRIAL_PERIOD_DAYS,
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    metadata: {
      userId: params.userId,
    },
  });

  const trialEndsAt = new Date(subscription.trial_end! * 1000);

  // 3. Update user in database
  await updateUserSubscription(params.userId, {
    stripeCustomerId: customer.id,
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    trialEndsAt,
  });

  return {
    customerId: customer.id,
    subscriptionId: subscription.id,
    status: subscription.status,
    trialEndsAt,
  };
}

/**
 * Cancel a user's subscription
 */
export async function cancelSubscription(userId: string): Promise<void> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const user = await getUserById(userId);
  if (!user?.stripe_subscription_id) {
    throw new Error('User has no active subscription');
  }

  await stripe.subscriptions.cancel(user.stripe_subscription_id);

  await updateUserSubscription(userId, {
    subscriptionStatus: 'canceled',
  });
}

/**
 * Get subscription status from Stripe
 */
export async function getSubscriptionStatus(userId: string): Promise<{
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const user = await getUserById(userId);
  if (!user?.stripe_subscription_id) {
    return {
      status: 'none',
      trialEndsAt: null,
      currentPeriodEnd: null,
    };
  }

  const subscription = await stripe.subscriptions.retrieve(
    user.stripe_subscription_id
  );

  return {
    status: subscription.status,
    trialEndsAt: subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
  };
}

/**
 * Update user's subscription info in database
 */
export async function updateUserSubscription(
  userId: string,
  data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionStatus?: string;
    trialEndsAt?: Date;
  }
): Promise<void> {
  const updates: string[] = [];
  const values: (string | Date)[] = [];
  let paramIndex = 1;

  if (data.stripeCustomerId !== undefined) {
    updates.push(
      isPostgreSQL()
        ? `stripe_customer_id = $${paramIndex++}`
        : 'stripe_customer_id = ?'
    );
    values.push(data.stripeCustomerId);
  }

  if (data.stripeSubscriptionId !== undefined) {
    updates.push(
      isPostgreSQL()
        ? `stripe_subscription_id = $${paramIndex++}`
        : 'stripe_subscription_id = ?'
    );
    values.push(data.stripeSubscriptionId);
  }

  if (data.subscriptionStatus !== undefined) {
    updates.push(
      isPostgreSQL()
        ? `subscription_status = $${paramIndex++}`
        : 'subscription_status = ?'
    );
    values.push(data.subscriptionStatus);
  }

  if (data.trialEndsAt !== undefined) {
    updates.push(
      isPostgreSQL()
        ? `trial_ends_at = $${paramIndex++}`
        : 'trial_ends_at = ?'
    );
    values.push(data.trialEndsAt.toISOString());
  }

  updates.push(
    isPostgreSQL()
      ? `updated_at = $${paramIndex++}`
      : 'updated_at = ?'
  );
  values.push(new Date().toISOString());

  values.push(userId);

  const whereClause = isPostgreSQL() ? `WHERE id = $${paramIndex}` : 'WHERE id = ?';
  const query = `UPDATE users SET ${updates.join(', ')} ${whereClause}`;

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(query, values);
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    await db.run(query, values);
  }
}

/**
 * Get user by ID
 */
async function getUserById(userId: string): Promise<{
  id: string;
  email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
} | null> {
  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, email, stripe_customer_id, stripe_subscription_id, subscription_status FROM users WHERE id = $1',
        [userId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    return db.get(
      'SELECT id, email, stripe_customer_id, stripe_subscription_id, subscription_status FROM users WHERE id = ?',
      [userId]
    );
  }
}

/**
 * Get user by Stripe customer ID
 */
export async function getUserByStripeCustomerId(customerId: string): Promise<{
  id: string;
  email: string;
  subscription_status: string;
} | null> {
  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, email, subscription_status FROM users WHERE stripe_customer_id = $1',
        [customerId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    return db.get(
      'SELECT id, email, subscription_status FROM users WHERE stripe_customer_id = ?',
      [customerId]
    );
  }
}

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: Buffer,
  signature: string
): Stripe.Event {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
