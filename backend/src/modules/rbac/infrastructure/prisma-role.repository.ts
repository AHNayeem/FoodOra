import { Injectable } from '@nestjs/common';

import { enumCodec, TransactionManager } from '../../../infrastructure/prisma';
import type { $Enums } from '../../../infrastructure/prisma/generated';
import type { UserRole } from '../../../shared/enums';
import type {
  NewRole,
  NewRoleAssignment,
  NewUserPermission,
  PermissionRecord,
  PermissionUpsert,
  RoleAssignmentRecord,
  RolePatch,
  RoleRecord,
  RoleRepositoryPort,
  UserPermissionRecord,
} from '../domain';
import { isPermissionSlug } from '../../../shared/permissions';

const roleSlugs = enumCodec<UserRole, $Enums.UserRoleSlug>('UserRoleSlug');

/** Role, plus the two things every caller wants with it. */
const ROLE_INCLUDE = {
  permissions: { select: { permission: { select: { slug: true } } } },
  _count: { select: { users: true } },
} as const;

interface RoleRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  builtin: string | null;
  isSystem: boolean;
  rank: number;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permission: { slug: string } }[];
  _count: { users: number };
}

/**
 * The write side of RBAC against Prisma.
 *
 * Two schema facts shape most of this file, and neither is obvious from the model
 * definitions:
 *
 * **`vendorId` is nullable inside a unique constraint.** Postgres treats NULLs as
 * distinct, so `@@unique([userId, roleId, vendorId])` does *not* prevent two
 * platform-wide assignments of the same role — the migration adds a partial unique index
 * for that case (see the comment on `UserRoleAssignment`). Because of it, every lookup here
 * uses `findFirst` with an explicit `vendorId: null` rather than Prisma's compound-unique
 * input, which cannot express a null member.
 *
 * **`Role` is soft-deletable and `slug` is unique across tombstones.** So deleting a custom
 * role and creating it again under the same slug would collide with a row the caller cannot
 * see. `createRole` therefore upserts and clears `deletedAt`, which turns "recreate" into
 * "restore and overwrite" — the behaviour an operator expects, and the only one that does
 * not require them to know what a tombstone is.
 */
@Injectable()
export class PrismaRoleRepository implements RoleRepositoryPort {
  constructor(private readonly transactions: TransactionManager) {}

  private get db() {
    return this.transactions.client;
  }

  // --- roles ----------------------------------------------------------------

  async listRoles(): Promise<RoleRecord[]> {
    const rows = await this.db.role.findMany({
      orderBy: [{ rank: 'asc' }, { name: 'asc' }],
      include: ROLE_INCLUDE,
    });
    return rows.map(toRole);
  }

  async findRole(id: string): Promise<RoleRecord | null> {
    const row = await this.db.role.findUnique({ where: { id }, include: ROLE_INCLUDE });
    return row ? toRole(row) : null;
  }

  async findRoleBySlug(slug: string): Promise<RoleRecord | null> {
    const row = await this.db.role.findUnique({ where: { slug }, include: ROLE_INCLUDE });
    return row ? toRole(row) : null;
  }

  /**
   * Create, or restore-and-overwrite a tombstone with the same slug.
   *
   * `isSystem` is never set here — only the reference-data script writes built-ins. A role
   * created through the API is a custom role by construction, which is what stops "create a
   * role called super-admin" from being an interesting idea.
   */
  async createRole(input: NewRole): Promise<RoleRecord> {
    const permissions = input.permissions.filter(isPermissionSlug);

    const row = await this.db.role.upsert({
      where: { slug: input.slug },
      create: {
        id: input.id,
        slug: input.slug,
        name: input.name,
        description: input.description,
        rank: input.rank,
        isSystem: false,
        permissions: { create: permissions.map((slug) => ({ permission: { connect: { slug } } })) },
      },
      update: {
        name: input.name,
        description: input.description,
        rank: input.rank,
        deletedAt: null,
        // A restored role starts from the requested set, not from whatever it carried
        // before it was deleted.
        permissions: {
          deleteMany: {},
          create: permissions.map((slug) => ({ permission: { connect: { slug } } })),
        },
      },
      include: ROLE_INCLUDE,
    });
    return toRole(row);
  }

  async updateRole(id: string, patch: RolePatch): Promise<RoleRecord> {
    const row = await this.db.role.update({ where: { id }, data: patch, include: ROLE_INCLUDE });
    return toRole(row);
  }

  async setRolePermissions(id: string, permissionSlugs: readonly string[]): Promise<RoleRecord> {
    // `RolePermission` carries no `deletedAt`, so a hard delete is correct here — the
    // extension only refuses one on soft-deletable models.
    const row = await this.db.role.update({
      where: { id },
      data: {
        permissions: {
          deleteMany: {},
          create: permissionSlugs
            .filter(isPermissionSlug)
            .map((slug) => ({ permission: { connect: { slug } } })),
        },
      },
      include: ROLE_INCLUDE,
    });
    return toRole(row);
  }

  async deleteRole(id: string): Promise<void> {
    await this.db.role.softDelete({ where: { id } });
  }

  async countRoleAssignments(id: string): Promise<number> {
    return this.db.userRoleAssignment.count({ where: { roleId: id } });
  }

  async listRoleHolders(id: string): Promise<string[]> {
    const rows = await this.db.userRoleAssignment.findMany({
      where: { roleId: id },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((row) => row.userId);
  }

  // --- permissions ----------------------------------------------------------

  async listPermissions(): Promise<PermissionRecord[]> {
    const rows = await this.db.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      select: { id: true, slug: true, resource: true, action: true, description: true },
    });
    return rows.map((row) => ({ ...row, inCatalogue: isPermissionSlug(row.slug) }));
  }

  async findPermissionBySlug(slug: string): Promise<PermissionRecord | null> {
    const row = await this.db.permission.findUnique({
      where: { slug },
      select: { id: true, slug: true, resource: true, action: true, description: true },
    });
    return row ? { ...row, inCatalogue: isPermissionSlug(row.slug) } : null;
  }

  /**
   * Create what is missing, refresh what has drifted, delete nothing.
   *
   * Split into a bulk insert and a per-row update rather than N upserts because the common
   * case by far is "nothing changed": one `findMany`, an empty `createMany`, no updates.
   * `skipDuplicates` covers two pods syncing at once.
   */
  async syncPermissions(definitions: readonly PermissionUpsert[]): Promise<number> {
    const existing = await this.db.permission.findMany({
      select: { id: true, slug: true, resource: true, action: true, description: true },
    });
    const bySlug = new Map(existing.map((row) => [row.slug, row]));

    const missing = definitions.filter((definition) => !bySlug.has(definition.slug));
    if (missing.length > 0) {
      await this.db.permission.createMany({ data: [...missing], skipDuplicates: true });
    }

    const drifted = definitions.filter((definition) => {
      const row = bySlug.get(definition.slug);
      return (
        row !== undefined &&
        (row.description !== definition.description ||
          row.resource !== definition.resource ||
          row.action !== definition.action)
      );
    });

    for (const definition of drifted) {
      await this.db.permission.update({
        where: { slug: definition.slug },
        data: {
          resource: definition.resource,
          action: definition.action,
          description: definition.description,
        },
      });
    }

    return missing.length + drifted.length;
  }

  // --- assignments ----------------------------------------------------------

  async listAssignments(userId: string): Promise<RoleAssignmentRecord[]> {
    const rows = await this.db.userRoleAssignment.findMany({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        roleId: true,
        vendorId: true,
        grantedAt: true,
        grantedBy: true,
        expiresAt: true,
        role: { select: { slug: true, name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      roleId: row.roleId,
      roleSlug: row.role.slug,
      roleName: row.role.name,
      vendorId: row.vendorId,
      grantedAt: row.grantedAt,
      grantedBy: row.grantedBy,
      expiresAt: row.expiresAt,
    }));
  }

  async findAssignment(
    userId: string,
    roleId: string,
    vendorId: string | null,
  ): Promise<RoleAssignmentRecord | null> {
    const rows = await this.listAssignments(userId);
    return rows.find((row) => row.roleId === roleId && row.vendorId === vendorId) ?? null;
  }

  async createAssignment(input: NewRoleAssignment): Promise<RoleAssignmentRecord> {
    const row = await this.db.userRoleAssignment.create({
      data: {
        id: input.id,
        userId: input.userId,
        roleId: input.roleId,
        vendorId: input.vendorId,
        grantedBy: input.grantedBy,
        expiresAt: input.expiresAt,
      },
      select: {
        id: true,
        userId: true,
        roleId: true,
        vendorId: true,
        grantedAt: true,
        grantedBy: true,
        expiresAt: true,
        role: { select: { slug: true, name: true } },
      },
    });
    return {
      id: row.id,
      userId: row.userId,
      roleId: row.roleId,
      roleSlug: row.role.slug,
      roleName: row.role.name,
      vendorId: row.vendorId,
      grantedAt: row.grantedAt,
      grantedBy: row.grantedBy,
      expiresAt: row.expiresAt,
    };
  }

  async removeAssignment(
    userId: string,
    roleId: string,
    vendorId: string | null,
  ): Promise<boolean> {
    const { count } = await this.db.userRoleAssignment.deleteMany({
      where: { userId, roleId, vendorId },
    });
    return count > 0;
  }

  // --- direct grants --------------------------------------------------------

  async listDirectGrants(userId: string): Promise<UserPermissionRecord[]> {
    const rows = await this.db.userPermission.findMany({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        permissionId: true,
        effect: true,
        vendorId: true,
        grantedAt: true,
        grantedBy: true,
        expiresAt: true,
        permission: { select: { slug: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      permissionId: row.permissionId,
      permissionSlug: row.permission.slug,
      effect: row.effect,
      vendorId: row.vendorId,
      grantedAt: row.grantedAt,
      grantedBy: row.grantedBy,
      expiresAt: row.expiresAt,
    }));
  }

  /**
   * Find-then-write rather than `upsert`, because the natural key contains a nullable
   * column: Prisma's compound-unique input cannot carry `vendorId: null`, and
   * `findFirst` + `update`-by-id expresses the same intent without pretending otherwise.
   *
   * Flipping a grant to a denial is an update of `effect`, not a second row — which is what
   * makes "deny what a role grants" a single toggle in the admin matrix rather than a pair
   * of rows whose interaction the operator has to reason about.
   */
  async upsertDirectGrant(input: NewUserPermission): Promise<UserPermissionRecord> {
    const existing = await this.db.userPermission.findFirst({
      where: {
        userId: input.userId,
        permissionId: input.permissionId,
        vendorId: input.vendorId,
      },
      select: { id: true },
    });

    const select = {
      id: true,
      userId: true,
      permissionId: true,
      effect: true,
      vendorId: true,
      grantedAt: true,
      grantedBy: true,
      expiresAt: true,
      permission: { select: { slug: true } },
    } as const;

    const row = existing
      ? await this.db.userPermission.update({
          where: { id: existing.id },
          data: {
            effect: input.effect,
            grantedBy: input.grantedBy,
            grantedAt: new Date(),
            expiresAt: input.expiresAt,
          },
          select,
        })
      : await this.db.userPermission.create({
          data: {
            id: input.id,
            userId: input.userId,
            permissionId: input.permissionId,
            effect: input.effect,
            vendorId: input.vendorId,
            grantedBy: input.grantedBy,
            expiresAt: input.expiresAt,
          },
          select,
        });

    return {
      id: row.id,
      userId: row.userId,
      permissionId: row.permissionId,
      permissionSlug: row.permission.slug,
      effect: row.effect,
      vendorId: row.vendorId,
      grantedAt: row.grantedAt,
      grantedBy: row.grantedBy,
      expiresAt: row.expiresAt,
    };
  }

  async removeDirectGrant(
    userId: string,
    permissionId: string,
    vendorId: string | null,
  ): Promise<boolean> {
    const { count } = await this.db.userPermission.deleteMany({
      where: { userId, permissionId, vendorId },
    });
    return count > 0;
  }
}

function toRole(row: RoleRow): RoleRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    builtin: row.builtin === null ? null : roleSlugs.toWire(row.builtin),
    isSystem: row.isSystem,
    rank: row.rank,
    permissions: row.permissions.map((link) => link.permission.slug),
    assignedCount: row._count.users,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
