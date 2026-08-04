import { Injectable } from '@nestjs/common';

import { enumCodec, TransactionManager } from '../../../infrastructure/prisma';
import type { $Enums } from '../../../infrastructure/prisma/generated';
import type { OtpChannel, OtpPurpose } from '../../../shared/enums';
import type {
  ChallengeRepositoryPort,
  NewLoginAttempt,
  NewOtpChallenge,
  NewPasswordReset,
  OtpChallengeRecord,
  PasswordResetRecord,
} from '../domain';

const purposes = enumCodec<OtpPurpose, $Enums.OtpPurpose>('OtpPurpose');
const channels = enumCodec<OtpChannel, $Enums.OtpChannel>('OtpChannel');

interface OtpRow {
  id: string;
  userId: string | null;
  purpose: string;
  channel: string;
  destination: string;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * `OtpChallenge`, `PasswordReset` and `LoginAttempt`.
 *
 * Both single-use artefacts are consumed by a **conditional update** filtered on
 * `consumedAt: null`, so "single use" holds under concurrency rather than only under
 * a sequential reading of the code. A read-then-write would let a code clicked twice
 * in the same instant be redeemed twice.
 */
@Injectable()
export class PrismaChallengeRepository implements ChallengeRepositoryPort {
  constructor(private readonly transactions: TransactionManager) {}

  private get db() {
    return this.transactions.client;
  }

  async createOtpChallenge(input: NewOtpChallenge): Promise<OtpChallengeRecord> {
    const row = await this.db.otpChallenge.create({
      data: {
        id: input.id,
        userId: input.userId,
        purpose: purposes.toDb(input.purpose),
        channel: channels.toDb(input.channel),
        destination: input.destination,
        codeHash: input.codeHash,
        maxAttempts: input.maxAttempts,
        expiresAt: input.expiresAt,
        ip: input.ip,
        createdAt: input.createdAt,
      },
    });
    return toChallenge(row);
  }

  /**
   * Newest first, used or not.
   *
   * "Used or not" is deliberate on two counts: the resend cooldown counts from the
   * last code *issued* (otherwise consuming one buys a free extra send), and
   * presenting a spent code should be told it is spent rather than silently matched
   * against an older live one.
   */
  async findLatestOtpChallenge(
    destination: string,
    purpose: OtpPurpose,
  ): Promise<OtpChallengeRecord | null> {
    const row = await this.db.otpChallenge.findFirst({
      where: { destination, purpose: purposes.toDb(purpose) },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toChallenge(row) : null;
  }

  async recordOtpAttempt(challengeId: string): Promise<number> {
    const row = await this.db.otpChallenge.update({
      where: { id: challengeId },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return row.attempts;
  }

  async consumeOtpChallenge(challengeId: string, at: Date): Promise<boolean> {
    const { count } = await this.db.otpChallenge.updateMany({
      where: { id: challengeId, consumedAt: null },
      data: { consumedAt: at },
    });
    return count > 0;
  }

  async createPasswordReset(input: NewPasswordReset): Promise<PasswordResetRecord> {
    const row = await this.db.passwordReset.create({
      data: {
        id: input.id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        ip: input.ip,
        createdAt: input.createdAt,
      },
    });
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
      createdAt: row.createdAt,
    };
  }

  async findPasswordResetByHash(tokenHash: string): Promise<PasswordResetRecord | null> {
    const row = await this.db.passwordReset.findUnique({ where: { tokenHash } });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
      createdAt: row.createdAt,
    };
  }

  async consumePasswordReset(resetId: string, at: Date): Promise<boolean> {
    const { count } = await this.db.passwordReset.updateMany({
      where: { id: resetId, consumedAt: null },
      data: { consumedAt: at },
    });
    return count > 0;
  }

  /**
   * Marks every outstanding reset consumed. A successful sign-in calls this, so a
   * link sitting in an inbox stops being a way in the moment the owner demonstrates
   * they never needed it (D6 §Password reset).
   */
  async invalidatePasswordResets(userId: string, at: Date): Promise<number> {
    const { count } = await this.db.passwordReset.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: at },
    });
    return count;
  }

  /**
   * Append-only, and written for attempts on accounts that **do not exist** — which
   * is most of what a credential-stuffing run looks like, and therefore the rows
   * that make one visible.
   */
  async recordLoginAttempt(input: NewLoginAttempt): Promise<void> {
    await this.db.loginAttempt.create({
      data: {
        id: input.id,
        identifier: input.identifier.slice(0, 191),
        userId: input.userId,
        method: input.method,
        success: input.success,
        reason: input.reason?.slice(0, 60) ?? null,
        ip: input.ip,
        userAgent: input.userAgent?.slice(0, 400) ?? null,
        at: input.at,
      },
    });
  }
}

function toChallenge(row: OtpRow): OtpChallengeRecord {
  return {
    id: row.id,
    userId: row.userId,
    purpose: purposes.toWire(row.purpose),
    channel: channels.toWire(row.channel),
    destination: row.destination,
    codeHash: row.codeHash,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    consumedAt: row.consumedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}
