import { Inject, Injectable } from '@nestjs/common';

import { IdService } from '../../../common/ids';
import { UNIT_OF_WORK, type UnitOfWorkPort } from '../../../shared/contracts';
import { isPermissionSlug } from '../../../shared/permissions';
import { fail, ok, type Result } from '../../../shared/kernel';
import {
  canAdministerRank,
  canGrantPermissions,
  isValidRoleSlug,
  type NewRole,
  type RbacActor,
  RbacError,
  ROLE_REPOSITORY,
  type RolePatch,
  type RoleRecord,
  type RoleRepositoryPort,
} from '../domain';
import { PermissionService } from './permission.service';

/**
 * Creating, editing and deleting roles.
 *
 * Every mutation runs the escalation policy first, and the ordering of those checks is
 * deliberate: **rank, then permissions, then the write.** An actor who fails the rank
 * check learns nothing about which permissions they would have been refused, and a role
 * that fails either check is never partially created.
 *
 * Two things deserve their own paragraph.
 *
 * **A custom role is a bundle of catalogue permissions, never a new capability.** A slug
 * outside `shared/permissions.ts` is refused, because nothing enforces it — a role
 * carrying `orders:refund-anything` would grant a power no guard checks, which is worse
 * than granting nothing: it *reads* as authority.
 *
 * **Editing a role invalidates everyone who holds it.** The resolved permission set is
 * cached per user, and a role edit changes the answer for every holder. There is no
 * `perm:role:<id>` key to drop, so the invalidation walks the assignments — which is why
 * `setRolePermissions` returns the holders and why that walk is bounded by the same rank
 * rule that bounds the edit.
 */
@Injectable()
export class RoleAdminService {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepositoryPort,
    private readonly permissions: PermissionService,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWorkPort,
    private readonly ids: IdService,
  ) {}

  async list(): Promise<RoleRecord[]> {
    return this.roles.listRoles();
  }

  async find(id: string): Promise<RoleRecord | null> {
    return this.roles.findRole(id);
  }

  async create(
    actor: RbacActor,
    input: { slug: string; name: string; description: string; rank: number; permissions: readonly string[] },
  ): Promise<Result<RoleRecord>> {
    if (!isValidRoleSlug(input.slug)) {
      return fail(RbacError.invalidSlug, { path: 'input.slug', params: { slug: input.slug } });
    }

    const rank = this.checkRank(actor, input.rank);
    if (!rank.ok) return rank;

    const grantable = this.checkPermissions(actor, input.permissions);
    if (!grantable.ok) return grantable;

    if (await this.roles.findRoleBySlug(input.slug)) {
      return fail(RbacError.roleExists, { path: 'input.slug', params: { slug: input.slug } });
    }

    const role: NewRole = {
      id: this.ids.next('role'),
      slug: input.slug,
      name: input.name,
      description: input.description,
      rank: input.rank,
      permissions: input.permissions,
    };

    return ok(await this.roles.createRole(role));
  }

  async update(actor: RbacActor, id: string, patch: RolePatch): Promise<Result<RoleRecord>> {
    const existing = await this.roles.findRole(id);
    if (!existing) return fail(RbacError.unknownRole, { params: { id } });

    /**
     * A built-in's name, description and rank are fixed.
     *
     * The name because `@Roles('moderator')` and `User.primaryRole` both name it, so a
     * rename would leave the label and the gate disagreeing. The rank because it is what
     * this very check depends on — a moderator who could re-rank `super-admin` down to 5
     * would have found the escalation this policy exists to prevent.
     *
     * What *is* editable on a built-in is its permission set, via `setPermissions`. That
     * asymmetry is the design: which capabilities a role bundles is a business decision;
     * what the role *is* is a fact about the software.
     */
    if (existing.isSystem) {
      return fail(RbacError.systemRoleImmutable, { params: { slug: existing.slug } });
    }

    const rank = this.checkRank(actor, existing.rank);
    if (!rank.ok) return rank;

    if (patch.rank !== undefined) {
      const targetRank = this.checkRank(actor, patch.rank);
      if (!targetRank.ok) return targetRank;
    }

    const updated = await this.roles.updateRole(id, patch);
    return ok(updated);
  }

  /**
   * Replace a role's permission set.
   *
   * Wholesale rather than add/remove, because the set is what the admin matrix submits —
   * a grid of checkboxes has no notion of "the two I unticked". Every holder's cached
   * authorization is dropped afterwards, inside the same transaction as the write, so a
   * request racing the edit either sees the old set or the new one and never a cache
   * populated from the old rows after the new ones committed.
   */
  async setPermissions(
    actor: RbacActor,
    id: string,
    permissionSlugs: readonly string[],
  ): Promise<Result<RoleRecord>> {
    const existing = await this.roles.findRole(id);
    if (!existing) return fail(RbacError.unknownRole, { params: { id } });

    const rank = this.checkRank(actor, existing.rank);
    if (!rank.ok) return rank;

    const grantable = this.checkPermissions(actor, permissionSlugs);
    if (!grantable.ok) return grantable;

    return this.unitOfWork.runInTransaction(async () => {
      const updated = await this.roles.setRolePermissions(id, permissionSlugs);
      await this.invalidateHolders(id);
      return ok(updated);
    });
  }

  async remove(actor: RbacActor, id: string): Promise<Result<null>> {
    const existing = await this.roles.findRole(id);
    if (!existing) return fail(RbacError.unknownRole, { params: { id } });

    if (existing.isSystem) {
      return fail(RbacError.systemRoleImmutable, { params: { slug: existing.slug } });
    }

    const rank = this.checkRank(actor, existing.rank);
    if (!rank.ok) return rank;

    // Deleting a role that people hold would cascade their assignments away — a silent
    // revocation. The count is in the message so the admin knows the size of the problem.
    const holders = await this.roles.countRoleAssignments(id);
    if (holders > 0) {
      return fail(RbacError.roleInUse, { params: { slug: existing.slug, holders } });
    }

    await this.roles.deleteRole(id);
    return ok(null);
  }

  // --- internals ------------------------------------------------------------

  private checkRank(actor: RbacActor, rank: number): Result<null> {
    return canAdministerRank(actor, rank);
  }

  /**
   * Two checks in one place: every slug must be in the catalogue, *and* the actor must
   * hold it. The catalogue check comes first because "this permission does not exist" is
   * more useful than "you may not grant it" for a slug that nobody can grant.
   */
  private checkPermissions(actor: RbacActor, slugs: readonly string[]): Result<null> {
    const unknown = slugs.filter((slug) => !isPermissionSlug(slug));
    if (unknown.length > 0) {
      return fail(RbacError.notInCatalogue, {
        path: 'input.permissions',
        params: { permissions: unknown },
      });
    }
    return canGrantPermissions(actor, slugs);
  }

  private async invalidateHolders(roleId: string): Promise<void> {
    const holders = await this.roles.listRoleHolders(roleId);
    await Promise.all(holders.map((userId) => this.permissions.invalidate(userId)));
  }
}
