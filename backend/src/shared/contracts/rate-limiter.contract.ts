/**
 * A sliding-window counter, as the thing that needs one sees it.
 *
 * Published as a contract because both sides of the dependency rule need it: a
 * guard in `common/` cannot import `infrastructure/redis`, and an application
 * service must not either. The window lives in Redis; nothing that consumes it
 * knows that.
 */
export const RATE_LIMITER = Symbol('RATE_LIMITER');

export interface RateLimitVerdict {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Seconds until the window has room again — the `retryAfter` extension. */
  retryAfterSeconds: number;
}

export interface RateLimiterPort {
  /**
   * Records one hit against `key` and says whether it was within budget.
   *
   * Implementations **fail open**: if the store is unreachable the request is
   * allowed. A Redis outage must not lock every user out of signing in, and the
   * limiter is a mitigation rather than the security boundary — lockout counters
   * and single-use tokens live in Postgres for exactly that reason.
   */
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitVerdict>;

  /** Clears a bucket — a successful sign-in forgives the failed attempts before it. */
  reset(key: string): Promise<void>;
}
