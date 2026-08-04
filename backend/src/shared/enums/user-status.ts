/**
 * Account standing, mirroring the `UserStatus` Postgres enum.
 *
 * `pending` is a real signed-in state, not a synonym for "blocked": an account
 * awaiting email verification can still browse, and the *specific* actions that
 * need a verified channel say so themselves. Only `suspended` and `banned` stop
 * a token from being honoured, which is checked once in `JwtAuthGuard`.
 */
export const USER_STATUSES = ['active', 'pending', 'suspended', 'banned'] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

/** Statuses that may hold a session. */
export const SIGNED_IN_STATUSES = ['active', 'pending'] as const satisfies readonly UserStatus[];

export function canHoldSession(status: UserStatus): boolean {
  return (SIGNED_IN_STATUSES as readonly UserStatus[]).includes(status);
}
