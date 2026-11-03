import crypto from 'crypto';

/**
 * `client_reference_id` for Stripe Payment Links. The link is public and the
 * parameter is just a URL query value, so a bare user id would let anyone
 * attach their own checkout (and later cancellation) to another user. The
 * reference is `<userId>_<expiry base36>_<hmac>`, issued only to that user
 * (Stripe allows letters, digits, `-` and `_`, up to 200 chars).
 */
const CHECKOUT_REFERENCE_TTL_MS = 24 * 60 * 60 * 1000;

const secret = (): string => {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET environment variable is required');
  return value;
};

const sign = (userId: string, exp: string): string =>
  crypto.createHmac('sha256', secret()).update(`stripe-checkout-ref:${userId}:${exp}`).digest('hex').slice(0, 40);

export const createCheckoutReference = (userId: string, now = Date.now()): string => {
  const exp = (now + CHECKOUT_REFERENCE_TTL_MS).toString(36);
  return `${userId}_${exp}_${sign(userId, exp)}`;
};

/**
 * The user id a reference was issued to, or null if it's forged, a legacy bare
 * id, or was issued too long before the checkout (`createdAtMs`) started.
 */
export const verifyCheckoutReference = (reference: unknown, createdAtMs: number): string | null => {
  if (typeof reference !== 'string') return null;
  const match = /^([0-9a-f-]{36})_([0-9a-z]+)_([0-9a-f]{40})$/.exec(reference);
  if (!match) return null;
  const [, userId, exp, mac] = match;
  const expected = Buffer.from(sign(userId, exp));
  const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  if (parseInt(exp, 36) < createdAtMs) return null;
  return userId;
};
