/**
 * D6 §Rate limits, as data.
 *
 * These are the buckets that key on something in the *payload* — an email
 * address, a phone number, a session id — which is precisely why they cannot live
 * in a guard: a guard runs before the arguments are parsed and only ever knows the
 * IP. `RateLimitGuard` handles the coarse per-IP request budget; these are applied
 * inside the services, where the destination is known.
 *
 * Two limits on the same operation are not redundant. A per-IP limit stops one
 * host hammering many accounts; a per-account limit stops a botnet hammering one
 * account from a thousand hosts. Neither implies the other.
 */

export interface RateLimitRule {
  /** Bucket name — the prefix of the Redis key. */
  name: string;
  limit: number;
  windowSeconds: number;
}

const MINUTE = 60;
const QUARTER_HOUR = 15 * MINUTE;
const HOUR = 60 * MINUTE;

export const AUTH_RATE_LIMITS = {
  login: {
    perIp: { name: 'login:ip', limit: 10, windowSeconds: QUARTER_HOUR },
    perAccount: { name: 'login:account', limit: 5, windowSeconds: QUARTER_HOUR },
  },
  register: {
    perIp: { name: 'register:ip', limit: 5, windowSeconds: HOUR },
  },
  requestOtp: {
    /** One code a minute per destination — the resend cooldown, enforced. */
    perDestinationBurst: { name: 'otp:dest:burst', limit: 1, windowSeconds: MINUTE },
    perDestinationHour: { name: 'otp:dest:hour', limit: 5, windowSeconds: HOUR },
    /** The one that matters for cost: SMS is billed per message. */
    perIpHour: { name: 'otp:ip', limit: 20, windowSeconds: HOUR },
  },
  requestPasswordReset: {
    perEmail: { name: 'reset:email', limit: 3, windowSeconds: HOUR },
    perIp: { name: 'reset:ip', limit: 10, windowSeconds: HOUR },
  },
  refreshToken: {
    perSession: { name: 'refresh:session', limit: 60, windowSeconds: HOUR },
  },
} as const satisfies Record<string, Record<string, RateLimitRule>>;
