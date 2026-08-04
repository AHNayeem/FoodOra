import { SetMetadata } from '@nestjs/common';

import type { UserRole } from '../../shared/enums';
import type { PermissionSlug } from '../../shared/permissions';

/**
 * The declarative half of authorization. Each decorator sets metadata that
 * exactly one guard reads, and every one of those guards is registered globally
 * in `AuthModule` — so a handler with no decorator at all is **authenticated
 * and unauthorized**, which is the safe default. A new resolver is protected
 * because it was written, not because someone remembered.
 *
 * E1 deliberately shipped none of these: a decorator with no guard behind it
 * reads as protection while providing none.
 */

export const PUBLIC_KEY = 'auth:public';
export const ROLES_KEY = 'auth:roles';
export const PERMISSIONS_KEY = 'auth:permissions';
export const FRESH_SESSION_KEY = 'auth:freshSession';
export const RATE_LIMIT_KEY = 'auth:rateLimit';
export const VENDOR_SCOPE_KEY = 'auth:vendorScope';

/**
 * No token required. Reachable by anyone — the menu, the vendor list, `login`
 * itself.
 *
 * A public operation still gets a `RequestContext` and is still rate limited;
 * it simply has no actor, and `@CurrentUser()` returns `undefined`.
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Coarse gate: the actor must hold at least one of these roles.
 *
 * Holding a role is not the same as being permitted an action — that is
 * `@Permissions()`. Roles answer "which app is this?" (a rider cannot reach the
 * merchant dashboard at all); permissions answer "may they do this thing?".
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Fine gate: the actor must hold **every** listed permission slug.
 *
 * Typed against the catalogue in `shared/permissions.ts`, so a mistyped slug is a
 * compile error. That check earns its keep more than most: a permission nobody holds
 * is a gate nobody passes, so `@Permissions('users:wirte')` would not fail loudly —
 * it would silently lock the handler for everyone except a super-admin, and only in
 * production, and only for the one role that was supposed to reach it.
 */
export const Permissions = (...permissions: PermissionSlug[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Additionally require that the session has not been revoked since the access
 * token was minted.
 *
 * Access tokens are stateless and live ~15 minutes, so a revoked session's
 * token keeps working for up to that long. For reading a menu that is a fair
 * trade; for changing a password, adding a payout account or moving money it is
 * not. This is the opt-in that pays for the extra Redis read where it matters
 * (D6 §Token model).
 */
export const FreshSession = () => SetMetadata(FRESH_SESSION_KEY, true);

export interface RateLimitRule {
  /** Requests allowed inside the window. */
  limit: number;
  windowSeconds: number;
  /** Distinguishes this handler's bucket from every other. */
  name: string;
}

/**
 * Overrides the coarse per-IP budget for one handler.
 *
 * Limits that key on something in the *payload* — an email, a phone number —
 * are enforced in the service instead, because only the service knows the
 * destination. See `domain/policies/rate-limits.ts`.
 */
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT_KEY, rule);

/**
 * Refuse the call unless the vendor id in the arguments is one the actor's
 * roles are scoped to.
 *
 * This is a cheap early gate, **not** the security boundary: row scoping lives
 * in the repository, so a scoped actor listing orders gets their own rows rather
 * than a filtered-after-the-fact page, and an id they cannot see reads as
 * `NOT_FOUND` rather than `FORBIDDEN` — a 403 on someone else's order confirms
 * it exists (D5 §Authorization).
 *
 * `argPath` is a dotted path into the resolver's arguments, e.g.
 * `"input.vendorId"`.
 */
export const VendorScope = (argPath: string) => SetMetadata(VENDOR_SCOPE_KEY, argPath);
