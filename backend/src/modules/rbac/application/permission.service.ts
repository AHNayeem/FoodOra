import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../../../shared/kernel';
import {
  AUTHORIZATION_CACHE,
  type AuthorizationCachePort,
  type PermissionResolutionPort,
  RBAC_REPOSITORY,
  type RbacRepositoryPort,
  resolveAuthorization,
  type ResolvedAuthorization,
} from '../domain';

/**
 * Resolves and memoises "what may this user do?".
 *
 * Read on **every authenticated request**, which is what makes the cache load
 * bearing rather than an optimisation — and also why the invalidation strategy
 * is worth the paragraph below.
 *
 * D6 caches under `perm:<userId>:<epoch>` and says the epoch is bumped by any
 * role or permission change, making invalidation a single counter write. Two
 * things went wrong with that when it met the schema:
 *
 * 1. The epoch lives on `Credential.tokenEpoch`, and a phone-OTP account has no
 *    `Credential` row at all — so for those users there would be nothing to bump.
 * 2. Overloading the epoch would make every role edit invalidate the user's
 *    **access tokens** too, signing them out of an app they are using because
 *    somebody granted them one more permission.
 *
 * So the two concerns are separated. The epoch means only "every token before
 * this point is void" (password change, forced sign-out). Role and permission
 * edits delete `perm:<userId>` instead — one key, one explicit write, and
 * because the guard resolves the set server-side on every request rather than
 * reading it from the token, the change is live on the very next call. A stale
 * `permHash` inside a token can therefore never grant anything.
 */
@Injectable()
export class PermissionService implements PermissionResolutionPort {
  constructor(
    @Inject(RBAC_REPOSITORY) private readonly repository: RbacRepositoryPort,
    @Inject(AUTHORIZATION_CACHE) private readonly cache: AuthorizationCachePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async resolve(userId: string): Promise<ResolvedAuthorization | null> {
    const cached = await this.cache.read(userId);
    if (cached) return cached;

    const facts = await this.repository.factsFor(userId);
    if (!facts) return null;

    const resolved = resolveAuthorization({ ...facts, now: this.clock.date() });

    // Deliberately not awaited-and-checked: a failed cache write is a slower
    // next request, not a failed this one. `CacheService` already swallows.
    await this.cache.write(userId, resolved);
    return resolved;
  }

  async invalidate(userId: string): Promise<void> {
    await this.cache.invalidate(userId);
  }
}
