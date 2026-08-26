/**
 * Progressive lockout on consecutive password failures (D6 §Sign-in methods).
 *
 * Progressive rather than flat because the two failure populations are different
 * people: a real user mistypes twice and would be furious at a 15-minute lock,
 * while a stuffing run wants thousands of attempts and is stopped by any delay
 * that grows. The steps below cost an honest user at most a minute and cost an
 * attacker four orders of magnitude of throughput.
 *
 * The counter is `Credential.failedCount` in Postgres, not a Redis key: a lockout
 * that evaporates when the cache restarts is not a lockout.
 */

export interface LockoutStep {
  /** Consecutive failures at or above which this step applies. */
  failures: number;
  lockSeconds: number;
}

/** Highest threshold first — `find` then reads as "the worst step that applies". */
export const LOCKOUT_STEPS: readonly LockoutStep[] = [
  { failures: 12, lockSeconds: 3_600 },
  { failures: 8, lockSeconds: 900 },
  { failures: 5, lockSeconds: 60 },
];

/** When the account should stay locked until, or `null` if this failure earns no lock. */
export function lockUntil(failedCount: number, now: Date): Date | null {
  const step = LOCKOUT_STEPS.find((candidate) => failedCount >= candidate.failures);
  return step ? new Date(now.getTime() + step.lockSeconds * 1_000) : null;
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/** For the `unlockInSeconds` parameter on the error — a countdown, not a shrug. */
export function unlockInSeconds(lockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1_000));
}
