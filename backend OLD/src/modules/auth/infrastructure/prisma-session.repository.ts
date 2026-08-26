import { Injectable } from '@nestjs/common';

import { enumCodec, TransactionManager } from '../../../infrastructure/prisma';
import type { $Enums } from '../../../infrastructure/prisma/generated';
import type { DevicePlatform, SessionRevokeReason } from '../../../shared/enums';
import type {
  NewRefreshToken,
  NewSession,
  RefreshTokenRecord,
  SessionRecord,
  SessionRepositoryPort,
} from '../domain';

const revokeReasons = enumCodec<SessionRevokeReason, $Enums.SessionRevokeReason>(
  'SessionRevokeReason',
);
const platforms = enumCodec<DevicePlatform, $Enums.DevicePlatform>('DevicePlatform');

/** The device is joined in because the security screen shows "iPhone" and not an id. */
const SESSION_SELECT = {
  id: true,
  userId: true,
  deviceId: true,
  rememberMe: true,
  ip: true,
  userAgent: true,
  location: true,
  createdAt: true,
  lastSeenAt: true,
  expiresAt: true,
  revokedAt: true,
  revokeReason: true,
  device: { select: { platform: true, name: true } },
} as const;

interface SessionRow {
  id: string;
  userId: string;
  deviceId: string | null;
  rememberMe: boolean;
  ip: string | null;
  userAgent: string | null;
  location: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  device: { platform: string; name: string | null } | null;
}

/**
 * `Session` and `RefreshToken`.
 *
 * Two methods here are **conditional updates**, and that is the whole security
 * property rather than an optimisation: `markRefreshTokenUsed` filters on
 * `usedAt: null`, so the check and the claim are one atomic statement. Reading the
 * row and then writing it would let two simultaneous refreshes both believe they
 * were first, and the loser would then be treated as a thief — signing out a user
 * for having two tabs open.
 */
@Injectable()
export class PrismaSessionRepository implements SessionRepositoryPort {
  constructor(private readonly transactions: TransactionManager) {}

  private get db() {
    return this.transactions.client;
  }

  async createSession(input: NewSession): Promise<SessionRecord> {
    const row = await this.db.session.create({
      data: {
        id: input.id,
        userId: input.userId,
        deviceId: input.deviceId,
        rememberMe: input.rememberMe,
        ip: input.ip,
        userAgent: input.userAgent?.slice(0, 400) ?? null,
        createdAt: input.createdAt,
        lastSeenAt: input.createdAt,
        expiresAt: input.expiresAt,
      },
      select: SESSION_SELECT,
    });
    return toSession(row);
  }

  async findSession(sessionId: string): Promise<SessionRecord | null> {
    const row = await this.db.session.findUnique({
      where: { id: sessionId },
      select: SESSION_SELECT,
    });
    return row ? toSession(row) : null;
  }

  /**
   * Live means "not revoked and not past `expiresAt`", judged against the passed
   * clock — no sweep job has to have run for an expired session to stop being
   * listed, which is the same rule the rest of the platform derives state by.
   */
  async listActiveSessions(userId: string, now: Date): Promise<SessionRecord[]> {
    const rows = await this.db.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastSeenAt: 'desc' },
      select: SESSION_SELECT,
    });
    return rows.map(toSession);
  }

  async touchSession(sessionId: string, at: Date): Promise<void> {
    await this.db.session.updateMany({ where: { id: sessionId }, data: { lastSeenAt: at } });
  }

  async revokeSession(
    sessionId: string,
    userId: string,
    reason: SessionRevokeReason,
    at: Date,
  ): Promise<boolean> {
    const { count } = await this.db.session.updateMany({
      // `userId` is part of the predicate rather than a check afterwards, so another
      // account's session id is indistinguishable from one that does not exist.
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: at, revokeReason: revokeReasons.toDb(reason) },
    });
    return count > 0;
  }

  /**
   * Returns the ids it revoked, because each one needs a Redis mark — the row is
   * the truth and the mark is what makes the truth visible to an access token that
   * has not expired yet.
   *
   * Two statements rather than one `updateMany`: `updateMany` reports a count and not
   * which rows, and Postgres's `UPDATE … RETURNING` is not reachable through Prisma's
   * typed API.
   */
  async revokeUserSessions(
    userId: string,
    reason: SessionRevokeReason,
    at: Date,
    exceptSessionId?: string,
  ): Promise<string[]> {
    const where = {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    };

    const doomed = await this.db.session.findMany({ where, select: { id: true } });
    if (doomed.length === 0) return [];

    await this.db.session.updateMany({
      where: { id: { in: doomed.map((session) => session.id) } },
      data: { revokedAt: at, revokeReason: revokeReasons.toDb(reason) },
    });
    return doomed.map((session) => session.id);
  }

  async createRefreshToken(input: NewRefreshToken): Promise<RefreshTokenRecord> {
    const row = await this.db.refreshToken.create({
      data: {
        id: input.id,
        sessionId: input.sessionId,
        tokenHash: input.tokenHash,
        parentId: input.parentId,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
        ip: input.ip,
      },
    });
    return toRefreshToken(row);
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = await this.db.refreshToken.findUnique({ where: { tokenHash } });
    return row ? toRefreshToken(row) : null;
  }

  /** See the class comment: conditional, and that is the point. */
  async markRefreshTokenUsed(tokenId: string, at: Date): Promise<boolean> {
    const { count } = await this.db.refreshToken.updateMany({
      where: { id: tokenId, usedAt: null },
      data: { usedAt: at },
    });
    return count > 0;
  }

  async revokeSessionTokens(sessionId: string, at: Date): Promise<number> {
    const { count } = await this.db.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: at },
    });
    return count;
  }
}

function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    deviceId: row.deviceId,
    rememberMe: row.rememberMe,
    ip: row.ip,
    userAgent: row.userAgent,
    location: row.location,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    revokeReason: row.revokeReason ? revokeReasons.toWire(row.revokeReason) : null,
    devicePlatform: row.device ? platforms.toWire(row.device.platform) : null,
    deviceName: row.device?.name ?? null,
  };
}

interface RefreshTokenRow {
  id: string;
  sessionId: string;
  tokenHash: string;
  parentId: string | null;
  issuedAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

function toRefreshToken(row: RefreshTokenRow): RefreshTokenRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    tokenHash: row.tokenHash,
    parentId: row.parentId,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    revokedAt: row.revokedAt,
  };
}
