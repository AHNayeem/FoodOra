import type { OtpChallengeRecord } from '../models';

/**
 * What makes a one-time code acceptable, as pure predicates.
 *
 * The security model is three columns — `attempts`, `expiresAt`, `consumedAt` —
 * and it is enforced in Postgres rather than in Redis on purpose: a code whose
 * attempt counter vanishes with a cache restart can be brute-forced by restarting
 * the cache. The Redis limiter in front of `requestOtp` throttles *issuing*; this
 * is what protects *guessing*.
 */

export const OTP_CODE_LENGTH = 6;

/** How long before a new code may be requested for the same destination. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export type ChallengeVerdict =
  | { usable: true }
  | { usable: false; reason: 'expired' | 'consumed' | 'exhausted' };

export function inspectChallenge(
  challenge: OtpChallengeRecord,
  now: Date,
): ChallengeVerdict {
  if (challenge.consumedAt !== null) return { usable: false, reason: 'consumed' };
  if (challenge.expiresAt.getTime() <= now.getTime()) return { usable: false, reason: 'expired' };
  if (challenge.attempts >= challenge.maxAttempts) return { usable: false, reason: 'exhausted' };
  return { usable: true };
}

/**
 * Seconds until a resend is allowed, 0 when it already is.
 *
 * Returned to the client on every `requestOtp` so the UI can disable its own
 * button rather than discovering the limit by being refused — the same number the
 * server will enforce, so the two cannot disagree.
 */
export function resendAfterSeconds(
  latest: OtpChallengeRecord | null,
  now: Date,
  cooldownSeconds: number = OTP_RESEND_COOLDOWN_SECONDS,
): number {
  if (!latest) return 0;
  const elapsedSeconds = (now.getTime() - latest.createdAt.getTime()) / 1_000;
  return Math.max(0, Math.ceil(cooldownSeconds - elapsedSeconds));
}

/**
 * E.164-ish normalisation, so `+880 1712-345678`, `+8801712345678` and
 * `+880-1712-345678` are one destination rather than three separate rate-limit
 * buckets and three challenges.
 *
 * Deliberately not a validator: judging whether a number is *real* belongs to the
 * SMS provider, which finds out by trying. All this does is make the same number
 * look the same.
 */
export function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
