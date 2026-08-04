import { Inject, Injectable, Logger } from '@nestjs/common';

import { IdService } from '../../../common/ids';
import { jwtConfig, type JwtConfig } from '../../../config';
import {
  type AccessTokenClaims,
  type TokenVerifierPort,
  UNIT_OF_WORK,
  type UnitOfWorkPort,
} from '../../../shared/contracts';
import { CLOCK, type Clock, fail, ok, type Result } from '../../../shared/kernel';
import { PERMISSION_RESOLUTION, type PermissionResolutionPort } from '../../rbac/domain';
import {
  AUTH_AUDIT,
  AUTH_CACHE,
  type AuthAuditPort,
  type AuthCachePort,
  AuthError,
  type AuthUser,
  IDENTITY_REPOSITORY,
  type IdentityRepositoryPort,
  type IssuedTokens,
  type RotationReplay,
  SECRET_GENERATOR,
  type SecretGeneratorPort,
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
  TOKEN_SIGNER,
  type TokenSignerPort,
} from '../domain';

/** 256 bits, per D6. Long enough that guessing is not a strategy. */
const REFRESH_TOKEN_BYTES = 32;

export interface SessionStart {
  rememberMe: boolean;
  ip: string | null;
  userAgent: string | null;
  deviceId: string | null;
}

export interface RefreshOutcome {
  user: AuthUser;
  permissions: readonly string[];
  tokens: IssuedTokens;
}

/**
 * Mints access tokens, and owns the refresh chain.
 *
 * The split is the design (D6 §Token model): the **access** token is a stateless
 * RS256 JWT, so verifying it costs no database read, and the **refresh** token is
 * an opaque 256-bit random string, so there is nothing in it to read, it is
 * revocable by definition, and a stolen one is *detectable*. None of those last
 * three is true of a self-contained refresh JWT, which is why it is not one.
 *
 * This class also satisfies `TOKEN_VERIFIER` for the guards, so "is this token
 * acceptable?" has one implementation rather than one for signing and one for
 * checking.
 */
@Injectable()
export class TokenService implements TokenVerifierPort {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @Inject(IDENTITY_REPOSITORY) private readonly identity: IdentityRepositoryPort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    @Inject(PERMISSION_RESOLUTION) private readonly permissions: PermissionResolutionPort,
    @Inject(TOKEN_SIGNER) private readonly signer: TokenSignerPort,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGeneratorPort,
    @Inject(AUTH_CACHE) private readonly cache: AuthCachePort,
    @Inject(AUTH_AUDIT) private readonly audit: AuthAuditPort,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWorkPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(jwtConfig.KEY) private readonly config: JwtConfig,
    private readonly ids: IdService,
  ) {}

  verifyAccessToken(raw: string): Promise<AccessTokenClaims> {
    return this.signer.verifyAccessToken(raw);
  }

  /**
   * Creates the session and the first link of its refresh chain.
   *
   * One transaction: a session with no refresh token is a sign-in the client
   * cannot renew, and a refresh token with no session is a credential pointing at
   * nothing.
   *
   * "Remember me" changes the *absolute* lifetime of the refresh family — 30 days
   * against 7 — and nothing else. Rotation does not extend it, so a stolen chain
   * cannot be kept alive indefinitely by refreshing it.
   */
  async startSession(
    user: AuthUser,
    permissions: readonly string[],
    permHash: string,
    start: SessionStart,
  ): Promise<IssuedTokens> {
    const now = this.clock.date();
    const lifetimeSeconds = start.rememberMe
      ? this.config.refreshTtlSeconds
      : this.config.refreshTtlShortSeconds;
    const expiresAt = new Date(now.getTime() + lifetimeSeconds * 1_000);

    const sessionId = this.ids.next('session');
    const refreshToken = this.secrets.token(REFRESH_TOKEN_BYTES);

    const access = await this.unitOfWork.runInTransaction(async () => {
      await this.sessions.createSession({
        id: sessionId,
        userId: user.id,
        deviceId: start.deviceId,
        rememberMe: start.rememberMe,
        ip: start.ip,
        userAgent: start.userAgent,
        createdAt: now,
        expiresAt,
      });

      await this.sessions.createRefreshToken({
        id: this.ids.next('refreshToken'),
        sessionId,
        tokenHash: this.secrets.sha256(refreshToken),
        parentId: null,
        issuedAt: now,
        expiresAt,
        ip: start.ip,
      });

      return this.issueAccessToken(user, permissions, sessionId, permHash);
    });

    return {
      sessionId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }

  /**
   * Signs one access token for an existing session.
   *
   * The epoch is read here rather than passed in, so a token can never be minted
   * carrying a stale one — which would produce a token that fails its own first
   * verification. Writing it to the cache on the way out means the very next
   * request's guard reads it without touching Postgres.
   */
  async issueAccessToken(
    user: AuthUser,
    permissions: readonly string[],
    sessionId: string,
    permHash: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    void permissions; // Resolved server-side per request; never carried in the token.
    const epoch = await this.identity.currentTokenEpoch(user.id);
    await this.cache.writeEpoch(user.id, epoch);

    return this.signer.signAccessToken({
      sub: user.id,
      sid: sessionId,
      role: user.primaryRole,
      permHash,
      countryCode: user.countryCode,
      currency: user.currency,
      locale: user.locale,
      epoch,
    });
  }

  /**
   * The session a refresh cookie belongs to, without spending the token.
   *
   * For `POST /auth/logout`, which has to work when the access token has already
   * expired — the case sign-out most needs to cover. Returns nothing for a token that
   * is unknown, spent, revoked or expired, so a stale cookie cannot be used to look up
   * a live session.
   */
  async sessionForRefreshToken(
    presented: string,
  ): Promise<{ id: string; userId: string } | null> {
    const token = await this.sessions.findRefreshTokenByHash(this.secrets.sha256(presented));
    if (!token || token.revokedAt !== null) return null;

    const session = await this.sessions.findSession(token.sessionId);
    if (!session || session.revokedAt !== null) return null;
    return { id: session.id, userId: session.userId };
  }

  /**
   * Rotation with reuse detection — the security-critical path (D6 §Rotation).
   *
   * Every refresh spends the presented token and mints a child recording its
   * `parentId`. That chain is what makes theft *detectable* rather than merely
   * suspected: a token presented twice can only mean the client kept a copy it
   * should have discarded, or that somebody else has one.
   *
   * The response is deliberately disproportionate — the whole session dies, not
   * just the token. If a token leaked, the attacker may already hold a later link,
   * and revoking only the replayed one would leave them signed in.
   */
  async rotateRefreshToken(presented: string, ip: string | null): Promise<Result<RefreshOutcome>> {
    const now = this.clock.date();
    const presentedHash = this.secrets.sha256(presented);

    // Did a sibling request spend this exact token moments ago? Two tabs
    // refreshing at once is not an attack, and treating it as one signs out a user
    // who did nothing wrong.
    const replay = await this.cache.recallRotation(presentedHash);
    if (replay) {
      const revived = await this.completeReplay(replay, now);
      if (revived) return ok(revived);
    }

    const token = await this.sessions.findRefreshTokenByHash(presentedHash);
    if (
      !token ||
      token.revokedAt !== null ||
      token.expiresAt.getTime() <= now.getTime()
    ) {
      return fail(AuthError.refreshInvalid);
    }

    const session = await this.sessions.findSession(token.sessionId);
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= now.getTime()
    ) {
      return fail(AuthError.refreshInvalid);
    }

    const user = await this.identity.findById(session.userId);
    if (!user) return fail(AuthError.refreshInvalid);

    const authorization = await this.permissions.resolve(user.id);
    if (!authorization) return fail(AuthError.refreshInvalid);

    // The check and the claim are one statement (`WHERE used_at IS NULL`). Reading
    // `usedAt` and then writing it would let two simultaneous requests both
    // believe they were first — and then treat the loser as a thief.
    const claimed = await this.sessions.markRefreshTokenUsed(token.id, now);
    if (!claimed) return this.handleReuse(session.id, user.id, token.id);

    const refreshToken = this.secrets.token(REFRESH_TOKEN_BYTES);
    // The family's absolute lifetime does not extend on rotation.
    const refreshTokenExpiresAt = token.expiresAt;

    const access = await this.unitOfWork.runInTransaction(async () => {
      await this.sessions.createRefreshToken({
        id: this.ids.next('refreshToken'),
        sessionId: session.id,
        tokenHash: this.secrets.sha256(refreshToken),
        parentId: token.id,
        issuedAt: now,
        expiresAt: refreshTokenExpiresAt,
        ip,
      });
      await this.sessions.touchSession(session.id, now);
      return this.issueAccessToken(
        user,
        authorization.permissions,
        session.id,
        authorization.permHash,
      );
    });

    await this.cache.rememberRotation(presentedHash, {
      refreshToken,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
      sessionId: session.id,
    });

    return ok({
      user,
      permissions: authorization.permissions,
      tokens: {
        sessionId: session.id,
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt,
        refreshToken,
        refreshTokenExpiresAt,
      },
    });
  }

  /**
   * A replayed rotation is answered with the winner's refresh token and a
   * **fresh** access token — not the winner's, which the loser never saw and which
   * is already sitting in another tab's memory.
   */
  private async completeReplay(
    replay: RotationReplay,
    now: Date,
  ): Promise<RefreshOutcome | null> {
    const session = await this.sessions.findSession(replay.sessionId);
    if (!session || session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= now.getTime()) return null;

    const user = await this.identity.findById(session.userId);
    if (!user) return null;
    const authorization = await this.permissions.resolve(user.id);
    if (!authorization) return null;

    const access = await this.issueAccessToken(
      user,
      authorization.permissions,
      session.id,
      authorization.permHash,
    );

    return {
      user,
      permissions: authorization.permissions,
      tokens: {
        sessionId: session.id,
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt,
        refreshToken: replay.refreshToken,
        refreshTokenExpiresAt: new Date(replay.refreshTokenExpiresAt),
      },
    };
  }

  /** Reuse outside the replay window. Burn the session down, and say why. */
  private async handleReuse(
    sessionId: string,
    userId: string,
    tokenId: string,
  ): Promise<Result<RefreshOutcome>> {
    const now = this.clock.date();

    await this.unitOfWork.runInTransaction(async () => {
      await this.sessions.revokeSessionTokens(sessionId, now);
      await this.sessions.revokeSession(sessionId, userId, 'rotation-reuse', now);
    });
    await this.cache.markSessionRevoked(sessionId);

    await this.audit.record({
      action: 'auth.token.reuse',
      userId,
      entityId: sessionId,
      details: { tokenId },
    });
    this.logger.warn(
      { userId, sessionId, tokenId },
      'refresh token reuse detected; session revoked',
    );

    // D6 also notifies the account owner. That needs the notifications module
    // (E8); the audit row and this log line are what E2 can honestly provide.
    return fail(AuthError.refreshReuse);
  }
}
