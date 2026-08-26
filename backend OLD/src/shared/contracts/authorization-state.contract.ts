import type { UserStatus } from '../enums';

/**
 * What the server currently believes about an actor's authority — resolved
 * per request, never read from the token.
 *
 * That is the deliberate asymmetry of this design: the *token* is stateless so
 * verification costs no database read, but the *permission set* is resolved
 * server-side (from a 5-minute Redis entry) so that revoking a role takes
 * effect on the next request rather than on the next token. A stale `permHash`
 * in a token can then never grant anything.
 */
export interface ActorAuthorization {
  userId: string;
  status: UserStatus;
  /**
   * Primary role first, then every role held through a non-expired assignment.
   *
   * `string`, not `UserRole`: `Role.isSystem = false` rows let an operator define
   * a role that is not one of the fourteen built-ins, and typing this as the union
   * would make a custom role unrepresentable in the very place it has to be
   * checked.
   */
  roles: readonly string[];
  /** Resolved slugs: role grants ∪ direct grants − direct denials. */
  permissions: readonly string[];
  /** Vendors this actor's roles are scoped to. Empty means platform-wide or unscoped. */
  vendorIds: readonly string[];
  /** Fingerprint of `permissions`, stable across ordering. */
  permHash: string;
}

/**
 * Held by `super-admin`, and by nothing else. Resolved into the permission set
 * itself rather than special-cased in each guard, so "may they?" has one answer
 * instead of one per call site.
 */
export const PERMISSION_WILDCARD = '*';

/** Does this actor's resolved set satisfy every required slug? */
export function grantsAll(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  if (required.length === 0) return true;
  if (granted.includes(PERMISSION_WILDCARD)) return true;
  return required.every((slug) => granted.includes(slug));
}

/**
 * The three questions a guard has to answer before letting a request through,
 * behind one token so `common/guards` needs exactly one dependency.
 */
export const AUTHORIZATION_STATE = Symbol('AUTHORIZATION_STATE');

export interface AuthorizationStatePort {
  /** `null` when the user is gone, soft-deleted, or otherwise cannot hold a session. */
  authorizationFor(userId: string): Promise<ActorAuthorization | null>;

  /**
   * The user's current authorization epoch. Compared against the token's, so a
   * password change kills every outstanding access token immediately.
   */
  currentEpoch(userId: string): Promise<number>;

  /**
   * Whether this specific session has been revoked since the token was minted.
   *
   * Checked **only** for handlers marked `@FreshSession()` — the ones that move
   * money or change access — because it is a Redis read on every request and a
   * 15-minute window of staleness is acceptable for reading a menu and not for
   * changing a password (D6 §Token model).
   */
  isSessionRevoked(sessionId: string): Promise<boolean>;
}
