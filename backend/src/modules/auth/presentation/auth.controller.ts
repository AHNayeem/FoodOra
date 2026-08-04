import { Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { Public, RateLimit } from '../../../common/decorators';
import { UnauthenticatedError } from '../../../common/errors';
import { appConfig, type AppConfig, jwtConfig, type JwtConfig } from '../../../config';
import { AUTH_RATE_LIMITS, SECRET_GENERATOR, type SecretGeneratorPort } from '../domain';
import { SessionService } from '../application/session.service';
import { TokenService } from '../application/token.service';
import {
  clearAuthCookies,
  cookieOptionsFrom,
  CSRF_COOKIE,
  CSRF_HEADER,
  readCookie,
  REFRESH_COOKIE,
  setAuthCookies,
} from './cookies';
import { toUserModel } from './auth.resolver';

/**
 * The two cookie-bearing endpoints. REST, not GraphQL, and that is forced rather than
 * chosen: the refresh cookie is scoped to `Path=/auth`, so the browser does not send it
 * to `/graphql` at all. D5's schema sketch lists a `refreshToken` mutation; it could not
 * work, because the credential it needs never arrives there.
 *
 * The upside of the constraint is the one D6 wanted: `/graphql` is not
 * cookie-authenticated, so it is not CSRF-able, and only these two routes need a
 * double-submit token.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGeneratorPort,
    @Inject(jwtConfig.KEY) private readonly jwt: JwtConfig,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
  ) {}

  /**
   * Exchange the refresh cookie for a new access token, rotating the cookie.
   *
   * `@Public()` because the access token is expected to be *expired* here — requiring a
   * valid one would make refresh useless exactly when it is needed. The credential is
   * the cookie, and the cookie is protected by being `HttpOnly`, path-scoped, and
   * double-submit checked.
   *
   * 60 per hour per IP: a client refreshing every 15 minutes needs four.
   */
  @Public()
  @RateLimit({
    name: AUTH_RATE_LIMITS.refreshToken.perSession.name,
    limit: AUTH_RATE_LIMITS.refreshToken.perSession.limit,
    windowSeconds: AUTH_RATE_LIMITS.refreshToken.perSession.windowSeconds,
  })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const options = cookieOptionsFrom(this.jwt, this.app.isProduction);
    const presented = readCookie(request, REFRESH_COOKIE);

    if (!presented) {
      clearAuthCookies(reply, options);
      throw new UnauthenticatedError();
    }

    this.assertCsrf(request);

    const result = await this.tokens.rotateRefreshToken(
      presented,
      request.ip ?? null,
    );

    if (!result.ok) {
      // Includes the reuse case, where the session has already been destroyed. Clearing
      // the cookie is the only useful thing left to do for the *legitimate* owner, who
      // now has to sign in again — which is the correct outcome of a leaked chain.
      clearAuthCookies(reply, options);
      throw new UnauthenticatedError(result.error.key);
    }

    const { user, permissions, tokens } = result.data;
    setAuthCookies(
      reply,
      tokens.refreshToken,
      this.secrets.token(16),
      tokens.refreshTokenExpiresAt,
      options,
    );

    // Shaped like `AuthSession` so the client has one mapper for both paths.
    await reply.status(200).send({
      user: toUserModel(user, permissions),
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
      sessionId: tokens.sessionId,
    });
  }

  /**
   * Sign out using only the cookie.
   *
   * The GraphQL `logout` mutation is the one a signed-in client calls; this exists for
   * the case that one cannot serve — an access token that has already expired. Without
   * it, "sign out" would be impossible for exactly the sessions most likely to need it.
   *
   * Always answers 204. Whether a session was found is not information a caller needs,
   * and a sign-out that reports failure invites a client to retry a thing it should not
   * care about.
   */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const options = cookieOptionsFrom(this.jwt, this.app.isProduction);
    const presented = readCookie(request, REFRESH_COOKIE);

    if (presented) {
      this.assertCsrf(request);
      const session = await this.tokens.sessionForRefreshToken(presented);
      if (session) await this.sessions.logout(session.userId, session.id, false);
    }

    clearAuthCookies(reply, options);
    await reply.status(204).send();
  }

  /**
   * Double-submit: the header must equal the cookie.
   *
   * A cross-origin page can *cause* this request and the browser will attach the
   * cookie, but the same-origin policy stops it from *reading* the cookie to set the
   * header. Constant-time compare because the value is compared repeatedly against
   * attacker-supplied input, and there is no reason to leak how much of it matched.
   */
  private assertCsrf(request: FastifyRequest): void {
    const cookie = readCookie(request, CSRF_COOKIE);
    const header = request.headers[CSRF_HEADER];
    const presented = Array.isArray(header) ? header[0] : header;

    if (!cookie || !presented || !this.secrets.matches(cookie, presented)) {
      throw new UnauthenticatedError();
    }
  }
}
