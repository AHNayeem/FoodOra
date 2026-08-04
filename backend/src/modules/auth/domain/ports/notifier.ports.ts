import type { OtpChannel, OtpPurpose } from '../../../../shared/enums';

export const OTP_SENDER = Symbol('OTP_SENDER');

export interface OtpMessage {
  destination: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
  code: string;
  /** So the message is written in the language the account reads. */
  locale: string;
  expiresInSeconds: number;
}

/**
 * Delivery of a one-time code.
 *
 * A port with one adapter today — `LoggingOtpSender`, which prints the code to
 * the log outside production. That is not a stub pretending to be a feature: the
 * SMS and email transports belong to the notifications module (E8), and inventing
 * a half one here would mean writing the retry, template and preference logic
 * twice. What matters for E2 is that the *challenge* is real — hashed, peppered,
 * expiring, attempt-limited — and it is.
 */
export interface OtpSenderPort {
  send(message: OtpMessage): Promise<void>;
}

export const AUTH_AUDIT = Symbol('AUTH_AUDIT');

export interface AuthAuditEvent {
  /** `auth.token.reuse`, `auth.password.changed`, `auth.sessions.revokedAll`. */
  action: string;
  userId: string;
  entityId?: string;
  /** Shallow, and never the secret itself. */
  details?: Record<string, unknown>;
}

/**
 * The security-relevant subset of the audit log.
 *
 * `LoginAttempt` already records every sign-in, so this is for the things a human
 * investigates rather than counts: a replayed refresh token, a password change, a
 * forced sign-out. The `audit` module (a later phase) owns reading them back; E2
 * only writes.
 */
export interface AuthAuditPort {
  record(event: AuthAuditEvent): Promise<void>;
}
