import { PERMISSION_WILDCARD } from '../../../shared/contracts';
import { SUPER_ADMIN_ROLE, type UserRole, type UserStatus } from '../../../shared/enums';

/**
 * The authorization algebra, as one pure function (D6 §RBAC and PBAC).
 *
 *     effective = ⋃ role.permissions for every non-expired assignment
 *               ∪ { p : UserPermission(effect = true)  }
 *               − { p : UserPermission(effect = false) }     ← denial always wins
 *
 * It is pure, and that is the point: "may this person do this?" is the question
 * with the worst consequences for being subtly wrong, and here it can be answered
 * in a test with four literals and no database, no container and no clock.
 */

/** A role held by a user, with the permissions that role carries. */
export interface RoleGrant {
  roleSlug: string;
  /** Null = platform-wide. Non-null = "manager of *this* restaurant". */
  vendorId: string | null;
  /** Null = never expires. */
  expiresAt: Date | null;
  permissions: readonly string[];
}

/** A permission granted or denied directly to one user, layered over their roles. */
export interface DirectGrant {
  permissionSlug: string;
  /** false = explicit denial, which beats every grant. */
  effect: boolean;
  vendorId: string | null;
  expiresAt: Date | null;
}

export interface ResolutionInput {
  userId: string;
  status: UserStatus;
  /** `User.primaryRole` — the column that backs the frontend's `User.role`. */
  primaryRole: UserRole;
  roleGrants: readonly RoleGrant[];
  directGrants: readonly DirectGrant[];
  /** Assignments are filtered against this rather than swept by a job. */
  now: Date;
}

export interface ResolvedAuthorization {
  userId: string;
  status: UserStatus;
  roles: readonly string[];
  permissions: readonly string[];
  vendorIds: readonly string[];
  permHash: string;
}

function isLive(expiresAt: Date | null, now: Date): boolean {
  return expiresAt === null || expiresAt.getTime() > now.getTime();
}

export function resolveAuthorization(input: ResolutionInput): ResolvedAuthorization {
  const liveRoles = input.roleGrants.filter((grant) => isLive(grant.expiresAt, input.now));
  const liveDirect = input.directGrants.filter((grant) => isLive(grant.expiresAt, input.now));

  /**
   * `primaryRole` is always in the set, even with no assignment row behind it.
   *
   * D6 derives roles purely from `UserRoleAssignment`. In practice the column
   * and the table can disagree — a seed writes one, an admin edits the other —
   * and when they do, the frontend's `User.role` (which reads the column) would
   * show a role the guard does not honour. Trusting the column here means the
   * two can never contradict each other in the direction that locks a user out
   * of their own app.
   */
  const roles = unique([input.primaryRole, ...liveRoles.map((grant) => grant.roleSlug)]);

  const vendorIds = unique([
    ...liveRoles.map((grant) => grant.vendorId),
    ...liveDirect.map((grant) => grant.vendorId),
  ]).filter((id): id is string => id !== null);

  /**
   * A super-admin holds everything. Resolved here rather than special-cased in
   * each guard so there is one answer instead of one per call site — and so an
   * unseeded platform still has somebody who can seed it.
   */
  if (roles.includes(SUPER_ADMIN_ROLE)) {
    return {
      userId: input.userId,
      status: input.status,
      roles,
      permissions: [PERMISSION_WILDCARD],
      vendorIds,
      permHash: fingerprint([PERMISSION_WILDCARD]),
    };
  }

  const granted = new Set<string>();
  for (const grant of liveRoles) for (const slug of grant.permissions) granted.add(slug);
  for (const grant of liveDirect) if (grant.effect) granted.add(grant.permissionSlug);
  // Denials last, unconditionally: a denial that could be out-voted by a role
  // grant would be a denial nobody can rely on.
  for (const grant of liveDirect) if (!grant.effect) granted.delete(grant.permissionSlug);

  const permissions = [...granted].sort();

  return {
    userId: input.userId,
    status: input.status,
    roles,
    permissions,
    vendorIds,
    permHash: fingerprint(permissions),
  };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * A fingerprint of the resolved set, for the `permHash` token claim.
 *
 * FNV-1a rather than SHA-256, and deliberately so: this value is never a
 * security decision — nothing is granted because a hash matched — it exists so a
 * log line can show that a token's view of a permission set has drifted from the
 * server's. A 32-bit non-cryptographic hash is the right tool for that, and it
 * keeps `domain/` free of even a stdlib dependency.
 */
export function fingerprint(permissions: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const slug of [...permissions].sort()) {
    for (let index = 0; index < slug.length; index++) {
      hash ^= slug.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x2c; // separator, so ["ab","c"] and ["a","bc"] differ
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
