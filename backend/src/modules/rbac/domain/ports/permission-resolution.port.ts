import type { ResolvedAuthorization } from '../permission-set';

/**
 * `rbac`'s **published contract** — the only thing another module is allowed to
 * import from here (D1 §Modules).
 *
 * `auth` needs the resolved set to mint a token and to answer the guards, and it
 * gets it through this token rather than by importing `PermissionService`, so the
 * two modules stay separable: the resolution strategy can grow a cache, a
 * batch loader or a different store without `auth` recompiling.
 */
export const PERMISSION_RESOLUTION = Symbol('PERMISSION_RESOLUTION');

export interface PermissionResolutionPort {
  /** `null` when the user does not exist or has been soft-deleted. */
  resolve(userId: string): Promise<ResolvedAuthorization | null>;

  /** Drop the memoised set — after a role assignment, a denial, a suspension. */
  invalidate(userId: string): Promise<void>;
}
