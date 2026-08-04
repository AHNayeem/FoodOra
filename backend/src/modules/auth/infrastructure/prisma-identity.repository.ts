import { Injectable, Logger } from '@nestjs/common';

import { IdService } from '../../../common/ids';
import { enumCodec, TransactionManager } from '../../../infrastructure/prisma';
import type { $Enums } from '../../../infrastructure/prisma/generated';
import type {
  DevicePlatform,
  SessionRevokeReason,
  UserRole,
  UserStatus,
} from '../../../shared/enums';
import {
  type AuthUser,
  type CredentialRecord,
  type DeviceHint,
  type DeviceRecord,
  type IdentityRepositoryPort,
  type NewAccount,
  UNUSABLE_PASSWORD_HASH,
} from '../domain';

const roleSlugs = enumCodec<UserRole, $Enums.UserRoleSlug>('UserRoleSlug');
const statuses = enumCodec<UserStatus, $Enums.UserStatus>('UserStatus');
const platforms = enumCodec<DevicePlatform, $Enums.DevicePlatform>('DevicePlatform');

/** Enough of the row to build an `AuthUser`, and nothing more — never the hash. */
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

/**
 * The shape `USER_FIELDS` selects. Written out rather than inferred so the mapper
 * below needs no casts — and so adding a column to the select without adding it here
 * is a type error rather than a silently dropped field.
 */
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

/**
 * `User`, `Credential` and `Device`.
 *
 * The only file in the module that knows Prisma exists, which is what makes the
 * mapping between `RESTAURANT_OWNER` and `restaurant-owner` a single-layer concern
 * (see `enum-codec.ts`).
 *
 * Nothing here opens a transaction: `this.transactions.client` is the transaction's
 * client when one is open and the plain one otherwise, so the same method works
 * standalone and as one step of a five-write registration (D1 §Transactions).
 */
@Injectable()
export class PrismaIdentityRepository implements IdentityRepositoryPort {
  private readonly logger = new Logger(PrismaIdentityRepository.name);

  constructor(
    private readonly transactions: TransactionManager,
    private readonly ids: IdService,
  ) {}

  private get db() {
    return this.transactions.client;
  }

  async findById(userId: string): Promise<AuthUser | null> {
    const row = await this.db.user.findUnique({ where: { id: userId }, select: USER_FIELDS });
    return row ? toAuthUser(row) : null;
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    // `email` is `citext`, so the unique index is already case-insensitive and this
    // needs no `lower()` — the whole reason for that column type.
    const row = await this.db.user.findUnique({ where: { email }, select: USER_FIELDS });
    return row ? toAuthUser(row) : null;
  }

  async findByPhone(phone: string): Promise<AuthUser | null> {
    const row = await this.db.user.findUnique({ where: { phone }, select: USER_FIELDS });
    return row ? toAuthUser(row) : null;
  }

  /**
   * Availability, not visibility — so these two deliberately **see tombstones**.
   *
   * The unique index still covers a soft-deleted row, so "nobody active has this
   * email" is the wrong question: creating the account would fail on the constraint
   * anyway, and the caller would get `errors.alreadyExists` from a Prisma error
   * instead of `errors.emailTaken` on the right form field.
   *
   * Naming `deletedAt` at all is what opts out of the soft-delete filter — see the
   * header of `soft-delete.extension.ts`.
   */
  async emailTaken(email: string): Promise<boolean> {
    const count = await this.db.user.count({ where: { email, deletedAt: undefined } });
    return count > 0;
  }

  async phoneTaken(phone: string): Promise<boolean> {
    const count = await this.db.user.count({ where: { phone, deletedAt: undefined } });
    return count > 0;
  }

  /**
   * The account and everything that makes it usable, in one act.
   *
   * `UserSettings` is created here rather than lazily because every read of it would
   * otherwise need a null branch, and the defaults are in the schema.
   */
  async createAccount(input: NewAccount): Promise<AuthUser> {
    const row = await this.db.user.create({
      data: {
        id: input.id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        primaryRole: roleSlugs.toDb(input.primaryRole),
        status: statuses.toDb(input.status),
        countryCode: input.countryCode,
        currency: input.currency,
        locale: input.locale,
        timezone: input.timezone,
        emailVerifiedAt: input.emailVerifiedAt,
        phoneVerifiedAt: input.phoneVerifiedAt,
        isVerified: input.emailVerifiedAt !== null || input.phoneVerifiedAt !== null,
        marketingOptIn: input.marketingOptIn,
        credential: input.passwordHash
          ? { create: { passwordHash: input.passwordHash, algorithm: 'argon2id' } }
          : undefined,
        settings: { create: {} },
      },
      select: USER_FIELDS,
    });

    await this.assignPrimaryRole(input.id, input.primaryRole, input.roleAssignmentId);
    return toAuthUser(row);
  }

  /**
   * Mirrors `primaryRole` into `UserRoleAssignment`, which is where the permissions
   * hang off.
   *
   * **Skipped, with a warning, when the `Role` row does not exist yet.** The role
   * catalogue is seeded by E3/E12, and until then this FK cannot be satisfied —
   * failing registration over it would make the auth module unusable on a fresh
   * database for a reason that has nothing to do with authentication. The account
   * still works: `resolveAuthorization` treats `primaryRole` as authoritative
   * regardless of whether an assignment row backs it, which is exactly the
   * deviation documented there. What is missing until the seed runs is the
   * *permission* set, and a role gate does not depend on it.
   */
  private async assignPrimaryRole(
    userId: string,
    role: UserRole,
    assignmentId: string,
  ): Promise<void> {
    const roleRow = await this.db.role.findUnique({ where: { slug: role }, select: { id: true } });
    if (!roleRow) {
      this.logger.warn(
        `No Role row for "${role}" — created ${userId} without a role assignment. ` +
          'Seed the role catalogue (E3) for permissions to resolve.',
      );
      return;
    }

    await this.db.userRoleAssignment.create({
      data: { id: assignmentId, userId, roleId: roleRow.id, vendorId: null },
    });
  }

  /**
   * `null` for an account with no usable password — which reads the same to every
   * caller as having no credential row at all, and is what stops the sentinel hash
   * from ever reaching a verification.
   */
  async findCredential(userId: string): Promise<CredentialRecord | null> {
    const row = await this.db.credential.findUnique({ where: { userId } });
    if (!row || row.passwordHash === UNUSABLE_PASSWORD_HASH) return null;

    return {
      userId: row.userId,
      passwordHash: row.passwordHash,
      algorithm: row.algorithm,
      tokenEpoch: row.tokenEpoch,
      failedCount: row.failedCount,
      lockedUntil: row.lockedUntil,
      changedAt: row.changedAt,
    };
  }

  async incrementFailedCount(userId: string): Promise<number> {
    const row = await this.db.credential.update({
      where: { userId },
      data: { failedCount: { increment: 1 } },
      select: { failedCount: true },
    });
    return row.failedCount;
  }

  async applyLock(userId: string, lockedUntil: Date | null): Promise<void> {
    await this.db.credential.update({ where: { userId }, data: { lockedUntil } });
  }

  async clearFailures(userId: string): Promise<void> {
    // `updateMany` rather than `update`: called on every successful sign-in,
    // including for accounts that have no credential row, where `update` would
    // throw P2025 for a no-op.
    await this.db.credential.updateMany({
      where: { userId },
      data: { failedCount: 0, lockedUntil: null },
    });
  }

  /**
   * New hash **and** a bumped epoch, in one statement — two statements would leave a
   * window where the old password was gone and the old tokens were still live.
   *
   * `upsert`, because a password can be *set* on an account that never had one (a
   * phone-first account completing a reset). The created row starts at epoch 1, not
   * 0: tokens minted under the implicit 0 have to die too.
   */
  async setPassword(userId: string, passwordHash: string, algorithm: string): Promise<number> {
    const row = await this.db.credential.upsert({
      where: { userId },
      create: { userId, passwordHash, algorithm, tokenEpoch: 1, changedAt: new Date() },
      update: {
        passwordHash,
        algorithm,
        tokenEpoch: { increment: 1 },
        changedAt: new Date(),
        failedCount: 0,
        lockedUntil: null,
      },
      select: { tokenEpoch: true },
    });
    return row.tokenEpoch;
  }

  async rehashPassword(userId: string, passwordHash: string, algorithm: string): Promise<void> {
    // Note the absence of a `tokenEpoch` bump. See the port's doc comment.
    await this.db.credential.update({ where: { userId }, data: { passwordHash, algorithm } });
  }

  async bumpTokenEpoch(userId: string): Promise<number> {
    const row = await this.db.credential.upsert({
      where: { userId },
      // The sentinel: this account has no password, but it now has an epoch, which
      // is what "sign out everywhere" needs to be able to move.
      create: { userId, passwordHash: UNUSABLE_PASSWORD_HASH, algorithm: 'none', tokenEpoch: 1 },
      update: { tokenEpoch: { increment: 1 } },
      select: { tokenEpoch: true },
    });
    return row.tokenEpoch;
  }

  /** `0` for an account that has never had a credential row — the implicit epoch. */
  async currentTokenEpoch(userId: string): Promise<number> {
    const row = await this.db.credential.findUnique({
      where: { userId },
      select: { tokenEpoch: true },
    });
    return row?.tokenEpoch ?? 0;
  }

  async recordLogin(userId: string, at: Date): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { lastLoginAt: at } });
  }

  /**
   * Verification of either channel sets `isVerified`, in the same write.
   *
   * That is what keeps the denormalised flag honest: it is never computed in one
   * place and stored in another.
   */
  async markEmailVerified(userId: string, at: Date): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: at, isVerified: true, status: statuses.toDb('active') },
    });
  }

  async markPhoneVerified(userId: string, at: Date): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { phoneVerifiedAt: at, isVerified: true, status: statuses.toDb('active') },
    });
  }

  /**
   * Upsert on `(userId, installId)`, reporting whether the pair is new.
   *
   * "New" is decided by whether a row existed, not by comparing user-agent strings —
   * which would announce a new device on every browser update and train the user to
   * ignore the alert.
   */
  async upsertDevice(
    userId: string,
    hint: DeviceHint,
    at: Date,
  ): Promise<DeviceRecord | null> {
    // No install id means no identity. Minting one per request would fill the table
    // with single-use rows and make every sign-in look like a new device.
    if (!hint.installId) return null;

    const existing = await this.db.device.findUnique({
      where: { userId_installId: { userId, installId: hint.installId } },
      select: { id: true },
    });

    const row = await this.db.device.upsert({
      where: { userId_installId: { userId, installId: hint.installId } },
      create: {
        id: this.ids.next('device'),
        userId,
        installId: hint.installId,
        platform: platforms.toDb(hint.platform ?? 'web'),
        name: hint.name ?? null,
        model: hint.model ?? null,
        appVersion: hint.appVersion ?? null,
        pushToken: hint.pushToken ?? null,
        pushEnabled: Boolean(hint.pushToken),
        lastSeenAt: at,
      },
      update: {
        platform: platforms.toDb(hint.platform ?? 'web'),
        name: hint.name ?? undefined,
        model: hint.model ?? undefined,
        appVersion: hint.appVersion ?? undefined,
        // Only overwrite the push token when one was offered: a web sign-in with no
        // push permission must not clear the registration a mobile sign-in made.
        pushToken: hint.pushToken ?? undefined,
        pushEnabled: hint.pushToken ? true : undefined,
        lastSeenAt: at,
        // A device that comes back was not removed after all.
        revokedAt: null,
      },
      select: { id: true, installId: true, platform: true, name: true, lastSeenAt: true },
    });

    return {
      id: row.id,
      userId,
      installId: row.installId,
      platform: platforms.toWire(row.platform),
      name: row.name,
      lastSeenAt: row.lastSeenAt,
      isNew: existing === null,
    };
  }

  async revokeDevice(
    userId: string,
    deviceId: string,
    reason: SessionRevokeReason,
    at: Date,
  ): Promise<boolean> {
    void reason; // Recorded on the sessions, which is where a reason is readable.
    const { count } = await this.db.device.updateMany({
      // Scoped by `userId` in the predicate, not checked afterwards: someone else's
      // device id reads as "not found" rather than as a refusal that confirms it.
      where: { id: deviceId, userId, revokedAt: null },
      data: { revokedAt: at, pushToken: null, pushEnabled: false },
    });
    return count > 0;
  }
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    ...row,
    primaryRole: roleSlugs.toWire(row.primaryRole),
    status: statuses.toWire(row.status),
  };
}
