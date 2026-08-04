import { Injectable, Logger } from '@nestjs/common';

import { IdService } from '../../../common/ids';
import { enumCodec, TransactionManager } from '../../../infrastructure/prisma';
import type { $Enums } from '../../../infrastructure/prisma/generated';
import type { UserRole, UserStatus } from '../../../shared/enums';
import type {
  AdminProfilePatch,
  UserFilter,
  UserPage,
  UserProfile,
  UserRepositoryPort,
  UserSortKey,
} from '../domain';

const roleSlugs = enumCodec<UserRole, $Enums.UserRoleSlug>('UserRoleSlug');
const statuses = enumCodec<UserStatus, $Enums.UserStatus>('UserStatus');

const USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatar: true,
  primaryRole: true,
  status: true,
  countryCode: true,
  currency: true,
  locale: true,
  timezone: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  isVerified: true,
  lastLoginAt: true,
  marketingOptIn: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

/** Written out rather than inferred, so adding a column to the select without adding it
 * here is a type error rather than a silently dropped field. */
interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string;
  primaryRole: string;
  status: string;
  countryCode: string;
  currency: string;
  locale: string;
  timezone: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  isVerified: boolean;
  lastLoginAt: Date | null;
  marketingOptIn: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Closed sort options, each backed by an index (D5 §Filtering & sorting). */
const ORDER_BY: Record<UserSortKey, Array<Record<string, 'asc' | 'desc'>>> = {
  newest: [{ createdAt: 'desc' }],
  oldest: [{ createdAt: 'asc' }],
  name: [{ name: 'asc' }],
  // Nulls sort last in Postgres for DESC, so accounts that have never signed in fall to the
  // end — which is what "most recently active first" should mean.
  lastLogin: [{ lastLoginAt: 'desc' }],
};

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  private readonly logger = new Logger(PrismaUserRepository.name);

  constructor(
    private readonly transactions: TransactionManager,
    private readonly ids: IdService,
  ) {}

  private get db() {
    return this.transactions.client;
  }

  async findById(userId: string, includeDeleted = false): Promise<UserProfile | null> {
    /**
     * `findFirst` with an explicit `deletedAt` rather than `findUnique`.
     *
     * Naming `deletedAt` in a `where` is what opts out of the soft-delete filter (see
     * `soft-delete.extension.ts`), and `findUnique` cannot carry a non-unique predicate — the
     * extension handles that case by *checking the result*, which means it always returns null
     * for a tombstone and there is no way to ask for one. `findFirst` can.
     */
    const row = includeDeleted
      ? await this.db.user.findFirst({
          where: { id: userId, deletedAt: undefined },
          select: USER_FIELDS,
        })
      : await this.db.user.findUnique({ where: { id: userId }, select: USER_FIELDS });

    return row ? toProfile(row) : null;
  }

  /**
   * The directory.
   *
   * The `where` is built here and only here — the allowlist *is* this function, so a field the
   * client sends that this does not mention is unreachable rather than dangerous
   * (D5 §Filtering & sorting).
   *
   * `q` searches name, email and phone with `contains`. That is a sequential scan on a large
   * table and it is the honest thing to ship now: the trigram indexes that make it fast are
   * part of the search work in D5 §Search, and pretending otherwise by omitting the filter
   * would leave the admin screen without the one thing it is used for.
   */
  async list(
    filter: UserFilter,
    sort: UserSortKey,
    window: { skip: number; take: number; page: number; pageSize: number },
  ): Promise<UserPage> {
    const where: Record<string, unknown> = {};

    if (filter.includeDeleted) where.deletedAt = undefined;
    if (filter.role) where.primaryRole = roleSlugs.toDb(filter.role);
    if (filter.status) where.status = statuses.toDb(filter.status);
    if (filter.countryCode) where.countryCode = filter.countryCode.toUpperCase();
    if (filter.isVerified !== null && filter.isVerified !== undefined) {
      where.isVerified = filter.isVerified;
    }

    const q = filter.q?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q } }, // `citext`, so already case-insensitive.
        { phone: { contains: q } },
      ];
    }

    const [items, total] = await Promise.all([
      this.db.user.findMany({
        where,
        orderBy: ORDER_BY[sort],
        skip: window.skip,
        take: window.take,
        select: USER_FIELDS,
      }),
      this.db.user.count({ where }),
    ]);

    return {
      items: items.map(toProfile),
      total,
      page: window.page,
      pageSize: window.pageSize,
      hasMore: window.page * window.pageSize < total,
    };
  }

  /**
   * A profile edit.
   *
   * `undefined` means "leave alone" and Prisma already treats it that way, so the patch maps
   * across almost verbatim. The exception is `phone`: a new number invalidates its own
   * verification, because `phoneVerifiedAt` and `isVerified` describe a channel that has been
   * *proved*, and nobody has proved this one.
   */
  async updateProfile(userId: string, patch: AdminProfilePatch): Promise<UserProfile> {
    const phoneChanged = patch.phone !== undefined;

    const row = await this.db.user.update({
      where: { id: userId },
      data: {
        name: patch.name,
        phone: patch.phone,
        avatar: patch.avatar,
        locale: patch.locale,
        currency: patch.currency,
        timezone: patch.timezone,
        marketingOptIn: patch.marketingOptIn,
        countryCode: patch.countryCode,
        ...(phoneChanged ? { phoneVerifiedAt: null } : {}),
      },
      select: USER_FIELDS,
    });

    /**
     * `isVerified` is derived from the two timestamps, so it is recomputed rather than patched
     * — the flag is denormalised and the only way it stays honest is by never being written
     * independently of what it summarises. Done as a second statement because the first one's
     * result is what the recomputation needs.
     */
    if (phoneChanged) {
      const isVerified = row.emailVerifiedAt !== null || row.phoneVerifiedAt !== null;
      if (isVerified !== row.isVerified) {
        const corrected = await this.db.user.update({
          where: { id: userId },
          data: { isVerified },
          select: USER_FIELDS,
        });
        return toProfile(corrected);
      }
    }

    return toProfile(row);
  }

  /**
   * Availability, not visibility — so this sees tombstones.
   *
   * The unique index covers soft-deleted rows, so "no live account has this phone" is the wrong
   * question: the write would fail on the constraint anyway, and the caller would get a generic
   * "already exists" instead of `errors.phoneTaken` on the right form field. Same reasoning as
   * E2's `emailTaken`.
   */
  async phoneTaken(phone: string, exceptUserId: string): Promise<boolean> {
    const count = await this.db.user.count({
      where: { phone, deletedAt: undefined, id: { not: exceptUserId } },
    });
    return count > 0;
  }

  async setStatus(userId: string, status: UserStatus): Promise<UserProfile> {
    const row = await this.db.user.update({
      where: { id: userId },
      data: { status: statuses.toDb(status) },
      select: USER_FIELDS,
    });
    return toProfile(row);
  }

  /**
   * `User.primaryRole` **and** the mirroring `UserRoleAssignment` row.
   *
   * They are one fact seen from two places: the column backs the frontend's `User.role` and the
   * `@Roles()` gate, the assignment row is where the role's *permissions* hang off. Writing only
   * the column would give the account a role that carries nothing; writing only the row would
   * leave the frontend showing the old one.
   *
   * The old primary role's platform-wide assignment is removed and the new one added. Only the
   * platform-wide row (`vendorId: null`) — a vendor-scoped assignment of the same role is a
   * different grant about a different thing, and changing somebody's primary role should not
   * quietly remove their managership of a branch.
   */
  async setPrimaryRole(userId: string, role: UserRole): Promise<UserProfile> {
    const current = await this.db.user.findUnique({
      where: { id: userId },
      select: { primaryRole: true },
    });

    const row = await this.db.user.update({
      where: { id: userId },
      data: { primaryRole: roleSlugs.toDb(role) },
      select: USER_FIELDS,
    });

    if (current) {
      const previous = roleSlugs.toWire(current.primaryRole);
      if (previous !== role) {
        const previousRole = await this.db.role.findUnique({
          where: { slug: previous },
          select: { id: true },
        });
        if (previousRole) {
          await this.db.userRoleAssignment.deleteMany({
            where: { userId, roleId: previousRole.id, vendorId: null },
          });
        }
      }
    }

    const nextRole = await this.db.role.findUnique({ where: { slug: role }, select: { id: true } });
    if (!nextRole) {
      /**
       * The role catalogue has not been seeded. Warned rather than failed, for the same reason
       * E2's `assignPrimaryRole` does: `resolveAuthorization` treats `primaryRole` as
       * authoritative whether or not an assignment row backs it, so the role gate works and only
       * the *permission* set is missing. Failing here would make role administration impossible
       * on a fresh database for a reason that has nothing to do with role administration.
       */
      this.logger.warn(
        `No Role row for "${role}" — ${userId}'s primary role was set without an assignment. ` +
          'Run `bun run seed:reference` for permissions to resolve.',
      );
      return toProfile(row);
    }

    const existing = await this.db.userRoleAssignment.findFirst({
      where: { userId, roleId: nextRole.id, vendorId: null },
      select: { id: true },
    });
    if (!existing) {
      await this.db.userRoleAssignment.create({
        data: {
          id: this.ids.next('roleAssignment'),
          userId,
          roleId: nextRole.id,
          vendorId: null,
        },
      });
    }

    return toProfile(row);
  }

  async close(userId: string): Promise<boolean> {
    const { count } = (await this.db.user.softDelete({ where: { id: userId } })) as {
      count: number;
    };
    return count > 0;
  }

  async reopen(userId: string): Promise<boolean> {
    const { count } = (await this.db.user.restore({ where: { id: userId } })) as { count: number };
    return count > 0;
  }
}

function toProfile(row: UserRow): UserProfile {
  return {
    ...row,
    primaryRole: roleSlugs.toWire(row.primaryRole),
    status: statuses.toWire(row.status),
  };
}
