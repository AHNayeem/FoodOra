/**
 * repository.js — every database statement the auth module makes.
 *
 * The split from `service.js` is not ceremony: the service decides *what should
 * happen* (is this password right, has this chain been reused, may this account
 * sign in) and this decides *how the row is written*. Keeping them apart is what
 * makes the security rules in the service readable without Prisma noise between
 * them, and what keeps every `select` on `credentials` in one file where it can
 * be checked at a glance that a hash never joins a read model.
 *
 * Three conventions hold throughout:
 *
 *  - **`prisma` is the extended client** from `plugins/prisma.js`, so every read
 *    of `User` already carries `deletedAt: null`. A soft-deleted account is
 *    simply not found, which is exactly the answer sign-in should give it.
 *  - **Ids are minted here, never defaulted.** `main.prisma` §1: no column has a
 *    generating default.
 *  - **Enum values are translated on the way in.** The client speaks
 *    `RESTAURANT_OWNER`; everything above this file speaks `restaurant-owner`.
 *    `toDbEnum` is the only thing that knows the difference.
 */
import { isIP } from "node:net";
import { ID_PREFIXES } from "../../shared/constants/id-prefixes.js";
import { newId } from "../../shared/utils/ids.js";
import { toDbEnum } from "../../shared/utils/enums.js";

/**
 * The columns a read model is built from. Written out rather than spread,
 * because `select: undefined` on `User` returns every column and the day
 * somebody adds a sensitive one to that table is the day it starts leaking.
 */
export const USER_SELECT = Object.freeze({
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
  isVerified: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

/** `Session.ip` is `inet`; anything that is not an address is stored as null. */
const inet = (value) => (typeof value === "string" && isIP(value) ? value : null);

/** `Session.userAgent` / `LoginAttempt.userAgent` are `VarChar(400)`. */
const ua = (value) => (typeof value === "string" ? value.slice(0, 400) : null);

export function createRepository(prisma) {
  return {
    // -------------------------------------------------------------------------
    // Accounts
    // -------------------------------------------------------------------------

    /** By email, with the credential — the sign-in read. */
    findByEmailWithCredential: (email) =>
      prisma.user.findFirst({
        where: { email },
        select: { ...USER_SELECT, credential: { select: { passwordHash: true, failedCount: true, lockedUntil: true, tokenEpoch: true } } },
      }),

    findByPhone: (phone) => prisma.user.findFirst({ where: { phone }, select: USER_SELECT }),

    findById: (id) => prisma.user.findUnique({ where: { id }, select: USER_SELECT }),

    /** The read `requireUser` does on every authenticated request. */
    findByIdWithEpoch: (id) =>
      prisma.user.findUnique({
        where: { id },
        select: { ...USER_SELECT, credential: { select: { tokenEpoch: true } } },
      }),

    /**
     * Does an account hold this email or phone, deleted rows included?
     *
     * Deliberately through `$unfiltered()`: the unique indexes on `users.email`
     * and `users.phone` are not partial, so a soft-deleted row still owns its
     * address. Checking through the filtered client would report the address free
     * and then fail on the constraint — a 409 where the form wanted
     * `errors.emailTaken`.
     */
    findConflicting: (email, phone) =>
      prisma
        .$unfiltered()
        .user.findFirst({
          where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
          select: { email: true, phone: true },
        }),

    /** The Role row for a slug — needed to record the account's role assignment. */
    findRoleBySlug: (slug) => prisma.role.findUnique({ where: { slug }, select: { id: true } }),

    findCountry: (code) =>
      prisma.country.findUnique({
        where: { code },
        select: { code: true, currencyCode: true, defaultLocale: true, timezone: true, dialCode: true, isActive: true },
      }),

    /**
     * Create the account and everything an account is incomplete without.
     *
     * One transaction, four rows:
     *
     *  - `users` — the account;
     *  - `credentials` — the Argon2id hash, in its own table so a `SELECT *` on
     *    `users` can never carry it;
     *  - `user_settings` — `loginAlerts` and `twoFactor` are auth's own switches
     *    and the rest of the row is defaults; an account without this row makes
     *    every later reader write a fallback;
     *  - `user_role_assignments` — the account's role as *data*. Module 3 reads
     *    this table to resolve permissions; writing the row is not authorising
     *    anything, and leaving it out would mean module 3 opens by backfilling
     *    every account this module created.
     */
    createAccount: ({ id, name, email, phone, passwordHash, role, countryCode, currency, locale, timezone, marketingOptIn, roleId }) =>
      prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id,
            name,
            email,
            phone: phone || null,
            primaryRole: toDbEnum("UserRoleSlug", role),
            countryCode,
            currency,
            locale,
            timezone: timezone ?? null,
            marketingOptIn: Boolean(marketingOptIn),
          },
          select: USER_SELECT,
        });

        await tx.credential.create({ data: { userId: id, passwordHash } });
        await tx.userSettings.create({ data: { userId: id } });

        if (roleId) {
          await tx.userRoleAssignment.create({
            data: { id: newId(ID_PREFIXES.userRoleAssignment), userId: id, roleId },
          });
        }

        return user;
      }),

    markLogin: (userId) => prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() }, select: { id: true } }),

    /** Verification is a side effect of an OTP on the account's own number. */
    markPhoneVerified: (userId) =>
      prisma.user.update({
        where: { id: userId },
        data: { phoneVerifiedAt: new Date(), isVerified: true },
        select: USER_SELECT,
      }),

    // -------------------------------------------------------------------------
    // Credentials — the lockout counter lives here
    // -------------------------------------------------------------------------

    /**
     * One more consecutive failure, and the lock if that was the last one.
     *
     * `upsert` is not needed: an account with no credential has nothing to lock,
     * and the caller already knows it (`errors.noPassword`).
     */
    recordCredentialFailure: (userId, { threshold, lockMinutes }) =>
      prisma.$transaction(async (tx) => {
        const credential = await tx.credential.findUnique({ where: { userId }, select: { failedCount: true } });
        if (!credential) return null;

        const failedCount = credential.failedCount + 1;
        const lockedUntil = failedCount >= threshold ? new Date(Date.now() + lockMinutes * 60_000) : null;

        return tx.credential.update({
          where: { userId },
          // Reset the counter as the lock is applied: the lock is the punishment,
          // and leaving the count at the threshold would re-lock on the first
          // failure after it expires.
          data: lockedUntil ? { failedCount: 0, lockedUntil } : { failedCount },
          select: { failedCount: true, lockedUntil: true },
        });
      }),

    clearCredentialFailures: (userId) =>
      prisma.credential.updateMany({
        where: { userId, OR: [{ failedCount: { gt: 0 } }, { lockedUntil: { not: null } }] },
        data: { failedCount: 0, lockedUntil: null },
      }),

    /**
     * Write a new password and invalidate everything minted under the old one.
     *
     * `tokenEpoch` is the schema's own mechanism for it — "bumped on every
     * password change; refresh tokens minted before it die" — and the access
     * tokens die with it, because `requireUser` compares the claim against this
     * column on every request. The session rows are revoked in the same
     * transaction so the device list agrees with the tokens.
     */
    changePassword: ({ userId, passwordHash, revokeReason }) =>
      prisma.$transaction(async (tx) => {
        await tx.credential.update({
          where: { userId },
          data: {
            passwordHash,
            changedAt: new Date(),
            failedCount: 0,
            lockedUntil: null,
            tokenEpoch: { increment: 1 },
          },
        });

        const sessions = await tx.session.findMany({ where: { userId, revokedAt: null }, select: { id: true } });
        const ids = sessions.map((session) => session.id);

        if (ids.length > 0) {
          await tx.session.updateMany({
            where: { id: { in: ids } },
            data: { revokedAt: new Date(), revokeReason: toDbEnum("SessionRevokeReason", revokeReason) },
          });
          await tx.refreshToken.updateMany({
            where: { sessionId: { in: ids }, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }

        return ids.length;
      }),

    findCredential: (userId) =>
      prisma.credential.findUnique({ where: { userId }, select: { passwordHash: true, tokenEpoch: true } }),

    // -------------------------------------------------------------------------
    // Devices
    // -------------------------------------------------------------------------

    /**
     * The device this sign-in happened on, keyed by the client's install id.
     *
     * Optional throughout: the frontend's `DeviceInput` is optional in every
     * mutation it sends, so a session with `deviceId: null` is the normal case
     * and not a degraded one.
     */
    upsertDevice: ({ userId, installId, platform, name, model, appVersion, pushToken, locale, timezone }) =>
      prisma.device.upsert({
        where: { userId_installId: { userId, installId } },
        create: {
          id: newId(ID_PREFIXES.device),
          userId,
          installId,
          platform: toDbEnum("DevicePlatform", platform ?? "web"),
          name: name ?? null,
          model: model ?? null,
          appVersion: appVersion ?? null,
          pushToken: pushToken ?? null,
          pushEnabled: Boolean(pushToken),
          locale: locale ?? null,
          timezone: timezone ?? null,
        },
        update: {
          platform: toDbEnum("DevicePlatform", platform ?? "web"),
          ...(name ? { name } : {}),
          ...(model ? { model } : {}),
          ...(appVersion ? { appVersion } : {}),
          ...(pushToken ? { pushToken, pushEnabled: true } : {}),
          lastSeenAt: new Date(),
          revokedAt: null,
        },
        select: { id: true },
      }),

    // -------------------------------------------------------------------------
    // Sessions and refresh chains
    // -------------------------------------------------------------------------

    /**
     * Open a session and mint the first link of its refresh chain, together.
     *
     * Together because a session with no refresh token is a session that can
     * never be renewed and a refresh token with no session is a credential that
     * revocation cannot reach. Neither half is meaningful alone.
     */
    createSession: ({ userId, deviceId, rememberMe, ip, userAgent, expiresAt, tokenHash, tokenExpiresAt }) =>
      prisma.$transaction(async (tx) => {
        const session = await tx.session.create({
          data: {
            id: newId(ID_PREFIXES.session),
            userId,
            deviceId: deviceId ?? null,
            rememberMe: Boolean(rememberMe),
            ip: inet(ip),
            userAgent: ua(userAgent),
            expiresAt,
          },
          select: { id: true, expiresAt: true, rememberMe: true },
        });

        await tx.refreshToken.create({
          data: {
            id: newId(ID_PREFIXES.refreshToken),
            sessionId: session.id,
            tokenHash,
            expiresAt: tokenExpiresAt,
            ip: inet(ip),
          },
        });

        return session;
      }),

    findRefreshToken: (tokenHash) =>
      prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          sessionId: true,
          expiresAt: true,
          usedAt: true,
          revokedAt: true,
          session: {
            select: { id: true, userId: true, rememberMe: true, expiresAt: true, revokedAt: true, deviceId: true },
          },
        },
      }),

    findSession: (id) =>
      prisma.session.findUnique({
        where: { id },
        select: { id: true, userId: true, expiresAt: true, revokedAt: true },
      }),

    /**
     * Spend one link and mint the next, atomically.
     *
     * The `usedAt: null` in the `updateMany` filter is the whole race guard: two
     * requests arriving with the same token both reach here, exactly one matches
     * a row, and the loser gets `null` back and is treated as a reuse. Reading
     * then writing would let both succeed and leave two live chains on one
     * session.
     */
    rotateRefreshToken: async ({ tokenId, sessionId, tokenHash, tokenExpiresAt, ip }) => {
      const now = new Date();

      const spent = await prisma.refreshToken.updateMany({
        where: { id: tokenId, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      });
      if (spent.count !== 1) return null;

      const [next] = await prisma.$transaction([
        prisma.refreshToken.create({
          data: {
            id: newId(ID_PREFIXES.refreshToken),
            sessionId,
            tokenHash,
            parentId: tokenId,
            expiresAt: tokenExpiresAt,
            ip: inet(ip),
          },
          select: { id: true },
        }),
        prisma.session.update({ where: { id: sessionId }, data: { lastSeenAt: now }, select: { id: true } }),
      ]);

      return next;
    },

    touchSession: (sessionId) =>
      prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { lastSeenAt: new Date() } }),

    /** End one session and kill every token on it. */
    revokeSession: (sessionId, reason) =>
      prisma.$transaction(async (tx) => {
        const revoked = await tx.session.updateMany({
          where: { id: sessionId, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: toDbEnum("SessionRevokeReason", reason) },
        });
        await tx.refreshToken.updateMany({ where: { sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
        return revoked.count;
      }),

    /** "Sign out everywhere". */
    revokeAllSessions: (userId, reason, exceptSessionId = null) =>
      prisma.$transaction(async (tx) => {
        const sessions = await tx.session.findMany({
          where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
          select: { id: true },
        });
        const ids = sessions.map((session) => session.id);
        if (ids.length === 0) return 0;

        await tx.session.updateMany({
          where: { id: { in: ids } },
          data: { revokedAt: new Date(), revokeReason: toDbEnum("SessionRevokeReason", reason) },
        });
        await tx.refreshToken.updateMany({ where: { sessionId: { in: ids }, revokedAt: null }, data: { revokedAt: new Date() } });
        return ids.length;
      }),

    // -------------------------------------------------------------------------
    // One-time codes
    // -------------------------------------------------------------------------

    /** The newest challenge for this destination and purpose, spent or not. */
    findLatestOtp: (destination, purpose) =>
      prisma.otpChallenge.findFirst({
        where: { destination, purpose: toDbEnum("OtpPurpose", purpose) },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          userId: true,
          codeHash: true,
          attempts: true,
          maxAttempts: true,
          consumedAt: true,
          expiresAt: true,
          createdAt: true,
        },
      }),

    createOtp: ({ userId, purpose, channel, destination, codeHash, maxAttempts, expiresAt, ip }) =>
      prisma.otpChallenge.create({
        data: {
          id: newId(ID_PREFIXES.otpChallenge),
          userId: userId ?? null,
          purpose: toDbEnum("OtpPurpose", purpose),
          channel: toDbEnum("OtpChannel", channel),
          destination,
          codeHash,
          maxAttempts,
          expiresAt,
          ip: inet(ip),
        },
        select: { id: true, destination: true, expiresAt: true, createdAt: true },
      }),

    incrementOtpAttempts: (id) =>
      prisma.otpChallenge.update({ where: { id }, data: { attempts: { increment: 1 } }, select: { attempts: true } }),

    /** Spend the code. `consumedAt: null` in the filter makes replay a no-match. */
    consumeOtp: async (id) => {
      const consumed = await prisma.otpChallenge.updateMany({
        where: { id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return consumed.count === 1;
    },

    // -------------------------------------------------------------------------
    // Password reset
    // -------------------------------------------------------------------------

    createPasswordReset: ({ userId, tokenHash, expiresAt, ip }) =>
      prisma.passwordReset.create({
        data: { id: newId(ID_PREFIXES.passwordReset), userId, tokenHash, expiresAt, ip: inet(ip) },
        select: { id: true, expiresAt: true },
      }),

    findPasswordReset: (tokenHash) =>
      prisma.passwordReset.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, consumedAt: true },
      }),

    consumePasswordReset: async (id) => {
      const consumed = await prisma.passwordReset.updateMany({
        where: { id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return consumed.count === 1;
    },

    // -------------------------------------------------------------------------
    // The attempt log
    // -------------------------------------------------------------------------

    /**
     * Append-only, and written for **every** attempt including the ones against
     * accounts that do not exist — that is what makes the table answer "is
     * somebody walking the user list" rather than only "who mistyped".
     *
     * Never awaited by a caller on the response path (see `service.js`): a log
     * write that fails must not turn a correct sign-in into a 500.
     */
    logAttempt: ({ identifier, userId, method, success, reason, ip, userAgent }) =>
      prisma.loginAttempt.create({
        data: {
          id: newId(ID_PREFIXES.loginAttempt),
          identifier: String(identifier ?? "").slice(0, 191),
          userId: userId ?? null,
          method: String(method).slice(0, 24),
          success,
          reason: reason ?? null,
          ip: inet(ip),
          userAgent: ua(userAgent),
        },
        select: { id: true },
      }),
  };
}

export default createRepository;
