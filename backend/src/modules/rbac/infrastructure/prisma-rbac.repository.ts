import { Injectable } from '@nestjs/common';

import { enumCodec, TransactionManager } from '../../../infrastructure/prisma';
import type { $Enums } from '../../../infrastructure/prisma/generated';
import type { UserRole, UserStatus } from '../../../shared/enums';
import type { DirectGrant, RbacFacts, RbacRepositoryPort, RoleGrant } from '../domain';

const roleSlugs = enumCodec<UserRole, $Enums.UserRoleSlug>('UserRoleSlug');
const statuses = enumCodec<UserStatus, $Enums.UserStatus>('UserStatus');

/**
 * One query for the whole picture.
 *
 * Nested `include`s rather than three round trips: this runs on every
 * authenticated request that misses the cache, so the difference between one
 * statement and three is the difference between a 1 ms and a 3 ms floor on the
 * entire API. `relationJoins` (enabled in the generator) makes Prisma emit it as
 * a single `LEFT JOIN LATERAL` rather than as separate `IN` queries.
 *
 * Expiry is **not** filtered here — the rows come back whole and the pure
 * resolver decides, against an injected clock. See `RbacRepositoryPort`.
 */
@Injectable()
export class PrismaRbacRepository implements RbacRepositoryPort {
  constructor(private readonly transactions: TransactionManager) {}

  async factsFor(userId: string): Promise<RbacFacts | null> {
    const user = await this.transactions.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        primaryRole: true,
        roles: {
          select: {
            vendorId: true,
            expiresAt: true,
            role: {
              select: {
                slug: true,
                permissions: { select: { permission: { select: { slug: true } } } },
              },
            },
          },
        },
        permissionGrants: {
          select: {
            effect: true,
            vendorId: true,
            expiresAt: true,
            permission: { select: { slug: true } },
          },
        },
      },
    });

    // The soft-delete extension already excludes tombstoned users, so `null`
    // here covers both "never existed" and "deleted".
    if (!user) return null;

    const roleGrants: RoleGrant[] = user.roles.map((assignment) => ({
      roleSlug: assignment.role.slug,
      vendorId: assignment.vendorId,
      expiresAt: assignment.expiresAt,
      permissions: assignment.role.permissions.map((link) => link.permission.slug),
    }));

    const directGrants: DirectGrant[] = user.permissionGrants.map((grant) => ({
      permissionSlug: grant.permission.slug,
      effect: grant.effect,
      vendorId: grant.vendorId,
      expiresAt: grant.expiresAt,
    }));

    return {
      userId: user.id,
      status: statuses.toWire(user.status),
      primaryRole: roleSlugs.toWire(user.primaryRole),
      roleGrants,
      directGrants,
    };
  }
}
