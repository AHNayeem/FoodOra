import type { UserRole } from '../../../shared/enums';

/** A role, as the admin screen sees it. */
export interface RoleRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** Set for the fourteen built-ins, so the UI can map role → slug directly. */
  builtin: UserRole | null;
  /** Built-ins cannot be renamed or deleted. */
  isSystem: boolean;
  /** Higher wins, and gates "may I edit this role at all". */
  rank: number;
  /** Catalogue slugs this role carries. */
  permissions: readonly string[];
  /** How many accounts hold it — what makes "delete this role" a decision. */
  assignedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewRole {
  id: string;
  slug: string;
  name: string;
  description: string;
  rank: number;
  permissions: readonly string[];
}

export interface RolePatch {
  name?: string;
  description?: string;
  rank?: number;
}

/** A permission row, joined with its catalogue definition. */
export interface PermissionRecord {
  id: string;
  slug: string;
  resource: string;
  action: string;
  description: string;
  /**
   * False when the row exists in the database but not in `shared/permissions.ts` — an
   * orphan from a slug that was renamed or removed in code. Surfaced rather than hidden,
   * because a role may still point at it and an operator needs to see why a permission
   * they granted does nothing.
   */
  inCatalogue: boolean;
}

/** One role held by one user, optionally scoped to a single vendor. */
export interface RoleAssignmentRecord {
  id: string;
  userId: string;
  roleId: string;
  roleSlug: string;
  roleName: string;
  /** Null = platform-wide. Non-null = "manager of *this* restaurant". */
  vendorId: string | null;
  grantedAt: Date;
  grantedBy: string | null;
  expiresAt: Date | null;
}

/** A permission granted or denied directly on one account (PBAC). */
export interface UserPermissionRecord {
  id: string;
  userId: string;
  permissionId: string;
  permissionSlug: string;
  /** false = explicit denial, which beats every grant. */
  effect: boolean;
  vendorId: string | null;
  grantedAt: Date;
  grantedBy: string | null;
  expiresAt: Date | null;
}

export interface NewRoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  vendorId: string | null;
  grantedBy: string | null;
  expiresAt: Date | null;
}

export interface NewUserPermission {
  id: string;
  userId: string;
  permissionId: string;
  effect: boolean;
  vendorId: string | null;
  grantedBy: string | null;
  expiresAt: Date | null;
}

/** Everything granted to one account — the "why can this person do that?" screen. */
export interface AuthorizationDetail {
  userId: string;
  primaryRole: UserRole;
  assignments: readonly RoleAssignmentRecord[];
  directGrants: readonly UserPermissionRecord[];
  /** The resolved answer: role grants ∪ direct grants − direct denials. */
  effectivePermissions: readonly string[];
}
