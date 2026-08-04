/** Where a session was signed in from. Doubles as the push-registration platform. */
export const DEVICE_PLATFORMS = ['web', 'ios', 'android'] as const;

export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/**
 * Why a session ended — shown on the account's security screen, so the user can
 * tell "I signed out" from "someone else's token was replayed".
 *
 * `rotation-reuse` is the interesting one: it means a refresh token was
 * presented twice, which the rotation chain treats as theft rather than as a
 * retry (D6 §Rotation).
 */
export const SESSION_REVOKE_REASONS = [
  'logout',
  'rotation-reuse',
  'password-change',
  'admin',
  'expired',
  'device-removed',
] as const;

export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number];
