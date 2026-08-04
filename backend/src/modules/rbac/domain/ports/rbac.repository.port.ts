import type { UserRole, UserStatus } from '../../../../shared/enums';
import type { DirectGrant, RoleGrant } from '../permission-set';

export const RBAC_REPOSITORY = Symbol('RBAC_REPOSITORY');

/**
 * Everything the resolver needs about one user, in one round trip.
 *
 * Assignments arrive **unfiltered by expiry**: whether a grant has lapsed is
 * decided by the pure function against an injected `now`, not by a `WHERE`
 * clause using the database's clock. Same reason the rest of the platform derives
 * state rather than storing it — it is the only version that can be tested.
 */
export interface RbacFacts {
  userId: string;
  status: UserStatus;
  primaryRole: UserRole;
  roleGrants: readonly RoleGrant[];
  directGrants: readonly DirectGrant[];
}

export interface RbacRepositoryPort {
  /** `null` when the user does not exist or has been soft-deleted. */
  factsFor(userId: string): Promise<RbacFacts | null>;
}
