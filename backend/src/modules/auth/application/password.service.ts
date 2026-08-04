import { Inject, Injectable, Logger } from '@nestjs/common';

import { RequestContextService } from '../../../common/context';
import { RateLimitError } from '../../../common/errors';
import { IdService } from '../../../common/ids';
import { appConfig, type AppConfig, jwtConfig, type JwtConfig } from '../../../config';
import {
  RATE_LIMITER,
  type RateLimiterPort,
  UNIT_OF_WORK,
  type UnitOfWorkPort,
} from '../../../shared/contracts';
import { CLOCK, type Clock, fail, ok, type Result } from '../../../shared/kernel';
import { PERMISSION_RESOLUTION, type PermissionResolutionPort } from '../../rbac/domain';
import {
  AUTH_AUDIT,
  AUTH_CACHE,
  AUTH_RATE_LIMITS,
  type AuthAuditPort,
  type AuthCachePort,
  AuthError,
  CHALLENGE_REPOSITORY,
  type ChallengeRepositoryPort,
  IDENTITY_REPOSITORY,
  type IdentityRepositoryPort,
  normaliseEmail,
  PASSWORD_HASHER,
  type PasswordHasherPort,
  SECRET_GENERATOR,
  type SecretGeneratorPort,
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
  type SignedIn,
} from '../domain';
import { TokenService } from './token.service';

/** 32 bytes, single-use, SHA-256 at rest — per D6 §Password reset. */
const RESET_TOKEN_BYTES = 32;

/**
 * Changing a password, and recovering from having lost it.
 *
 * Both paths end in the same act — a new hash **and** a bumped `tokenEpoch` — and
 * the epoch bump is the interesting half: it is what makes "changing my password
 * signs out whoever was in my account" true immediately rather than in fifteen
 * minutes, because every access token carries the epoch it was minted under and
 * `JwtAuthGuard` compares it on every request.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    @Inject(IDENTITY_REPOSITORY) private readonly identity: IdentityRepositoryPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    @Inject(CHALLENGE_REPOSITORY) private readonly challenges: ChallengeRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGeneratorPort,
    @Inject(PERMISSION_RESOLUTION) private readonly permissions: PermissionResolutionPort,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiterPort,
    @Inject(AUTH_CACHE) private readonly cache: AuthCachePort,
    @Inject(AUTH_AUDIT) private readonly audit: AuthAuditPort,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWorkPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
    @Inject(jwtConfig.KEY) private readonly config: JwtConfig,
    private readonly tokens: TokenService,
    private readonly context: RequestContextService,
    private readonly ids: IdService,
  ) {}

  /**
   * Changes the password of the signed-in user and **replaces every session with a
   * new one**, handing the caller fresh tokens.
   *
   * Sparing the current session would have been the gentler option, and it is the
   * wrong one twice over. The epoch bump invalidates every access token for this
   * user — including the one that authorised this very call — so *something* has to
   * be re-issued regardless; and the old session's refresh chain would otherwise
   * survive a password change, which is the one thing the user was trying to
   * prevent. So the old chain dies with the rest and the caller gets a brand new
   * session, carrying over only whether they had asked to be remembered.
   */
  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<Result<SignedIn>> {
    const now = this.clock.date();

    const user = await this.identity.findById(userId);
    if (!user) return fail(AuthError.accountNotFound);

    const credential = await this.identity.findCredential(userId);
    // An account created through phone OTP has no password to change. Here the
    // distinction is safe to make: the caller has already proved who they are.
    if (!credential) return fail(AuthError.noPassword);

    const correct = await this.hasher.verify(credential.passwordHash, currentPassword);
    if (!correct) return fail(AuthError.wrongPassword, { path: 'input.currentPassword' });

    if (await this.hasher.verify(credential.passwordHash, newPassword)) {
      return fail(AuthError.samePassword, { path: 'input.newPassword' });
    }

    const previous = await this.sessions.findSession(sessionId);
    const hash = await this.hasher.hash(newPassword);

    const revoked = await this.unitOfWork.runInTransaction(async () => {
      await this.identity.setPassword(userId, hash, 'argon2id');
      // Any reset link sitting in an inbox stops working: the owner just proved
      // they do not need one.
      await this.challenges.invalidatePasswordResets(userId, now);
      return this.sessions.revokeUserSessions(userId, 'password-change', now);
    });

    await this.afterEpochBump(userId, revoked);
    await this.audit.record({
      action: 'auth.password.changed',
      userId,
      details: { sessionsRevoked: revoked.length },
    });

    const authorization = await this.permissions.resolve(userId);
    if (!authorization) return fail(AuthError.accountNotFound);

    const tokens = await this.tokens.startSession(
      user,
      authorization.permissions,
      authorization.permHash,
      {
        rememberMe: previous?.rememberMe ?? false,
        ip: this.context.get()?.ip ?? null,
        userAgent: this.context.get()?.userAgent ?? null,
        deviceId: previous?.deviceId ?? null,
      },
    );

    return ok({ user, permissions: authorization.permissions, tokens });
  }

  /**
   * Starts a reset. **Always** reports success (D6 §Password reset).
   *
   * Same reasoning as `requestOtp`: an endpoint that says "no account with that
   * email" is an account-enumeration oracle, and this one is unauthenticated. The
   * prototype already behaves this way.
   */
  async requestPasswordReset(rawEmail: string): Promise<Result<{ email: string }>> {
    const now = this.clock.date();
    const email = normaliseEmail(rawEmail);

    await this.enforce(AUTH_RATE_LIMITS.requestPasswordReset.perEmail, email);
    await this.enforce(
      AUTH_RATE_LIMITS.requestPasswordReset.perIp,
      this.context.get()?.ip ?? 'unknown',
    );

    const user = await this.identity.findByEmail(email);
    if (user) {
      const token = this.secrets.token(RESET_TOKEN_BYTES);
      await this.challenges.createPasswordReset({
        id: this.ids.next('passwordReset'),
        userId: user.id,
        tokenHash: this.secrets.sha256(token),
        expiresAt: new Date(now.getTime() + this.config.passwordResetTtlSeconds * 1_000),
        ip: this.context.get()?.ip ?? null,
        createdAt: now,
      });

      /**
       * Delivering the email is E8's job — there is no transport yet, and writing
       * half of one here would duplicate the templating and retry logic that module
       * owns. Outside production the link is logged instead, behind the same flag as
       * OTP codes, so the flow is completable end to end by a developer. In
       * production the flag cannot be on: `validateEnvironment` refuses to boot.
       */
      if (this.config.otp.logCodes) {
        this.logger.warn(
          { userId: user.id, link: `${this.app.webUrl}/reset-password?token=${token}` },
          'password reset link (development only — no mail transport until E8)',
        );
      }
    }

    return ok({ email });
  }

  /**
   * Completes a reset.
   *
   * Deliberately does **not** sign the user in. A reset proves control of an
   * inbox, which is a weaker claim than knowing the password, and the account is
   * one step from being fully taken over if that inbox was the thing compromised.
   * Making them type the new password once more costs a form and closes that gap.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<Result<{ ok: true }>> {
    const now = this.clock.date();

    const reset = await this.challenges.findPasswordResetByHash(this.secrets.sha256(rawToken));
    if (!reset) return fail(AuthError.resetTokenInvalid);
    if (reset.consumedAt !== null) return fail(AuthError.resetTokenInvalid);
    if (reset.expiresAt.getTime() <= now.getTime()) return fail(AuthError.resetTokenInvalid);

    const hash = await this.hasher.hash(newPassword);

    const outcome = await this.unitOfWork.runInTransaction(async () => {
      // Conditional, so a link clicked twice does not reset twice.
      const consumed = await this.challenges.consumePasswordReset(reset.id, now);
      if (!consumed) return null;

      await this.identity.setPassword(reset.userId, hash, 'argon2id');
      await this.identity.clearFailures(reset.userId);
      // Everything, including the current device: a reset is what someone does when
      // they believe an intruder is in the account.
      return this.sessions.revokeUserSessions(reset.userId, 'password-change', now);
    });

    if (outcome === null) return fail(AuthError.resetTokenInvalid);

    await this.afterEpochBump(reset.userId, outcome);
    await this.audit.record({
      action: 'auth.password.reset',
      userId: reset.userId,
      details: { sessionsRevoked: outcome.length },
    });

    return ok({ ok: true });
  }

  /**
   * The two cache writes that make an epoch bump take effect *now* rather than
   * within five minutes: forget the cached epoch, and mark every revoked session so
   * a `@FreshSession()` handler refuses it before its token expires.
   */
  private async afterEpochBump(userId: string, revokedSessionIds: string[]): Promise<void> {
    await this.cache.forgetEpoch(userId);
    await Promise.all(revokedSessionIds.map((id) => this.cache.markSessionRevoked(id)));
  }

  private async enforce(
    rule: { name: string; limit: number; windowSeconds: number },
    discriminator: string,
  ): Promise<void> {
    const verdict = await this.limiter.consume(
      `${rule.name}:${discriminator}`,
      rule.limit,
      rule.windowSeconds,
    );
    if (!verdict.allowed) throw new RateLimitError(verdict.retryAfterSeconds);
  }
}
