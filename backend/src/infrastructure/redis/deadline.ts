/**
 * A hard deadline on a Redis round trip.
 *
 * `CacheService` has always promised that "a cache read that fails is a cache miss,
 * never a request failure" — but it only kept that promise for a *fast* failure. With
 * Redis genuinely unreachable, ioredis spends its whole retry budget (three attempts
 * with backoff, ~17 s) before rejecting, so the call does not fail, it *hangs*.
 *
 * That was invisible until E2 put a cache read on the authenticated request path. Three
 * sequential lookups — the rate-limit window, the token epoch, the permission set —
 * then add up to more than the 30 s request timeout, and a Redis outage becomes an API
 * outage. Which is exactly the failure mode both classes were written to prevent.
 *
 * So every Redis call the auth path depends on races a short timer. Losing the race is
 * treated as the miss it effectively is.
 */
export const REDIS_DEADLINE_MS = 150;

class DeadlineExceeded extends Error {
  constructor(ms: number) {
    super(`Redis did not answer within ${ms}ms`);
    this.name = 'RedisDeadlineExceeded';
  }
}

/**
 * Rejects with `RedisDeadlineExceeded` if `operation` has not settled in time.
 *
 * The timer is cleared either way — an uncleared `setTimeout` would keep the event loop
 * alive and turn a graceful shutdown into a 15-second wait.
 */
export function withDeadline<T>(
  operation: Promise<T>,
  ms: number = REDIS_DEADLINE_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceeded(ms)), ms);
    // Do not hold the process open just to reject later.
    timer.unref();
  });

  return Promise.race([operation, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
