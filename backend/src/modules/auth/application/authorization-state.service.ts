import { Inject, Injectable } from '@nestjs/common';

import type { ActorAuthorization, AuthorizationStatePort } from '../../../shared/contracts';
import { PERMISSION_RESOLUTION, type PermissionResolutionPort } from '../../rbac/domain';
import {
  AUTH_CACHE,
  type AuthCachePort,
  IDENTITY_REPOSITORY,
  type IdentityRepositoryPort,
} from '../domain';

/**
 * What `AuthModule` puts behind the `AUTHORIZATION_STATE` contract that the
 * guards depend on.
 *
 * It is a composition and nothing else — `rbac` resolves permissions, `auth` owns
 * the epoch, Redis holds the revocation marks — and it exists so `common/guards`
 * has one dependency instead of three, and so neither module has to know that the
 * guard is the thing asking.
 */
@Injectable()
export class AuthorizationStateService implements AuthorizationStatePort {
  constructor(
    @Inject(PERMISSION_RESOLUTION) private readonly permissions: PermissionResolutionPort,
    @Inject(IDENTITY_REPOSITORY) private readonly identity: IdentityRepositoryPort,
    @Inject(AUTH_CACHE) private readonly cache: AuthCachePort,
  ) {}

  async authorizationFor(userId: string): Promise<ActorAuthorization | null> {
    const resolved = await this.permissions.resolve(userId);
    if (!resolved) return null;
    // Structurally identical by design: the contract *is* the resolved shape, so
    // there is nothing to map and therefore nothing to map wrongly.
    return resolved;
  }

  /**
   * Read on every authenticated request, so it is cached — and the cache is
   * populated on the way *out* of a token mint as well as here, which means the
   * common case is a hit even on a cold instance.
   */
  async currentEpoch(userId: string): Promise<number> {
    const cached = await this.cache.readEpoch(userId);
    if (cached !== null) return cached;

    const epoch = await this.identity.currentTokenEpoch(userId);
    await this.cache.writeEpoch(userId, epoch);
    return epoch;
  }

  isSessionRevoked(sessionId: string): Promise<boolean> {
    return this.cache.isSessionRevoked(sessionId);
  }
}
