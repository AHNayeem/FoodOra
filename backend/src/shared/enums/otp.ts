/**
 * What a one-time code is *for*. The purpose is part of the challenge's
 * identity, not a label on it: a code issued to verify a phone number must not
 * be presentable as a sign-in, so `verifyOtp` matches on
 * `(destination, purpose)` and never on the code alone.
 *
 * `delivery` is in the Postgres enum because the handoff code shares the table,
 * but it is deliberately **not** reachable through the auth module — it is a
 * proof-of-delivery token with a different threat model, submitted by the rider
 * and compared server-side (D6 §Delivery OTP). It lands with E9.
 */
export const OTP_PURPOSES = [
  'login',
  'register',
  'phone-verify',
  'password-reset',
  'two-factor',
] as const;

export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const OTP_CHANNELS = ['sms', 'email'] as const;

export type OtpChannel = (typeof OTP_CHANNELS)[number];
