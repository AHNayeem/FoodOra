import type { ISODate } from "@/types";

/**
 * verification.ts — proving a contact detail belongs to whoever gave it
 * (Phase 17, G43).
 *
 * `services/auth.register` used to return `isVerified: true` unconditionally, so
 * every account the prototype created was verified by nothing at all — while an
 * OTP request/verify pair sat unused in the same file, and the admin's customer
 * table drew a "verified" chip from a field no flow could ever set to false.
 *
 * What this module is, precisely: the **shape of a challenge** and the rules that
 * decide whether answering it succeeds. It is not an OTP implementation and does
 * not know how a code is delivered or checked — `services/verification` owns
 * that, and is where a real SMS provider or the API's `verifyOtp` mutation slots
 * in without any of the rules below moving.
 *
 * The rules are the part worth having early, because they are the part a
 * prototype normally skips and a real system cannot: a code expires, attempts are
 * counted and run out, and a resend has a cooldown. A verification step with
 * unlimited attempts and no expiry is a decoration, and swapping in a real
 * provider later would not have made it one.
 *
 * Pure — `now` is passed in, as everywhere else in `lib/`.
 */

/** How a code reaches the person. Email exists on the type; SMS is what ships. */
export type VerificationChannel = "sms" | "email";

/** What is being proved. One member today; the type is the extension point. */
export type VerificationPurpose = "account";

/** Minutes a code stays good for. */
export const CODE_TTL_MINUTES = 10;

/** Wrong codes before the challenge is dead and a new one must be requested. */
export const MAX_ATTEMPTS = 5;

/** Seconds between resends, so a resend button is not a way to spam somebody. */
export const RESEND_COOLDOWN_SECONDS = 45;

export interface VerificationChallenge {
  id: string;
  purpose: VerificationPurpose;
  channel: VerificationChannel;
  /** The phone number or email the code went to. */
  destination: string;
  issuedAt: ISODate;
  expiresAt: ISODate;
  /** Wrong codes entered against *this* challenge. */
  attempts: number;
  /** When it was answered correctly; null while it has not been. */
  verifiedAt: ISODate | null;
}

/** What answering a challenge can go wrong with. Keys, so callers translate. */
export type VerificationError =
  | "errors.noChallenge"
  | "errors.codeExpired"
  | "errors.tooManyAttempts"
  | "errors.invalidCode"
  | "errors.destinationRequired";

/** Mint a challenge. Deterministic id, so a replayed request is recognisable. */
export function issueChallenge(
  input: { destination: string; channel?: VerificationChannel; purpose?: VerificationPurpose },
  now: number = Date.now(),
): VerificationChallenge {
  const iso = new Date(now).toISOString();
  return {
    id: `vrf_${now.toString(36)}`,
    purpose: input.purpose ?? "account",
    channel: input.channel ?? "sms",
    destination: input.destination.trim(),
    issuedAt: iso,
    expiresAt: new Date(now + CODE_TTL_MINUTES * 60_000).toISOString(),
    attempts: 0,
    verifiedAt: null,
  };
}

function isExpired(challenge: VerificationChallenge, now: number): boolean {
  return Date.parse(challenge.expiresAt) <= now;
}

function isLocked(challenge: VerificationChallenge): boolean {
  return challenge.attempts >= MAX_ATTEMPTS;
}

/** Seconds still to wait before another code may be sent; 0 when it may. */
export function resendInSeconds(challenge: VerificationChallenge, now: number): number {
  const elapsed = (now - Date.parse(challenge.issuedAt)) / 1000;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));
}

/**
 * Is this challenge still answerable? The guard a surface asks before offering
 * the code field, and the one `settle` re-runs before accepting an answer — the
 * same arrangement the order machine has with its own guards.
 */
export function challengeError(
  challenge: VerificationChallenge | null,
  now: number,
): VerificationError | null {
  if (!challenge) return "errors.noChallenge";
  if (challenge.verifiedAt) return null;
  if (isLocked(challenge)) return "errors.tooManyAttempts";
  if (isExpired(challenge, now)) return "errors.codeExpired";
  return null;
}

/** Record a wrong answer. Pure; the caller commits the returned challenge. */
export function recordFailure(
  challenge: VerificationChallenge,
): VerificationChallenge {
  return { ...challenge, attempts: challenge.attempts + 1 };
}

/** Record a correct answer. */
export function markVerified(
  challenge: VerificationChallenge,
  now: number = Date.now(),
): VerificationChallenge {
  return { ...challenge, verifiedAt: new Date(now).toISOString() };
}
