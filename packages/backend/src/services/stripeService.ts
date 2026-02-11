import Stripe from 'stripe';
import { getDatabase, getPool, isPostgreSQL } from '../database';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️ STRIPE_SECRET_KEY not set - Stripe features will not work');
}

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

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
  trialEndsAt: Date | null;
  clientSecret?: string | null;
}

/**
 * Create a Stripe customer and subscription.
 *
 * If the user is currently in an internal trial (`subscription_status=trialing`)
 * and `trial_ends_at` is in the future, we mirror that end date into Stripe by
 * setting `trial_end` (so we don't grant extra trial time).
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

  const existingUser = await getUserById(params.userId);
  const internalTrialEndsAt =
    existingUser?.subscription_status === 'trialing' && existingUser.trial_ends_at
      ? new Date(existingUser.trial_ends_at)
      : null;

  const shouldUseInternalTrialEnd =
    internalTrialEndsAt &&
    !Number.isNaN(internalTrialEndsAt.getTime()) &&
    internalTrialEndsAt.getTime() > Date.now();

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

  // 2. Create Subscription (mirror internal trial end if applicable)
  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: customer.id,
    items: [{ price: priceId }],
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    metadata: {
      userId: params.userId,
    },
  };

  if (shouldUseInternalTrialEnd) {
    subscriptionParams.trial_end = Math.floor(internalTrialEndsAt.getTime() / 1000);
  } else {
    // No trial: generate an invoice/payment intent that can be confirmed client-side (SCA).
    subscriptionParams.payment_behavior = 'default_incomplete';
    subscriptionParams.expand = ['latest_invoice.payment_intent'];
  }

  const subscription = await stripe.subscriptions.create(subscriptionParams);

  const trialEndsAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;

  // Stripe types can vary by API version; keep this extraction resilient.
  const clientSecret =
    (subscription as any)?.latest_invoice?.payment_intent?.client_secret ?? null;

  // 3. Update user in database
  await updateUserSubscription(params.userId, {
    stripeCustomerId: customer.id,
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    trialEndsAt: trialEndsAt ?? undefined,
  });

  return {
    customerId: customer.id,
    subscriptionId: subscription.id,
    status: subscription.status,
    trialEndsAt,
    clientSecret,
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
  if (!user) {
    return { status: 'none', trialEndsAt: null, currentPeriodEnd: null };
  }

  // No Stripe subscription yet: fall back to internal trial (if any)
  if (!user.stripe_subscription_id) {
    const trialEnd = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
    const isTrialing =
      user.subscription_status === 'trialing' &&
      trialEnd &&
      !Number.isNaN(trialEnd.getTime()) &&
      trialEnd.getTime() > Date.now();

    if (isTrialing) {
      return {
        status: 'trialing',
        trialEndsAt: trialEnd,
        currentPeriodEnd: trialEnd,
      };
    }

    // Trial expired (or invalid) – normalize to none for API consumers.
    if (user.subscription_status === 'trialing') {
      await updateUserSubscription(userId, { subscriptionStatus: 'none' });
    }

    return { status: 'none', trialEndsAt: null, currentPeriodEnd: null };
  }

  const subscription = await stripe.subscriptions.retrieve(
    user.stripe_subscription_id,
    { expand: ['items.data'] }
  );

  // Get current_period_end from the first subscription item
  const firstItem = subscription.items?.data?.[0];
  const currentPeriodEnd = firstItem?.current_period_end 
    ? new Date(firstItem.current_period_end * 1000)
    : null;

  const trialEndsAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;

  // Keep DB in sync so middleware can rely on it.
  if (subscription.status && subscription.status !== user.subscription_status) {
    await updateUserSubscription(userId, {
      subscriptionStatus: subscription.status,
      trialEndsAt: trialEndsAt ?? undefined,
    });
  }

  return {
    status: subscription.status,
    trialEndsAt,
    currentPeriodEnd,
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

interface UserWithStripeInfo {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
}

/**
 * Get user by ID
 */
async function getUserById(userId: string): Promise<UserWithStripeInfo | null> {
  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, email, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at FROM users WHERE id = $1',
        [userId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    const result = await db.get<UserWithStripeInfo>(
      'SELECT id, email, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at FROM users WHERE id = ?',
      [userId]
    );
    return result ?? null;
  }
}

interface UserBasicInfo {
  id: string;
  email: string;
  subscription_status: string;
}

/**
 * Get user by Stripe customer ID
 */
export async function getUserByStripeCustomerId(customerId: string): Promise<UserBasicInfo | null> {
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
    const result = await db.get<UserBasicInfo>(
      'SELECT id, email, subscription_status FROM users WHERE stripe_customer_id = ?',
      [customerId]
    );
    return result ?? null;
  }
}

/**
 * Get user by email (used to map Stripe Checkout/Payment Link back to our user).
 */
export async function getUserByEmail(email: string): Promise<UserBasicInfo | null> {
  const normalized = email.trim().toLowerCase();

  if (isPostgreSQL()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, email, subscription_status FROM users WHERE LOWER(email) = $1',
        [normalized]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  } else {
    const db = getDatabase();
    const result = await db.get<UserBasicInfo>(
      'SELECT id, email, subscription_status FROM users WHERE LOWER(email) = ?',
      [normalized]
    );
    return result ?? null;
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
