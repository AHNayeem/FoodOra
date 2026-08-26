import type { ResolvedAuthorization } from '../permission-set';

export const AUTHORIZATION_CACHE = Symbol('AUTHORIZATION_CACHE');

/**
 * The resolved set, memoised.
 *
 * A port rather than a direct `CacheService` call because the application layer
 * may not import `infrastructure/` — and because the *policy* stated here is the
 * part worth pinning down: a cache miss must behave exactly like a cold start, so
 * every method is allowed to fail silently and the caller always has a source to
 * fall back to.
 */
export interface AuthorizationCachePort {
  read(userId: string): Promise<ResolvedAuthorization | null>;
  write(userId: string, value: ResolvedAuthorization): Promise<void>;
  /**
   * Called by any role or permission change. D6 keys the cache by epoch and
   * bumps the epoch instead; see `PermissionService` for why an explicit delete
   * turned out to be the honest version.
   */
  invalidate(userId: string): Promise<void>;
}
