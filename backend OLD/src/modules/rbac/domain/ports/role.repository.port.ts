import type {
  NewRole,
  NewRoleAssignment,
  NewUserPermission,
  PermissionRecord,
  RoleAssignmentRecord,
  RolePatch,
  RoleRecord,
  UserPermissionRecord,
} from '../models';

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');

/** One catalogue permission to reconcile into the table. */
export interface PermissionUpsert {
  id: string;
  slug: string;
  resource: string;
  action: string;
  description: string;
}

/**
 * The **write** side of RBAC, kept as a separate port from `RbacRepositoryPort`.
 *
 * That split is the point. `RbacRepositoryPort` has one method and runs on every
 * authenticated request that misses the cache, so it is the thing to keep small and fast.
 * This port has eighteen and runs when an administrator clicks something. Merging them
 * would put the administration surface on the hot path's interface and invite a
 * convenience method that quietly costs three joins per request.
 */
export interface RoleRepositoryPort {
  // --- roles ----------------------------------------------------------------
  listRoles(): Promise<RoleRecord[]>;
  findRole(id: string): Promise<RoleRecord | null>;
  findRoleBySlug(slug: string): Promise<RoleRecord | null>;
  createRole(input: NewRole): Promise<RoleRecord>;
  updateRole(id: string, patch: RolePatch): Promise<RoleRecord>;
  /** Replaces a role's permission set wholesale. Returns the role as it now stands. */
  setRolePermissions(id: string, permissionSlugs: readonly string[]): Promise<RoleRecord>;
  deleteRole(id: string): Promise<void>;
  /** How many accounts hold this role. Read before a delete. */
  countRoleAssignments(id: string): Promise<number>;
  /**
   * The ids of every account holding this role — what an edit has to invalidate.
   *
   * Ids rather than rows: the caller drops a cache key per user and needs nothing else.
   * There is no cap, and that is a known limit rather than an oversight — a role held by
   * a hundred thousand accounts would make this edit expensive, which is recorded in the
   * phase write-up as the place a background invalidation belongs when it matters.
   */
  listRoleHolders(id: string): Promise<string[]>;

  // --- permissions ----------------------------------------------------------
  listPermissions(): Promise<PermissionRecord[]>;
  findPermissionBySlug(slug: string): Promise<PermissionRecord | null>;
  /**
   * Reconciles the catalogue into the table, creating what is missing and refreshing the
   * descriptions of what is not. Returns how many rows it wrote.
   *
   * Deliberately never deletes. A permission row that has left the catalogue may still be
   * pointed at by a role or a direct grant, and removing it would cascade those away —
   * turning a code rename into silent revocation of somebody's access. Orphans are
   * reported by `listPermissions` with `inCatalogue: false` and removed by a human.
   */
  syncPermissions(definitions: readonly PermissionUpsert[]): Promise<number>;

  // --- assignments ----------------------------------------------------------
  listAssignments(userId: string): Promise<RoleAssignmentRecord[]>;
  findAssignment(
    userId: string,
    roleId: string,
    vendorId: string | null,
  ): Promise<RoleAssignmentRecord | null>;
  createAssignment(input: NewRoleAssignment): Promise<RoleAssignmentRecord>;
  /** False when there was no such assignment. */
  removeAssignment(userId: string, roleId: string, vendorId: string | null): Promise<boolean>;

  // --- direct grants --------------------------------------------------------
  listDirectGrants(userId: string): Promise<UserPermissionRecord[]>;
  upsertDirectGrant(input: NewUserPermission): Promise<UserPermissionRecord>;
  removeDirectGrant(userId: string, permissionId: string, vendorId: string | null): Promise<boolean>;
}
