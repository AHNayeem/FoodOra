import { Inject, Injectable } from '@nestjs/common';

import { IdService } from '../../../common/ids';
import { isPermissionSlug } from '../../../shared/permissions';
import { CLOCK, type Clock, fail, ok, type Result } from '../../../shared/kernel';
import {
  type AuthorizationDetail,
  canAdministerRank,
  canGrantPermissions,
  checkExpiry,
  highestRank,
  notSelf,
  RBAC_REPOSITORY,
  type RbacActor,
  RbacError,
  type RbacRepositoryPort,
  ROLE_REPOSITORY,
  type RoleAssignmentRecord,
  type RoleRepositoryPort,
  type UserPermissionRecord,
} from '../domain';
import { PermissionService } from './permission.service';

export interface AssignRoleInput {
  userId: string;
  roleSlug: string;
  /** Null = platform-wide. Non-null = scoped to one vendor. */
  vendorId?: string | null;
  expiresAt?: Date | null;
}

export interface GrantPermissionInput {
  userId: string;
  permissionSlug: string;
  /** false = an explicit denial, which beats every role grant. */
  effect: boolean;
  vendorId?: string | null;
  expiresAt?: Date | null;
}

/**
 * Granting and revoking: roles on accounts (RBAC) and permissions on accounts (PBAC).
 *
 * The escalation policy runs on every path here, in a fixed order — **not-self, then rank,
 * then held-permissions** — and it runs against the *actor's* resolved authorization, which
 * the guard already put on the request. So the question is never "does this endpoint check
 * authority", it is "which pure function refused", and both answers are in
 * `domain/policies/escalation.policy.ts` where they can be read in one sitting.
 *
 * Every mutation ends by invalidating the target's cached authorization, and that is not
 * an optimisation detail — it is what makes a revocation take effect on the target's *next
 * request* rather than at the end of a five-minute TTL. E2 chose to resolve authorization
 * server-side per request precisely so this would be possible; this is the call site that
 * cashes it in.
 */
@Injectable()
export class AssignmentService {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepositoryPort,
    @Inject(RBAC_REPOSITORY) private readonly facts: RbacRepositoryPort,
    private readonly permissions: PermissionService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ids: IdService,
  ) {}

  /**
   * Everything granted to one account, plus the resolved answer.
   *
   * The "why can this person do that?" screen, and it is worth exposing precisely because
   * PBAC's answer is not obvious from any single row: an account can hold a role that
   * grants a permission and a direct denial that takes it away, and no view of either
   * table alone explains what happens.
   */
  async detailFor(userId: string): Promise<AuthorizationDetail | null> {
    const [facts, assignments, directGrants, resolved] = await Promise.all([
      this.facts.factsFor(userId),
      this.roles.listAssignments(userId),
      this.roles.listDirectGrants(userId),
      this.permissions.resolve(userId),
    ]);
    if (!facts || !resolved) return null;

    return {
      userId,
      primaryRole: facts.primaryRole,
      assignments,
      directGrants,
      effectivePermissions: resolved.permissions,
    };
  }

  // --- roles ----------------------------------------------------------------

  async assignRole(
    actor: RbacActor,
    input: AssignRoleInput,
  ): Promise<Result<RoleAssignmentRecord>> {
    const vendorId = input.vendorId ?? null;
    const expiresAt = input.expiresAt ?? null;

    const self = notSelf(actor, input.userId);
    if (!self.ok) return self;

    const role = await this.roles.findRoleBySlug(input.roleSlug);
    if (!role) return fail(RbacError.unknownRole, { path: 'input.roleSlug', params: { slug: input.roleSlug } });

    const rank = canAdministerRank(actor, role.rank);
    if (!rank.ok) return rank;

    /**
     * Assigning a role hands over everything the role carries, so the actor must hold all
     * of it. Without this, rank alone would be enough: create a rank-5 role, put
     * `settings:write` in it — which `RoleAdminService` refuses — or find one that already
     * has a permission you lack, and assign it to yourself via a colleague. The two checks
     * are redundant only in the cases where neither is needed.
     */
    const grantable = canGrantPermissions(actor, role.permissions);
    if (!grantable.ok) return grantable;

    const expiry = checkExpiry(expiresAt, this.clock.date());
    if (!expiry.ok) return fail(expiry.error.key, { path: 'input.expiresAt' });

    const existing = await this.roles.findAssignment(input.userId, role.id, vendorId);
    if (existing) {
      return fail(RbacError.alreadyAssigned, {
        params: { slug: role.slug, vendorId },
      });
    }

    const created = await this.roles.createAssignment({
      id: this.ids.next('roleAssignment'),
      userId: input.userId,
      roleId: role.id,
      vendorId,
      grantedBy: actor.id,
      expiresAt,
    });

    await this.permissions.invalidate(input.userId);
    return ok(created);
  }

  async revokeRole(
    actor: RbacActor,
    input: { userId: string; roleSlug: string; vendorId?: string | null },
  ): Promise<Result<null>> {
    const vendorId = input.vendorId ?? null;

    const self = notSelf(actor, input.userId);
    if (!self.ok) return self;

    const role = await this.roles.findRoleBySlug(input.roleSlug);
    if (!role) return fail(RbacError.unknownRole, { params: { slug: input.roleSlug } });

    const rank = canAdministerRank(actor, role.rank);
    if (!rank.ok) return rank;

    const removed = await this.roles.removeAssignment(input.userId, role.id, vendorId);
    if (!removed) return fail(RbacError.notAssigned, { params: { slug: role.slug, vendorId } });

    await this.permissions.invalidate(input.userId);
    return ok(null);
  }

  // --- direct grants --------------------------------------------------------

  /**
   * Grant or deny one permission on one account.
   *
   * A denial is subject to the same rank and held-permission checks as a grant, which is
   * worth stating because the instinct is that taking something away should be easier than
   * giving it. It is not: a moderator who could deny `users:read` to a finance manager has
   * found a way to disable a colleague above them, and "it only removes" is no comfort to
   * the person locked out.
   */
  async setDirectGrant(
    actor: RbacActor,
    input: GrantPermissionInput,
  ): Promise<Result<UserPermissionRecord>> {
    const vendorId = input.vendorId ?? null;
    const expiresAt = input.expiresAt ?? null;

    const self = notSelf(actor, input.userId);
    if (!self.ok) return self;

    if (!isPermissionSlug(input.permissionSlug)) {
      return fail(RbacError.notInCatalogue, {
        path: 'input.permissionSlug',
        params: { permissions: [input.permissionSlug] },
      });
    }

    const grantable = canGrantPermissions(actor, [input.permissionSlug]);
    if (!grantable.ok) return grantable;

    const target = await this.highestRankOf(input.userId);
    const rank = canAdministerRank(actor, target);
    if (!rank.ok) return rank;

    const expiry = checkExpiry(expiresAt, this.clock.date());
    if (!expiry.ok) return fail(expiry.error.key, { path: 'input.expiresAt' });

    const permission = await this.roles.findPermissionBySlug(input.permissionSlug);
    if (!permission) {
      // In the catalogue but not in the table: the reconciliation has not run. Refusing is
      // right — the alternative is creating the row here, which would make every grant a
      // potential schema write and hide the fact that the platform was never synced.
      return fail(RbacError.unknownPermission, {
        path: 'input.permissionSlug',
        params: { slug: input.permissionSlug },
      });
    }

    const saved = await this.roles.upsertDirectGrant({
      id: this.ids.next('userPermission'),
      userId: input.userId,
      permissionId: permission.id,
      effect: input.effect,
      vendorId,
      grantedBy: actor.id,
      expiresAt,
    });

    await this.permissions.invalidate(input.userId);
    return ok(saved);
  }

  async removeDirectGrant(
    actor: RbacActor,
    input: { userId: string; permissionSlug: string; vendorId?: string | null },
  ): Promise<Result<null>> {
    const vendorId = input.vendorId ?? null;

    const self = notSelf(actor, input.userId);
    if (!self.ok) return self;

    const target = await this.highestRankOf(input.userId);
    const rank = canAdministerRank(actor, target);
    if (!rank.ok) return rank;

    const permission = await this.roles.findPermissionBySlug(input.permissionSlug);
    if (!permission) {
      return fail(RbacError.unknownPermission, { params: { slug: input.permissionSlug } });
    }

    const removed = await this.roles.removeDirectGrant(input.userId, permission.id, vendorId);
    if (!removed) return fail(RbacError.notAssigned, { params: { slug: input.permissionSlug } });

    await this.permissions.invalidate(input.userId);
    return ok(null);
  }

  // --- internals ------------------------------------------------------------

  /**
   * The target's highest rank, so acting on a *person* is bounded the same way acting on a
   * *role* is.
   *
   * Without it, direct grants would be the hole in the rank rule: a moderator cannot assign
   * the `finance-manager` role, but could hand a finance manager an extra permission — or
   * take one away — because no role is named in the operation. The subject of the check is
   * the account, so the rank has to come from the account.
   */
  private async highestRankOf(userId: string): Promise<number> {
    const resolved = await this.permissions.resolve(userId);
    return resolved ? highestRank(resolved.roles) : 0;
  }
}
